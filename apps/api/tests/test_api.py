from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Admin, Artwork


def create_admin():
    with SessionLocal.begin() as db:
        db.add(Admin(email="admin@example.com", password_hash=hash_password("very-safe-password")))


def login(client):
    response = client.post("/api/v1/auth/login", json={"email":"admin@example.com", "password":"very-safe-password"})
    assert response.status_code == 200
    return response.json()["csrf_token"]


def test_health(client):
    assert client.get("/api/v1/health/live").json() == {"status":"ok"}
    assert client.get("/api/v1/health/ready").status_code == 200


def test_private_artwork_is_not_public(client):
    with SessionLocal.begin() as db:
        db.add(Artwork(slug="private-work", title="비공개 작품", is_published=False))
    assert client.get("/api/v1/artworks/private-work").status_code == 404
    assert client.get("/api/v1/artworks").json()["total"] == 0


def test_admin_auth_csrf_and_create(client):
    create_admin()
    assert client.get("/api/v1/artworks/admin/all").status_code == 401
    csrf = login(client)
    payload = {"slug":"first-work", "title":"첫 작품", "year":2026, "medium":"캔버스에 유채", "dimensions":"100 × 80 cm", "description":"테스트 작품", "price_text":None, "show_price":False, "sale_status":"available", "is_published":True, "featured":True, "series_id":None}
    assert client.post("/api/v1/artworks/admin", json=payload).status_code == 403
    response = client.post("/api/v1/artworks/admin", json=payload, headers={"X-CSRF-Token":csrf})
    assert response.status_code == 201
    assert client.get("/api/v1/artworks/first-work").status_code == 200


def test_inquiry_requires_consent_and_rate_limits(client):
    body = {"name":"구매자", "email":"buyer@example.com", "message":"작품 구매 가능 여부를 문의합니다.", "consent":False, "website":""}
    assert client.post("/api/v1/inquiries", json=body).status_code == 422
    body["consent"] = True
    assert client.post("/api/v1/inquiries", json=body).status_code == 201
    assert client.post("/api/v1/inquiries", json=body).status_code == 429
