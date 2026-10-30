import argparse
import getpass
from datetime import UTC, datetime
from sqlalchemy import select, update
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password, verify_password
from app.models import Admin, AdminSession


def _ask_password() -> str:
    password = getpass.getpass("새 비밀번호(10자 이상): ")
    if len(password) < 10:
        raise SystemExit("비밀번호는 10자 이상이어야 합니다")
    return password


def _admin(command: str, email: str) -> None:
    password = _ask_password()
    with SessionLocal() as db:
        admin = db.scalar(select(Admin).where(Admin.email == email.lower()))
        if command == "create-admin":
            if admin:
                raise SystemExit("이미 존재하는 관리자입니다")
            db.add(Admin(email=email.lower(), password_hash=hash_password(password)))
        else:
            if not admin:
                raise SystemExit("관리자를 찾을 수 없습니다")
            admin.password_hash = hash_password(password)
            db.execute(update(AdminSession).where(AdminSession.admin_id == admin.id, AdminSession.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
        db.commit()
    print("관리자 정보가 저장되었습니다")


def sync_admin(db, email: str, password: str) -> str:
    """.env의 ADMIN_EMAIL/ADMIN_PASSWORD 계정을 만들거나, 비밀번호가 바뀌었으면 맞춘다."""
    from pydantic import EmailStr, TypeAdapter, ValidationError

    try:
        email = TypeAdapter(EmailStr).validate_python(email.strip()).lower()
    except ValidationError:
        raise SystemExit(f"ADMIN_EMAIL 형식이 올바르지 않습니다: {email}") from None
    if len(password) < 10:
        raise SystemExit("ADMIN_PASSWORD는 10자 이상이어야 합니다")
    admin = db.scalar(select(Admin).where(Admin.email == email))
    if not admin:
        db.add(Admin(email=email, password_hash=hash_password(password)))
        db.commit()
        return f"관리자 생성: {email}"
    if verify_password(admin.password_hash, password) and admin.is_active:
        return f"관리자 확인: {email} (변경 없음)"
    admin.password_hash = hash_password(password)
    admin.is_active = True
    db.execute(update(AdminSession).where(AdminSession.admin_id == admin.id, AdminSession.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
    db.commit()
    return f"관리자 비밀번호 갱신: {email} (기존 로그인 세션 취소)"


def _sync_admin_from_env() -> None:
    if not settings.admin_email and not settings.admin_password:
        return
    if not settings.admin_email or not settings.admin_password:
        raise SystemExit("ADMIN_EMAIL과 ADMIN_PASSWORD는 함께 설정해야 합니다")
    with SessionLocal() as db:
        print(f"[admin] {sync_admin(db, settings.admin_email, settings.admin_password)}")


def _seed(if_enabled: bool) -> None:
    if if_enabled and not settings.seed_demo_data:
        return
    from app.services.seed import seed_demo

    with SessionLocal() as db:
        for line in seed_demo(db):
            print(f"[seed] {line}")


def main() -> None:
    parser = argparse.ArgumentParser(description="관리자 계정과 데모 데이터 관리")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("create-admin").add_argument("email")
    sub.add_parser("reset-password").add_argument("email")
    seed = sub.add_parser("seed-demo", help="기능별 테스트용 데모 데이터 생성(여러 번 실행해도 중복 없음)")
    seed.add_argument("--if-enabled", action="store_true", help="SEED_DEMO_DATA=true일 때만 실행")
    sub.add_parser("sync-admin", help="ADMIN_EMAIL/ADMIN_PASSWORD 값으로 관리자 계정 생성·갱신(값이 없으면 아무것도 안 함)")
    args = parser.parse_args()
    if args.command == "sync-admin":
        _sync_admin_from_env()
    elif args.command == "seed-demo":
        _seed(args.if_enabled)
    else:
        _admin(args.command, args.email)


if __name__ == "__main__":
    main()
