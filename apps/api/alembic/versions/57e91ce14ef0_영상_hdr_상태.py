"""영상 HDR 상태

Revision ID: 57e91ce14ef0
Revises: 41bf38de322a
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "57e91ce14ef0"
down_revision: Union[str, None] = "41bf38de322a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("media_assets", sa.Column("poster_key", sa.String(500), nullable=True))
    op.create_unique_constraint("uq_media_assets_poster_key", "media_assets", ["poster_key"])
    op.add_column("media_assets", sa.Column("source_is_hdr", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("media_assets", sa.Column("hdr_to_sdr", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_constraint("uq_media_assets_poster_key", "media_assets", type_="unique")
    op.drop_column("media_assets", "poster_key")
    op.drop_column("media_assets", "hdr_to_sdr")
    op.drop_column("media_assets", "source_is_hdr")
