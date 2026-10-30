"""작가 프로필

Revision ID: b3d81f0c2a47
Revises: 85c2a7f3b919
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b3d81f0c2a47"
down_revision: Union[str, None] = "85c2a7f3b919"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "artist_profile",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("headline", sa.String(300), nullable=False),
        sa.Column("intro", sa.Text(), nullable=False),
        sa.Column("bio", sa.Text(), nullable=False),
        sa.Column("cv", sa.Text(), nullable=False),
        sa.Column("location", sa.String(120), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_artist_profile_single_row"),
    )


def downgrade() -> None:
    op.drop_table("artist_profile")
