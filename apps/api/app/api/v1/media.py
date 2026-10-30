import hashlib
import fcntl
import json
import os
import shutil
import subprocess
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import require_admin, require_csrf
from app.api.v1.schemas import UploadCompleteOut, UploadInit, UploadOut
from app.core.config import settings
from app.core.database import get_db
from app.models import Admin, Artwork, MediaAsset, MediaJob, UploadSession
from app.models.entities import MediaStatus, UploadStatus
from app.services.storage import LocalStorage

router = APIRouter(prefix="/media", tags=["media"])
IMAGE_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
VIDEO_FORMAT_NAMES = {"mov", "mp4", "matroska,webm"}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _temporary_path(upload: UploadSession) -> Path:
    root = (settings.storage_root / "tmp").resolve()
    path = (root / upload.temporary_key).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=500, detail="잘못된 임시 저장 경로입니다")
    return path


def _capacity_check(db: Session, requested: int) -> None:
    stored = db.scalar(select(func.coalesce(func.sum(MediaAsset.byte_size), 0)).where(MediaAsset.deleted_at.is_(None))) or 0
    reserved = db.scalar(select(func.coalesce(func.sum(UploadSession.expected_bytes), 0)).where(UploadSession.status == UploadStatus.active, UploadSession.expires_at > datetime.now(UTC))) or 0
    if requested > settings.max_file_bytes:
        raise HTTPException(status_code=413, detail=f"파일은 최대 {settings.max_file_bytes}바이트까지 업로드할 수 있습니다")
    if stored + reserved + requested > settings.max_total_bytes:
        raise HTTPException(status_code=507, detail="설정된 전체 저장 용량을 초과합니다")
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(settings.storage_root).free - requested < settings.min_free_bytes:
        raise HTTPException(status_code=507, detail="서버 디스크의 최소 잔여 공간을 확보할 수 없습니다")


def _detect(path: Path) -> tuple[str, str, int | None, int | None, int | None, bool]:
    try:
        with Image.open(path) as image:
            image.verify()
            content_type = IMAGE_FORMATS.get(image.format or "")
        if content_type:
            with Image.open(path) as image:
                return "image", content_type, image.width, image.height, None, False
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        pass
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=format_name,duration:stream=codec_type,width,height,color_transfer", "-of", "json", str(path)],
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=415, detail="지원하는 이미지 또는 영상 파일이 아닙니다") from exc
    probe = json.loads(result.stdout)
    format_info = probe.get("format", {})
    video_stream = next((item for item in probe.get("streams", []) if item.get("codec_type") == "video"), {})
    format_name = format_info.get("format_name", "")
    if format_name not in VIDEO_FORMAT_NAMES and not any(x in format_name.split(",") for x in ("mov", "mp4", "webm", "matroska")):
        raise HTTPException(status_code=415, detail="MP4, MOV, WebM 영상만 지원합니다")
    duration = int(float(format_info.get("duration", "0")) * 1000) if format_info.get("duration") else None
    is_hdr = video_stream.get("color_transfer") in {"smpte2084", "arib-std-b67"}
    return "video", "video/mp4" if "mp4" in format_name or "mov" in format_name else "video/webm", video_stream.get("width"), video_stream.get("height"), duration, is_hdr


@router.post("/uploads", response_model=UploadOut, status_code=201)
def initiate_upload(payload: UploadInit, session=Depends(require_csrf), db: Session = Depends(get_db)) -> UploadOut:
    artwork = db.get(Artwork, payload.artwork_id)
    if not artwork or artwork.deleted_at:
        raise HTTPException(status_code=404, detail="작품을 찾을 수 없습니다")
    _capacity_check(db, payload.total_bytes)
    upload = UploadSession(
        admin_id=session.admin_id,
        artwork_id=artwork.id,
        original_filename=Path(payload.filename).name,
        declared_content_type=payload.content_type.lower(),
        expected_bytes=payload.total_bytes,
        temporary_key=f"uploads/{uuid.uuid4().hex}.part",
        expires_at=datetime.now(UTC) + timedelta(hours=settings.upload_expiry_hours),
    )
    db.add(upload)
    db.commit()
    return UploadOut.model_validate(upload, from_attributes=True)


