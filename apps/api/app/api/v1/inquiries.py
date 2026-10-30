import hashlib
from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import require_admin, require_csrf
from app.api.v1.schemas import InquiryIn, InquiryOut
from app.core.config import settings
from app.core.database import get_db
from app.models import Artwork, Inquiry

router = APIRouter(prefix="/inquiries", tags=["inquiries"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: InquiryIn, request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    if not payload.consent:
        raise HTTPException(status_code=422, detail="개인정보 수집 동의가 필요합니다")
    if payload.artwork_id:
        artwork = db.get(Artwork, payload.artwork_id)
        if not artwork or not artwork.is_published or artwork.deleted_at:
            raise HTTPException(status_code=404, detail="문의할 작품을 찾을 수 없습니다")
    ip = request.client.host if request.client else "unknown"
    bucket = datetime.now(UTC).strftime("%Y%m%d%H")
    fingerprint = hashlib.sha256(f"{settings.app_secret_key}:{ip}:{payload.email.lower()}".encode()).hexdigest()
    inquiry = Inquiry(**payload.model_dump(exclude={"website"}), fingerprint=fingerprint, created_bucket=bucket)
    db.add(inquiry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=429, detail="잠시 후 다시 문의해 주세요") from None
    return {"id": inquiry.id, "message": "문의가 접수되었습니다"}


@router.get("/admin", response_model=list[InquiryOut], dependencies=[Depends(require_admin)])
def list_inquiries(db: Session = Depends(get_db)) -> list[Inquiry]:
    return list(db.scalars(select(Inquiry).where(Inquiry.deleted_at.is_(None)).order_by(Inquiry.created_at.desc())).all())


@router.delete("/admin/{inquiry_id}", status_code=204)
def delete_inquiry(inquiry_id: str, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    inquiry = db.get(Inquiry, inquiry_id)
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다")
    inquiry.deleted_at = datetime.now(UTC)
    inquiry.name = "삭제됨"
    inquiry.email = "deleted@invalid.local"
    inquiry.message = "삭제 요청으로 개인정보가 제거되었습니다."
    db.commit()

