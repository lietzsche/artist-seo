from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import require_admin, require_csrf
from app.api.v1.schemas import ExhibitionIn, ExhibitionOut, SeriesIn, SeriesOut
from app.core.database import get_db
from app.models import Artwork, Exhibition, Series

router = APIRouter(tags=["collections"])


@router.get("/series", response_model=list[SeriesOut])
def public_series(db: Session = Depends(get_db)) -> list[Series]:
    return list(db.scalars(select(Series).order_by(Series.sort_order, Series.name)).all())


@router.get("/series/admin/all", response_model=list[SeriesOut], dependencies=[Depends(require_admin)])
def admin_series(db: Session = Depends(get_db)) -> list[Series]:
    return list(db.scalars(select(Series).order_by(Series.sort_order, Series.name)).all())


@router.post("/series/admin", response_model=SeriesOut, status_code=201)
def create_series(payload: SeriesIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> Series:
    item = Series(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 이름의 시리즈가 이미 있습니다") from None
    db.refresh(item)
    return item


@router.put("/series/admin/{series_id}", response_model=SeriesOut)
def update_series(series_id: str, payload: SeriesIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> Series:
    item = db.get(Series, series_id)
    if not item:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없습니다")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 이름의 시리즈가 이미 있습니다") from None
    return item


@router.delete("/series/admin/{series_id}", status_code=204)
def delete_series(series_id: str, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    item = db.get(Series, series_id)
    if not item:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없습니다")
    references = db.scalar(select(func.count()).select_from(Artwork).where(Artwork.series_id == series_id, Artwork.deleted_at.is_(None))) or 0
    if references:
        raise HTTPException(status_code=409, detail="작품에서 사용 중인 시리즈는 삭제할 수 없습니다")
    db.delete(item)
    db.commit()


@router.get("/exhibitions", response_model=list[ExhibitionOut])
def public_exhibitions(db: Session = Depends(get_db)) -> list[Exhibition]:
    return list(db.scalars(select(Exhibition).where(Exhibition.is_published.is_(True)).order_by(Exhibition.sort_order, Exhibition.start_date.desc())).all())


@router.get("/exhibitions/{slug}", response_model=ExhibitionOut)
def public_exhibition(slug: str, db: Session = Depends(get_db)) -> Exhibition:
    item = db.scalar(select(Exhibition).where(Exhibition.slug == slug, Exhibition.is_published.is_(True)))
    if not item:
        raise HTTPException(status_code=404, detail="전시를 찾을 수 없습니다")
    return item


@router.get("/exhibitions/admin/all", response_model=list[ExhibitionOut], dependencies=[Depends(require_admin)])
def admin_exhibitions(db: Session = Depends(get_db)) -> list[Exhibition]:
    return list(db.scalars(select(Exhibition).order_by(Exhibition.sort_order, Exhibition.start_date.desc())).all())


@router.post("/exhibitions/admin", response_model=ExhibitionOut, status_code=status.HTTP_201_CREATED)
def create_exhibition(payload: ExhibitionIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> Exhibition:
    item = Exhibition(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 주소의 전시가 이미 있습니다") from None
    db.refresh(item)
    return item


@router.put("/exhibitions/admin/{exhibition_id}", response_model=ExhibitionOut)
def update_exhibition(exhibition_id: str, payload: ExhibitionIn, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> Exhibition:
    item = db.get(Exhibition, exhibition_id)
    if not item:
        raise HTTPException(status_code=404, detail="전시를 찾을 수 없습니다")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    return item


@router.delete("/exhibitions/admin/{exhibition_id}", status_code=204)
def delete_exhibition(exhibition_id: str, _: object = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    item = db.get(Exhibition, exhibition_id)
    if not item:
        raise HTTPException(status_code=404, detail="전시를 찾을 수 없습니다")
    db.delete(item)
    db.commit()
