"""로그인 시도 제한

Revision ID: d945a6f102a1
Revises: 57e91ce14ef0
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d945a6f102a1"
down_revision: Union[str, None] = "57e91ce14ef0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_attempts",
        sa.Column("key_hash", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_login_attempts_locked_until", "login_attempts", ["locked_until"])


def downgrade() -> None:
    op.drop_table("login_attempts")
