from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.entities import SaleStatus


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)


class ArtworkIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=200)
    title: str = Field(min_length=1, max_length=300)
    year: int | None = Field(default=None, ge=1000, le=2200)
    medium: str = Field(default="", max_length=300)
    dimensions: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=10000)
    price_text: str | None = Field(default=None, max_length=100)
    show_price: bool = False
    sale_status: SaleStatus = SaleStatus.unavailable
    is_published: bool = False
    featured: bool = False
    series_id: str | None = None


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    public_key: str | None
    media_type: str
    content_type: str
    width: int | None
    height: int | None
    status: str
    is_primary: bool


class ArtworkOut(ArtworkIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime
    media: list[MediaOut] = []


class InquiryIn(BaseModel):
    artwork_id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    message: str = Field(min_length=10, max_length=5000)
    consent: bool
    website: str = Field(default="", max_length=0)


class InquiryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    artwork_id: str | None
    name: str
    email: EmailStr
    message: str
    status: str
    created_at: datetime
