import os
import signal
import socket
import time
from datetime import UTC, datetime, timedelta
from sqlalchemy import or_, select
from app.core.database import SessionLocal
from app.models import MediaJob

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


def run() -> None:
    owner = f"{socket.gethostname()}:{os.getpid()}"
    while not stopping:
        job_id = claim_job(owner)
        if not job_id:
            time.sleep(2)
            continue
        with SessionLocal.begin() as db:
            job = db.get(MediaJob, job_id)
            if job:
                job.status = "failed"
                job.error = "변환 구현이 아직 연결되지 않았습니다"


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    run()
