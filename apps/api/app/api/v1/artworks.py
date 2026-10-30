from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from app.api.deps import require_admin, require_csrf
from app.api.v1.schemas import ArtworkIn, ArtworkOut
from app.core.database import get_db
from app.models import Admin, Artwork

router = APIRouter(prefix="/artworks", tags=["artworks"])


@router.get("")
def public_list(
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=50),
    year: int | None = None,
    medium: str | None = None,
    sale_status: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    filters = [Artwork.is_published.is_(True), Artwork.deleted_at.is_(None)]
    if year:
        filters.append(Artwork.year == year)
    if medium:
        filters.append(Artwork.medium.ilike(f"%{medium}%"))
    if sale_status:
        filters.append(Artwork.sale_status == sale_status)
    total = db.scalar(select(func.count()).select_from(Artwork).where(*filters)) or 0
    items = db.scalars(
        select(Artwork).options(selectinload(Artwork.media)).where(*filters).order_by(Artwork.created_at.desc()).offset((page - 1) * size).limit(size)
    ).all()
    return {"items": [ArtworkOut.model_validate(x) for x in items], "page": page, "size": size, "total": total}


@router.get("/{slug}", response_model=ArtworkOut)
def public_detail(slug: str, db: Session = Depends(get_db)) -> Artwork:
    artwork = db.scalar(select(Artwork).options(selectinload(Artwork.media)).where(Artwork.slug == slug, Artwork.is_published.is_(True), Artwork.deleted_at.is_(None)))
    if not artwork:
        raise HTTPException(status_code=404, detail="작품을 찾을 수 없습니다")
    return artwork


@router.get("/admin/all", dependencies=[Depends(require_admin)])
def admin_list(db: Session = Depends(get_db)) -> list[ArtworkOut]:
    items = db.scalars(select(Artwork).options(selectinload(Artwork.media)).order_by(Artwork.updated_at.desc())).all()
    return [ArtworkOut.model_validate(x) for x in items]


@router.post("/admin", response_model=ArtworkOut, status_code=status.HTTP_201_CREATED)
def create_artwork(payload: ArtworkIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> Artwork:
    artwork = Artwork(**payload.model_dump())
    db.add(artwork)
    db.commit()
    db.refresh(artwork)
    return artwork


@router.put("/admin/{artwork_id}", response_model=ArtworkOut)
def update_artwork(artwork_id: str, payload: ArtworkIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> Artwork:
    artwork = db.get(Artwork, artwork_id)
    if not artwork or artwork.deleted_at:
        raise HTTPException(status_code=404, detail="작품을 찾을 수 없습니다")
    for key, value in payload.model_dump().items():
        setattr(artwork, key, value)
    db.commit()
    db.refresh(artwork)
    return artwork


@router.delete("/admin/{artwork_id}", status_code=204)
def trash_artwork(artwork_id: str, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    artwork = db.get(Artwork, artwork_id)
    if not artwork:
        raise HTTPException(status_code=404, detail="작품을 찾을 수 없습니다")
    artwork.deleted_at = datetime.now(UTC)
    artwork.is_published = False
    db.commit()