@router.head("/uploads/{upload_id}")
def upload_status(upload_id: str, admin: Admin = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    upload = db.get(UploadSession, upload_id)
    if not upload or upload.admin_id != admin.id:
        raise HTTPException(status_code=404, detail="업로드를 찾을 수 없습니다")
    return Response(headers={"Upload-Offset": str(upload.received_bytes), "Upload-Length": str(upload.expected_bytes), "Upload-Status": upload.status.value})


@router.patch("/uploads/{upload_id}", status_code=204)
async def append_chunk(upload_id: str, request: Request, offset: int = Header(alias="Upload-Offset"), session=Depends(require_csrf), db: Session = Depends(get_db)) -> Response:
    upload = db.get(UploadSession, upload_id)
    if not upload or upload.admin_id != session.admin_id:
        raise HTTPException(status_code=404, detail="업로드를 찾을 수 없습니다")
    if upload.status != UploadStatus.active or _aware(upload.expires_at) <= datetime.now(UTC):
        raise HTTPException(status_code=409, detail="진행할 수 없는 업로드입니다")
    if offset != upload.received_bytes:
        raise HTTPException(status_code=409, detail="청크 순서가 올바르지 않습니다", headers={"Upload-Offset": str(upload.received_bytes)})
    path = _temporary_path(upload)
    path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with path.open("a+b") as target:
        fcntl.flock(target.fileno(), fcntl.LOCK_EX)
        target.seek(0, os.SEEK_END)
        actual_size = target.tell()
        if actual_size != offset:
            raise HTTPException(status_code=409, detail="서버의 임시 파일 크기와 업로드 위치가 다릅니다", headers={"Upload-Offset": str(actual_size)})
        try:
            async for chunk in request.stream():
                if offset + written + len(chunk) > upload.expected_bytes:
                    raise HTTPException(status_code=413, detail="선언한 파일 크기를 초과했습니다")
                target.write(chunk)
                written += len(chunk)
            target.flush()
            os.fsync(target.fileno())
            upload.received_bytes += written
            db.commit()
        except BaseException:
            target.truncate(offset)
            target.flush()
            os.fsync(target.fileno())
            raise
    return Response(status_code=204, headers={"Upload-Offset": str(upload.received_bytes)})


@router.post("/uploads/{upload_id}/complete", response_model=UploadCompleteOut)
def complete_upload(upload_id: str, session=Depends(require_csrf), db: Session = Depends(get_db)) -> UploadCompleteOut:
    upload = db.get(UploadSession, upload_id)
    if not upload or upload.admin_id != session.admin_id:
        raise HTTPException(status_code=404, detail="업로드를 찾을 수 없습니다")
    if upload.status != UploadStatus.active:
        raise HTTPException(status_code=409, detail="이미 종료된 업로드입니다")
    path = _temporary_path(upload)
    if not path.is_file() or path.stat().st_size != upload.expected_bytes or upload.received_bytes != upload.expected_bytes:
        raise HTTPException(status_code=409, detail="아직 모든 바이트가 업로드되지 않았습니다")
    media_type, content_type, width, height, duration_ms, source_is_hdr = _detect(path)
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    sha256 = digest.hexdigest()
    suffix = {"image/jpeg":".jpg", "image/png":".png", "image/webp":".webp", "video/mp4":".mp4", "video/webm":".webm"}[content_type]
    original_key = f"{upload.artwork_id}/{uuid.uuid4().hex}{suffix}"
    original_storage = LocalStorage(settings.storage_root / "originals")
    try:
        with path.open("rb") as source:
            copied = original_storage.put(original_key, source)
        if copied != upload.expected_bytes:
            original_storage.delete(original_key)
            raise HTTPException(status_code=500, detail="원본 저장 검증에 실패했습니다")
    except Exception:
        raise
    media = MediaAsset(artwork_id=upload.artwork_id, original_key=original_key, original_filename=upload.original_filename, media_type=media_type, content_type=content_type, byte_size=copied, sha256=sha256, width=width, height=height, duration_ms=duration_ms, source_is_hdr=source_is_hdr, status=MediaStatus.pending)
    db.add(media)
    db.flush()
    job = MediaJob(media_id=media.id, kind=f"process_{media_type}")
    db.add(job)
    upload.status = UploadStatus.completed
    try:
        db.commit()
    except Exception:
        db.rollback()
        original_storage.delete(original_key)
        raise
    path.unlink(missing_ok=True)
    return UploadCompleteOut(media_id=media.id, job_id=job.id, sha256=sha256, content_type=content_type, byte_size=copied)


@router.delete("/uploads/{upload_id}", status_code=204)
def cancel_upload(upload_id: str, session=Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    upload = db.get(UploadSession, upload_id)
    if not upload or upload.admin_id != session.admin_id:
        raise HTTPException(status_code=404, detail="업로드를 찾을 수 없습니다")
    if upload.status == UploadStatus.active:
        _temporary_path(upload).unlink(missing_ok=True)
        upload.status = UploadStatus.cancelled
        db.commit()


@router.get("/{media_id}/original")
def download_original(media_id: str, range_header: str | None = Header(default=None, alias="Range"), _: Admin = Depends(require_admin), db: Session = Depends(get_db)) -> StreamingResponse:
    media = db.get(MediaAsset, media_id)
    if not media or media.deleted_at:
        raise HTTPException(status_code=404, detail="원본을 찾을 수 없습니다")
    storage = LocalStorage(settings.storage_root / "originals")
    try:
        size = int(storage.stat(media.original_key)["size"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="원본 파일이 없습니다") from exc
    start, end, response_status = 0, size - 1, 200
    if range_header:
        if not range_header.startswith("bytes=") or "," in range_header:
            raise HTTPException(status_code=416, detail="지원하지 않는 Range입니다", headers={"Content-Range": f"bytes */{size}"})
        try:
            first, last = range_header[6:].split("-", 1)
            start = int(first) if first else max(0, size - int(last))
            end = int(last) if last else size - 1
        except ValueError as exc:
            raise HTTPException(status_code=416, detail="Range 형식이 올바르지 않습니다", headers={"Content-Range": f"bytes */{size}"}) from exc
        if start < 0 or end < start or end >= size:
            raise HTTPException(status_code=416, detail="Range가 파일 범위를 벗어났습니다", headers={"Content-Range": f"bytes */{size}"})
        response_status = 206
    headers = {"Accept-Ranges":"bytes", "Content-Length":str(end-start+1), "Content-Disposition":f"attachment; filename*=UTF-8''{quote(media.original_filename)}", "Cache-Control":"private, no-store"}
    if response_status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(storage.open(media.original_key, start, end), status_code=response_status, media_type=media.content_type, headers=headers)
