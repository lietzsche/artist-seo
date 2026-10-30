import secrets
import hashlib
from datetime import UTC, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session
from app.api.deps import SESSION_COOKIE, current_session, require_csrf
from app.api.v1.schemas import LoginIn
from app.core.config import settings
from app.core.database import get_db
from app.core.security import expires_in, hash_password, new_session_token, verify_password
from app.models import Admin, AdminSession, LoginAttempt

router = APIRouter(prefix="/auth", tags=["auth"])
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def _aware(value: datetime | None) -> datetime | None:
    return value if not value or value.tzinfo else value.replace(tzinfo=UTC)


def _attempt_key(request: Request, email: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return hashlib.sha256(f"{settings.app_secret_key}:{client_ip}:{email.lower()}".encode()).hexdigest()


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    now = datetime.now(UTC)
    key = _attempt_key(request, payload.email)
    attempt = db.get(LoginAttempt, key)
    if attempt and _aware(attempt.locked_until) and _aware(attempt.locked_until) > now:
        raise HTTPException(status_code=429, detail="로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요")
    admin = db.scalar(select(Admin).where(Admin.email == payload.email.lower()))
    password_valid = verify_password(admin.password_hash if admin else DUMMY_PASSWORD_HASH, payload.password)
    if not admin or not admin.is_active or not password_valid:
        window = timedelta(minutes=settings.login_window_minutes)
        if not attempt or (_aware(attempt.window_started_at) or now) + window <= now:
            attempt = LoginAttempt(key_hash=key, attempts=1, window_started_at=now)
            db.merge(attempt)
        else:
            attempt.attempts += 1
        if attempt.attempts >= settings.login_max_attempts:
            attempt.locked_until = now + window
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    if attempt:
        db.delete(attempt)
    return _start_session(admin, response, db)


def _start_session(admin: Admin, response: Response, db: Session) -> dict[str, str]:
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


def _has_admin(db: Session) -> bool:
    return bool(db.scalar(select(func.count()).select_from(Admin)))


@router.get("/setup")
def setup_status(db: Session = Depends(get_db)) -> dict[str, bool]:
    return {"needs_setup": not _has_admin(db)}


@router.post("/setup", status_code=status.HTTP_201_CREATED)
def setup(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    """관리자가 하나도 없을 때만 첫 관리자 계정을 만들고 바로 로그인시킨다."""
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != settings.public_origin.rstrip("/"):
        raise HTTPException(status_code=403, detail="허용되지 않은 Origin입니다")
    if db.get_bind().dialect.name == "postgresql":
        # 동시에 들어온 설정 요청이 관리자를 둘 만들지 않도록 막는다
        db.execute(text("LOCK TABLE admins IN EXCLUSIVE MODE"))
    if _has_admin(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="관리자 계정이 이미 설정되어 있습니다")
    admin = Admin(email=payload.email.lower(), password_hash=hash_password(payload.password))
    db.add(admin)
    db.flush()
    return _start_session(admin, response, db)


@router.get("/me")
def me(session: AdminSession = Depends(current_session)) -> dict[str, str]:
    return {"email": session.admin.email, "csrf_token": session.csrf_token}


@router.post("/logout")
def logout(response: Response, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict[str, bool]:
    session.revoked_at = datetime.now(UTC)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

