from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from app.models.entities import SaleStatus


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)


class SetupIn(LoginIn):
    artist_name: str = Field(default="", max_length=120)


class ProfileIn(BaseModel):
    name: str = Field(default="", max_length=120)
    headline: str = Field(default="", max_length=300)
    intro: str = Field(default="", max_length=2000)
    bio: str = Field(default="", max_length=10000)
    cv: str = Field(default="", max_length=10000)
    location: str = Field(default="", max_length=120)
    # 영어 페이지용 (비어 있으면 한국어 값을 대신 보여준다)
    name_en: str = Field(default="", max_length=120)
    headline_en: str = Field(default="", max_length=300)
    intro_en: str = Field(default="", max_length=2000)
    bio_en: str = Field(default="", max_length=10000)
    cv_en: str = Field(default="", max_length=10000)
    location_en: str = Field(default="", max_length=120)


class ProfileOut(ProfileIn):
    model_config = ConfigDict(from_attributes=True)


class ArtworkIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=200)
    title: str = Field(min_length=1, max_length=300)
    year: int | None = Field(default=None, ge=1000, le=2200)
    medium: str = Field(default="", max_length=300)
    dimensions: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=10000)
    price_text: str | None = Field(default=None, max_length=100)
    title_en: str = Field(default="", max_length=300)
    medium_en: str = Field(default="", max_length=300)
    description_en: str = Field(default="", max_length=10000)
    price_text_en: str | None = Field(default=None, max_length=100)
    show_price: bool = False
    sale_status: SaleStatus = SaleStatus.unavailable
    is_published: bool = False
    featured: bool = False
    series_id: str | None = None


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    public_key: str | None
    poster_key: str | None
    media_type: str
    content_type: str
    width: int | None
    height: int | None
    source_is_hdr: bool
    hdr_to_sdr: bool
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


class UploadInit(BaseModel):
    artwork_id: str
    filename: str = Field(min_length=1, max_length=500)
    content_type: str = Field(min_length=1, max_length=100)
    total_bytes: int = Field(gt=0)


class UploadOut(BaseModel):
    id: str
    status: str
    expected_bytes: int
    received_bytes: int
    expires_at: datetime


class UploadCompleteOut(BaseModel):
    media_id: str
    job_id: str
    sha256: str
    content_type: str
    byte_size: int


class SeriesIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    name_en: str = Field(default="", max_length=200)
    description_en: str = Field(default="", max_length=5000)
    sort_order: int = Field(default=0, ge=0, le=100000)


class SeriesOut(SeriesIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


class ExhibitionIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=200)
    title: str = Field(min_length=1, max_length=300)
    venue: str = Field(default="", max_length=300)
    location: str = Field(default="", max_length=300)
    start_date: date | None = None
    end_date: date | None = None
    description: str = Field(default="", max_length=10000)
    title_en: str = Field(default="", max_length=300)
    venue_en: str = Field(default="", max_length=300)
    location_en: str = Field(default="", max_length=300)
    description_en: str = Field(default="", max_length=10000)
    is_published: bool = False
    sort_order: int = Field(default=0, ge=0, le=100000)

    @model_validator(mode="after")
    def valid_dates(self) -> "ExhibitionIn":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("종료일은 시작일보다 빠를 수 없습니다")
        return self


class ExhibitionOut(ExhibitionIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime
