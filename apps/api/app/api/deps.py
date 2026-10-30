from datetime import UTC, datetime
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_token
from app.models import Admin, AdminSession

SESSION_COOKIE = "artist_admin_session"


def current_session(
    request: Request,
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> AdminSession:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다")
    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == hash_token(token)))
    now = datetime.now(UTC)
    expires_at = session.expires_at if session and session.expires_at.tzinfo else (session.expires_at.replace(tzinfo=UTC) if session else now)
    if not session or session.revoked_at or expires_at < now or not session.admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="세션이 만료되었습니다")
    request.state.admin = session.admin
    return session


def require_admin(session: AdminSession = Depends(current_session)) -> Admin:
    return session.admin


def require_csrf(
    request: Request,
    session: AdminSession = Depends(current_session),
    csrf: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AdminSession:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != settings.public_origin.rstrip("/"):
        raise HTTPException(status_code=403, detail="허용되지 않은 Origin입니다")
    if not csrf or csrf != session.csrf_token:
        raise HTTPException(status_code=403, detail="CSRF 토큰이 올바르지 않습니다")
    return session

