import enum
import uuid
from datetime import UTC, date, datetime
from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def uuid_str() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class SaleStatus(str, enum.Enum):
    unavailable = "unavailable"
    available = "available"
    sold = "sold"


class MediaStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class UploadStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"
    failed = "failed"


class Admin(Base):
    __tablename__ = "admins"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AdminSession(Base):
    __tablename__ = "admin_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    admin_id: Mapped[str] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    admin: Mapped[Admin] = relationship()


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Series(Base):
    __tablename__ = "series"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Exhibition(Base):
    __tablename__ = "exhibitions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    venue: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(300), default="")
    start_date: Mapped[date | None]
    end_date: Mapped[date | None]
    description: Mapped[str] = mapped_column(Text, default="")
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Artwork(Base):
    __tablename__ = "artworks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    year: Mapped[int | None] = mapped_column(Integer)
    medium: Mapped[str] = mapped_column(String(300), default="")
    dimensions: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    price_text: Mapped[str | None] = mapped_column(String(100))
    show_price: Mapped[bool] = mapped_column(Boolean, default=False)
    sale_status: Mapped[SaleStatus] = mapped_column(Enum(SaleStatus), default=SaleStatus.unavailable)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    series_id: Mapped[str | None] = mapped_column(ForeignKey("series.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    series: Mapped[Series | None] = relationship()
    media: Mapped[list["MediaAsset"]] = relationship(back_populates="artwork", order_by="MediaAsset.sort_order")


class MediaAsset(Base):
    __tablename__ = "media_assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    artwork_id: Mapped[str] = mapped_column(ForeignKey("artworks.id", ondelete="CASCADE"), index=True)
    backend: Mapped[str] = mapped_column(String(40), default="local")
    original_key: Mapped[str] = mapped_column(String(500), unique=True)
    public_key: Mapped[str | None] = mapped_column(String(500), unique=True)
    poster_key: Mapped[str | None] = mapped_column(String(500), unique=True)
    original_filename: Mapped[str] = mapped_column(String(500))
    media_type: Mapped[str] = mapped_column(String(20))
    content_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    source_is_hdr: Mapped[bool] = mapped_column(Boolean, default=False)
    hdr_to_sdr: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[MediaStatus] = mapped_column(Enum(MediaStatus), default=MediaStatus.pending)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    artwork: Mapped[Artwork] = relationship(back_populates="media")


class MediaJob(Base):
    __tablename__ = "media_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    media_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    lease_owner: Mapped[str | None] = mapped_column(String(100))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class UploadSession(Base):
    __tablename__ = "upload_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    admin_id: Mapped[str] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"), index=True)
    artwork_id: Mapped[str] = mapped_column(ForeignKey("artworks.id", ondelete="CASCADE"), index=True)
    original_filename: Mapped[str] = mapped_column(String(500))
    declared_content_type: Mapped[str] = mapped_column(String(100))
    expected_bytes: Mapped[int] = mapped_column(BigInteger)
    received_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    temporary_key: Mapped[str] = mapped_column(String(500), unique=True)
    status: Mapped[UploadStatus] = mapped_column(Enum(UploadStatus), default=UploadStatus.active, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Inquiry(Base):
    __tablename__ = "inquiries"
    __table_args__ = (UniqueConstraint("fingerprint", "created_bucket", name="uq_inquiry_rate_bucket"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    artwork_id: Mapped[str | None] = mapped_column(ForeignKey("artworks.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    message: Mapped[str] = mapped_column(Text)
    consent: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(30), default="new")
    fingerprint: Mapped[str] = mapped_column(String(64))
    created_bucket: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
