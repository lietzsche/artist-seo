import shutil
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, int | str]:
    try:
        db.execute(text("SELECT 1"))
        settings.storage_root.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(settings.storage_root)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database or storage unavailable") from exc
    if usage.free < settings.min_free_bytes:
        raise HTTPException(status_code=503, detail="insufficient storage space")
    return {"status": "ready", "free_bytes": usage.free}

