import argparse
import getpass
from sqlalchemy import select
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Admin


def main() -> None:
    parser = argparse.ArgumentParser(description="관리자 계정 관리")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-admin")
    create.add_argument("email")
    reset = sub.add_parser("reset-password")
    reset.add_argument("email")
    args = parser.parse_args()
    password = getpass.getpass("새 비밀번호(10자 이상): ")
    if len(password) < 10:
        raise SystemExit("비밀번호는 10자 이상이어야 합니다")
    with SessionLocal() as db:
        admin = db.scalar(select(Admin).where(Admin.email == args.email.lower()))
        if args.command == "create-admin":
            if admin:
                raise SystemExit("이미 존재하는 관리자입니다")
            db.add(Admin(email=args.email.lower(), password_hash=hash_password(password)))
        else:
            if not admin:
                raise SystemExit("관리자를 찾을 수 없습니다")
            admin.password_hash = hash_password(password)
        db.commit()
    print("관리자 정보가 저장되었습니다")


if __name__ == "__main__":
    main()

