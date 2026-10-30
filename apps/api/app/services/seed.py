"""기능별 수동 테스트용 데모 데이터.

모든 데이터의 슬러그는 `demo-`로 시작한다. 같은 슬러그가 이미 있으면 건너뛰므로
여러 번 실행해도 중복 생성되지 않는다. 관리자 계정은 만들지 않는다(첫 설정 화면을 시험할 수 있도록).
"""
import hashlib
import shutil
import subprocess
import tempfile
import uuid
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import ArtistProfile, Artwork, Exhibition, Inquiry, MediaAsset, MediaJob, Series
from app.models.entities import SaleStatus
from app.services.storage import LocalStorage

PROFILE = {
    "name": "데모 작가",
    "headline": "빛과 표면에 관한 기록",
    "intro": "이 사이트는 테스트용 데모 데이터로 채워져 있습니다. 관리자 화면의 '작가 프로필'에서 실제 정보로 바꿀 수 있습니다.",
    "bio": "데모 작가는 기능 시험을 위해 만든 가상의 작가입니다.\n일상의 표면에 머무는 빛을 회화와 영상으로 기록한다는 설정입니다.",
    "cv": "2024 데모 예술대학 회화과 졸업\n2025 첫 개인전 《데모 전시》",
    "location": "서울",
}

SERIES = [
    {"name": "빛의 층위", "description": "아침 빛을 겹겹이 쌓은 회화 연작", "sort_order": 1},
    {"name": "도시의 밤", "description": "밤 창문의 빛을 기록한 연작", "sort_order": 2},
]

# (slug, 제목, 시리즈 순번, 미디어, 추가 속성) — 각 항목이 시험하는 기능을 note에 적는다
ARTWORKS = [
    {"slug": "demo-morning-light", "title": "아침의 빛", "series": 0, "media": ("image", (2400, 1600), "#e9c46a"),
     "note": "공개·선정·판매 중·가격 공개", "fields": {"year": 2025, "medium": "캔버스에 유채", "dimensions": "120 × 80 cm", "price_text": "3,000,000원", "show_price": True, "sale_status": SaleStatus.available, "is_published": True, "featured": True}},
    {"slug": "demo-layered-surface", "title": "겹쳐진 표면", "series": 0, "media": ("image", (1200, 1800), "#8ab17d"),
     "note": "공개·판매 중·가격 비공개(문의 유도)·세로 이미지", "fields": {"year": 2025, "medium": "종이에 아크릴", "dimensions": "60 × 90 cm", "price_text": "4,500,000원", "show_price": False, "sale_status": SaleStatus.available, "is_published": True, "featured": True}},
    {"slug": "demo-night-window", "title": "밤의 창", "series": 1, "media": ("image", (1600, 1600), "#264653"),
     "note": "공개·판매 완료", "fields": {"year": 2024, "medium": "캔버스에 유채", "dimensions": "100 × 100 cm", "sale_status": SaleStatus.sold, "is_published": True}},
    {"slug": "demo-moving-light", "title": "움직이는 빛", "series": 1, "media": ("video", (1280, 720), None),
     "note": "공개·영상 작품(ffmpeg 없으면 이미지로 대체)", "fields": {"year": 2026, "medium": "단채널 영상, 4초", "sale_status": SaleStatus.unavailable, "is_published": True}},
    {"slug": "demo-no-media", "title": "이미지 없는 작품", "series": None, "media": None,
     "note": "공개·미디어 없음(자리표시 박스)", "fields": {"year": 2026, "medium": "설치", "is_published": True}},
    {"slug": "demo-draft-study", "title": "비공개 습작", "series": None, "media": ("image", (1600, 1200), "#e76f51"),
     "note": "비공개 — 공개 목록에 없고 주소로 들어가도 404", "fields": {"year": 2026, "medium": "종이에 연필", "is_published": False}},
    {"slug": "demo-trashed-work", "title": "휴지통 작품", "series": None, "media": None,
     "note": "공개였지만 삭제됨 — 어디에도 보이지 않음", "fields": {"year": 2023, "is_published": True}, "trashed": True},
]

EXHIBITIONS = [
    {"slug": "demo-current-show", "title": "데모 개인전: 표면의 시간", "venue": "데모 갤러리", "location": "서울", "offset_days": (-10, 30), "description": "현재 진행 중인 공개 전시입니다.", "is_published": True, "sort_order": 1},
    {"slug": "demo-past-show", "title": "데모 단체전", "venue": "데모 미술관", "location": "부산", "fixed": (date(2025, 3, 1), date(2025, 4, 30)), "description": "지난 공개 전시입니다.", "is_published": True, "sort_order": 2},
    {"slug": "demo-private-show", "title": "준비 중인 전시(비공개)", "venue": "미정", "location": "", "fixed": (None, None), "description": "비공개 전시라 공개 화면에 보이지 않아야 합니다.", "is_published": False, "sort_order": 3},
]


