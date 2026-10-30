"""전시

Revision ID: 85c2a7f3b919
Revises: d945a6f102a1
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "85c2a7f3b919"
down_revision: Union[str, None] = "d945a6f102a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exhibitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("venue", sa.String(300), nullable=False),
        sa.Column("location", sa.String(300), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_exhibitions_slug", "exhibitions", ["slug"], unique=True)
    op.create_index("ix_exhibitions_is_published", "exhibitions", ["is_published"])


def downgrade() -> None:
    op.drop_table("exhibitions")
