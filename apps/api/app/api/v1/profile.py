from fastapi import APIRouter, Depends
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
