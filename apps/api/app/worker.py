import os
import signal
import socket
import time
from datetime import UTC, datetime, timedelta
from sqlalchemy import or_, select
from app.core.database import SessionLocal
from app.models import MediaAsset, MediaJob
from app.models.entities import MediaStatus
from app.services.media_processor import process_image, process_video

stopping = False


def stop(*_: object) -> None:
    global stopping
    stopping = True


def claim_job(owner: str) -> str | None:
    now = datetime.now(UTC)
    with SessionLocal.begin() as db:
        job = db.scalar(
            select(MediaJob)
            .where(MediaJob.attempts < MediaJob.max_attempts, or_(MediaJob.status == "queued", (MediaJob.status == "running") & (MediaJob.lease_expires_at < now)))
            .order_by(MediaJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not job:
            return None
        job.status = "running"
        job.attempts += 1
        job.lease_owner = owner
        job.lease_expires_at = now + timedelta(minutes=5)
        return job.id


def heartbeat_job(job_id: str) -> None:
    if stopping:
        raise InterruptedError("worker가 종료 중입니다")
    with SessionLocal.begin() as db:
        job = db.get(MediaJob, job_id)
        if not job or job.status != "running":
            raise RuntimeError("작업 lease를 잃었습니다")
        job.lease_expires_at = datetime.now(UTC) + timedelta(minutes=5)


def execute_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(MediaJob, job_id)
        media = db.get(MediaAsset, job.media_id) if job else None
        if not job or not media:
            return
        media_id = media.id
        media_type = media.media_type
        db.expunge(media)
    try:
        if media_type == "image":
            public_key, poster_key, hdr_to_sdr = process_image(media), None, False
        elif media_type == "video":
            public_key, poster_key, hdr_to_sdr = process_video(media, heartbeat=lambda: heartbeat_job(job_id))
        else:
            raise RuntimeError("지원하지 않는 미디어 유형입니다")
    except Exception as exc:
        with SessionLocal.begin() as db:
            job = db.get(MediaJob, job_id)
            media = db.get(MediaAsset, media_id)
            if job:
                job.error = str(exc)[:2000]
                job.lease_owner = None
                job.lease_expires_at = None
                job.status = "queued" if job.attempts < job.max_attempts else "failed"
            if media and job and job.status == "failed":
                media.status = MediaStatus.failed
        return
    with SessionLocal.begin() as db:
        job = db.get(MediaJob, job_id)
        media = db.get(MediaAsset, media_id)
        if job and media:
            media.public_key = public_key
            media.poster_key = poster_key
            media.hdr_to_sdr = hdr_to_sdr
            media.status = MediaStatus.ready
            job.status = "completed"
            job.progress = 100
            job.error = None
            job.lease_owner = None
            job.lease_expires_at = None


def run() -> None:
    owner = f"{socket.gethostname()}:{os.getpid()}"
    while not stopping:
        job_id = claim_job(owner)
        if not job_id:
            time.sleep(2)
            continue
        execute_job(job_id)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    run()
