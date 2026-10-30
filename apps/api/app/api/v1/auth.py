import secrets
from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import SESSION_COOKIE, current_session, require_csrf
from app.api.v1.schemas import LoginIn
from app.core.config import settings
from app.core.database import get_db
from app.core.security import expires_in, new_session_token, verify_password
from app.models import Admin, AdminSession

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    admin = db.scalar(select(Admin).where(Admin.email == payload.email.lower()))
    if not admin or not admin.is_active or not verify_password(admin.password_hash, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    token, token_hash = new_session_token()
    csrf = secrets.token_hex(32)
    db.add(AdminSession(admin_id=admin.id, token_hash=token_hash, csrf_token=csrf, expires_at=expires_in(24)))
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=86400,
        path="/",
    )
    return {"csrf_token": csrf, "email": admin.email}


@router.get("/me")
def me(session: AdminSession = Depends(current_session)) -> dict[str, str]:
    return {"email": session.admin.email, "csrf_token": session.csrf_token}


@router.post("/logout")
def logout(response: Response, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict[str, bool]:
    session.revoked_at = datetime.now(UTC)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

