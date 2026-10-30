import shutil
from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import require_admin, require_csrf
from app.core.config import settings
from app.core.database import get_db
from app.models import Inquiry, MediaAsset, MediaJob, UploadSession
from app.models.entities import MediaStatus, UploadStatus

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", dependencies=[Depends(require_admin)])
def overview(db: Session = Depends(get_db)) -> dict:
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    disk = shutil.disk_usage(settings.storage_root)
    stored = int(db.scalar(select(func.coalesce(func.sum(MediaAsset.byte_size), 0)).where(MediaAsset.deleted_at.is_(None))) or 0)
    reserved = int(db.scalar(select(func.coalesce(func.sum(UploadSession.expected_bytes), 0)).where(UploadSession.status == UploadStatus.active, UploadSession.expires_at > datetime.now(UTC))) or 0)
    failed_jobs = db.scalars(select(MediaJob).where(MediaJob.status == "failed").order_by(MediaJob.updated_at.desc()).limit(10)).all()
    inquiry_count = int(db.scalar(select(func.count()).select_from(Inquiry).where(Inquiry.deleted_at.is_(None), Inquiry.status == "new")) or 0)
    return {
        "storage": {"stored_bytes": stored, "reserved_bytes": reserved, "max_total_bytes": settings.max_total_bytes, "disk_free_bytes": disk.free, "min_free_bytes": settings.min_free_bytes, "max_file_bytes": settings.max_file_bytes},
        "new_inquiries": inquiry_count,
        "failed_jobs": [{"id": job.id, "media_id": job.media_id, "kind": job.kind, "attempts": job.attempts, "max_attempts": job.max_attempts, "error": job.error, "updated_at": job.updated_at} for job in failed_jobs],
    }


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> dict[str, str]:
    job = db.get(MediaJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status not in {"failed", "queued"}:
        raise HTTPException(status_code=409, detail="현재 상태에서는 재시도할 수 없습니다")
    media = db.get(MediaAsset, job.media_id)
    if not media or media.deleted_at:
        raise HTTPException(status_code=409, detail="대상 미디어가 삭제되었거나 없습니다")
    job.status = "queued"
    job.attempts = 0
    job.progress = 0
    job.error = None
    job.lease_owner = None
    job.lease_expires_at = None
    media.status = MediaStatus.pending
    db.commit()
    return {"status": "queued"}