def _image_bytes(size: tuple[int, int], color: str, label: str) -> bytes:
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    w, h = size
    for i in range(0, max(w, h), max(w, h) // 12):
        draw.line([(i, 0), (0, i)], fill="#ffffff", width=max(2, w // 300))
    draw.rectangle([w * 0.1, h * 0.1, w * 0.9, h * 0.9], outline="#ffffff", width=max(4, w // 200))
    draw.text((w * 0.12, h * 0.12), label, fill="#ffffff")
    buffer = BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def _video_bytes(size: tuple[int, int]) -> bytes | None:
    if not shutil.which("ffmpeg"):
        return None
    w, h = size
    with tempfile.TemporaryDirectory() as temp_dir:
        out = Path(temp_dir) / "demo.mp4"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=24:duration=4",
             "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-shortest",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)],
            check=True, timeout=120,
        )
        return out.read_bytes()


def _attach_media(db: Session, artwork: Artwork, spec: tuple) -> str:
    kind, size, color = spec
    data = _video_bytes(size) if kind == "video" else None
    if data is None:
        kind, data = "image", _image_bytes(size, color or "#6d597a", artwork.title)
    suffix, content_type = (".mp4", "video/mp4") if kind == "video" else (".png", "image/png")
    key = f"{artwork.id}/{uuid.uuid4().hex}{suffix}"
    LocalStorage(settings.storage_root / "originals").put(key, BytesIO(data))
    media = MediaAsset(
        artwork_id=artwork.id, original_key=key, original_filename=f"{artwork.slug}{suffix}",
        media_type=kind, content_type=content_type, byte_size=len(data), sha256=hashlib.sha256(data).hexdigest(),
        width=size[0], height=size[1], duration_ms=4000 if kind == "video" else None, is_primary=True,
    )
    db.add(media)
    db.flush()
    # worker가 실제 업로드와 같은 방식으로 공개용 파생본을 만든다
    db.add(MediaJob(media_id=media.id, kind=f"process_{kind}"))
    return kind


def seed_demo(db: Session) -> list[str]:
    log: list[str] = []
    profile = db.get(ArtistProfile, 1)
    if not profile or not profile.name:
        profile = profile or ArtistProfile(id=1)
        for key, value in PROFILE.items():
            setattr(profile, key, value)
        db.add(profile)
        log.append(f"작가 프로필: {PROFILE['name']}")
    else:
        log.append(f"작가 프로필: 이미 설정됨({profile.name}) — 유지")

    series_ids: list[str] = []
    for item in SERIES:
        series = db.scalar(select(Series).where(Series.name == item["name"]))
        if not series:
            series = Series(**item)
            db.add(series)
            db.flush()
            log.append(f"시리즈 생성: {item['name']}")
        series_ids.append(series.id)

    first_artwork_id = None
    for item in ARTWORKS:
        existing = db.scalar(select(Artwork).where(Artwork.slug == item["slug"]))
        if existing:
            first_artwork_id = first_artwork_id or existing.id
            log.append(f"작품 건너뜀(이미 있음): {item['slug']}")
            continue
        artwork = Artwork(slug=item["slug"], title=item["title"], description=f"[데모] {item['note']}", **item["fields"])
        if item["series"] is not None:
            artwork.series_id = series_ids[item["series"]]
        if item.get("trashed"):
            artwork.deleted_at = datetime.now(UTC)
        db.add(artwork)
        db.flush()
        first_artwork_id = first_artwork_id or artwork.id
        media_kind = _attach_media(db, artwork, item["media"]) if item["media"] else "없음"
        log.append(f"작품 생성: {item['slug']} — {item['note']} (미디어: {media_kind})")

    today = date.today()
    for item in EXHIBITIONS:
        if db.scalar(select(Exhibition).where(Exhibition.slug == item["slug"])):
            continue
        if "offset_days" in item:
            start, end = (today + timedelta(days=d) for d in item["offset_days"])
        else:
            start, end = item["fixed"]
        fields = {k: v for k, v in item.items() if k not in {"offset_days", "fixed"}}
        db.add(Exhibition(start_date=start, end_date=end, **fields))
        log.append(f"전시 생성: {item['slug']}")

    if not db.scalar(select(Inquiry).where(Inquiry.created_bucket == "demo-seed")):
        for index, (artwork_id, name, message) in enumerate([
            (first_artwork_id, "데모 구매자", "[데모] '아침의 빛' 구매 가능 여부와 배송 방법을 알고 싶습니다."),
            (None, "데모 큐레이터", "[데모] 내년 단체전 참여를 제안드리고 싶어 연락드립니다."),
        ]):
            db.add(Inquiry(artwork_id=artwork_id, name=name, email=f"demo{index + 1}@example.com", message=message,
                           consent=True, fingerprint=f"demo-seed-{index}", created_bucket="demo-seed"))
        log.append("문의 2건 생성")
    db.commit()
    return log
