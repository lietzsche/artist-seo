from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.api.deps import require_csrf
from app.api.v1.schemas import ProfileIn, ProfileOut
from app.core.database import get_db
from app.models import ArtistProfile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(db: Session = Depends(get_db)) -> ProfileOut:
    profile = db.get(ArtistProfile, 1)
    return ProfileOut.model_validate(profile) if profile else ProfileOut()


@router.put("/admin", response_model=ProfileOut)
def update_profile(payload: ProfileIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> ProfileOut:
    profile = db.get(ArtistProfile, 1) or ArtistProfile(id=1)
    for key, value in payload.model_dump().items():
        setattr(profile, key, value.strip())
    db.add(profile)
    db.commit()
    return ProfileOut.model_validate(profile)


# 앱 설치(홈 화면에 추가)용 매니페스트. 작가 이름은 관리 화면에서 바뀌므로 프로필에서 읽어 만든다.
manifest_router = APIRouter(tags=["profile"])
THEME_COLOR = "#0b0a08"


@manifest_router.get("/manifest.webmanifest")
def web_manifest(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    profile = db.get(ArtistProfile, 1)
    name = ((profile.name_en or profile.name) if profile else "").strip() or "Artist Portfolio"
    icons = [
        {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        # 아이콘 내용이 가운데 안전 영역 안에 있어 휴대폰이 둥글게·원형으로 잘라도 괜찮다
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ]
    # 설치한 앱은 휴대폰 언어로 연다: 한국어 기기면 /ko, 아니면 영어(/). 웹사이트 기본 언어(영어)는 그대로다.
    korean = request.headers.get("accept-language", "").strip().lower().startswith("ko")
    body = {
        "id": "/", "name": f"{name} — Works", "short_name": name[:12], "description": f"Works and exhibitions by {name}.",
        "start_url": "/ko" if korean else "/", "scope": "/", "display": "standalone", "lang": "ko" if korean else "en",
        "background_color": THEME_COLOR, "theme_color": THEME_COLOR, "icons": icons,
    }
    return JSONResponse(body, media_type="application/manifest+json", headers={"Cache-Control": "no-cache", "Vary": "Accept-Language"})
