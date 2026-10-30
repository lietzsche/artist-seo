"""업로드 세션

Revision ID: 41bf38de322a
Revises: ec7f67fe57b1
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "41bf38de322a"
down_revision: Union[str, None] = "ec7f67fe57b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "upload_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("admin_id", sa.String(36), sa.ForeignKey("admins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("artwork_id", sa.String(36), sa.ForeignKey("artworks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("declared_content_type", sa.String(100), nullable=False),
        sa.Column("expected_bytes", sa.BigInteger(), nullable=False),
        sa.Column("received_bytes", sa.BigInteger(), nullable=False),
        sa.Column("temporary_key", sa.String(500), nullable=False, unique=True),
        sa.Column("status", sa.Enum("active", "completed", "cancelled", "failed", name="uploadstatus"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_upload_sessions_admin_id", "upload_sessions", ["admin_id"])
    op.create_index("ix_upload_sessions_artwork_id", "upload_sessions", ["artwork_id"])
    op.create_index("ix_upload_sessions_status", "upload_sessions", ["status"])
    op.create_index("ix_upload_sessions_expires_at", "upload_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_table("upload_sessions")
    sa.Enum(name="uploadstatus").drop(op.get_bind(), checkfirst=True)
