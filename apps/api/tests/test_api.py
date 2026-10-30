from app.core.database import SessionLocal
from app.core.security import hash_password
from io import BytesIO
import hashlib
from PIL import Image
from app.models import Admin, Artwork
from app.models import MediaAsset, MediaJob
from app.worker import claim_job, execute_job


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


def test_login_attempt_limit(client):
    create_admin()
    body = {"email":"admin@example.com", "password":"definitely-wrong"}
    for _ in range(5):
        assert client.post("/api/v1/auth/login", json=body).status_code == 401
    assert client.post("/api/v1/auth/login", json=body).status_code == 429


def test_inquiry_requires_consent_and_rate_limits(client):
    body = {"name":"구매자", "email":"buyer@example.com", "message":"작품 구매 가능 여부를 문의합니다.", "consent":False, "website":""}
    assert client.post("/api/v1/inquiries", json=body).status_code == 422
    body["consent"] = True
    assert client.post("/api/v1/inquiries", json=body).status_code == 201
    assert client.post("/api/v1/inquiries", json=body).status_code == 429


def test_chunk_resume_complete_and_original_range(client):
    create_admin()
    csrf = login(client)
    with SessionLocal.begin() as db:
        artwork = Artwork(slug="upload-work", title="업로드 작품", is_published=False)
        db.add(artwork)
        db.flush()
        artwork_id = artwork.id
    image = Image.new("RGB", (16, 12), (120, 80, 40))
    source = BytesIO()
    image.save(source, format="JPEG")
    content = source.getvalue()
    headers = {"X-CSRF-Token": csrf}
    initiated = client.post("/api/v1/media/uploads", headers=headers, json={"artwork_id":artwork_id, "filename":"원본 사진.jpg", "content_type":"image/jpeg", "total_bytes":len(content)})
    assert initiated.status_code == 201
    upload_id = initiated.json()["id"]
    split = len(content) // 2
    first = client.patch(f"/api/v1/media/uploads/{upload_id}", headers={**headers, "Upload-Offset":"0", "Content-Type":"application/offset+octet-stream"}, content=content[:split])
    assert first.status_code == 204
    assert first.headers["upload-offset"] == str(split)
    assert client.head(f"/api/v1/media/uploads/{upload_id}").headers["upload-offset"] == str(split)
    wrong = client.patch(f"/api/v1/media/uploads/{upload_id}", headers={**headers, "Upload-Offset":"0"}, content=content[split:])
    assert wrong.status_code == 409
    second = client.patch(f"/api/v1/media/uploads/{upload_id}", headers={**headers, "Upload-Offset":str(split)}, content=content[split:])
    assert second.status_code == 204
    completed = client.post(f"/api/v1/media/uploads/{upload_id}/complete", headers=headers)
    assert completed.status_code == 200
    result = completed.json()
    assert result["sha256"] == hashlib.sha256(content).hexdigest()
    claimed = claim_job("test-worker")
    assert claimed == result["job_id"]
    execute_job(claimed)
    with SessionLocal() as db:
        media = db.get(MediaAsset, result["media_id"])
        job = db.get(MediaJob, claimed)
        assert media and media.status.value == "ready" and media.public_key
        assert job and job.status == "completed" and job.progress == 100
    client.cookies.clear()
    assert client.get(f"/api/v1/media/{result['media_id']}/original").status_code == 401
    login(client)
    ranged = client.get(f"/api/v1/media/{result['media_id']}/original", headers={"Range":"bytes=2-11"})
    assert ranged.status_code == 206
    assert ranged.content == content[2:12]
    assert ranged.headers["cache-control"] == "private, no-store"


def test_admin_overview_and_failed_job_retry(client):
    create_admin()
    with SessionLocal.begin() as db:
        artwork = Artwork(slug="failed-work", title="실패 작업")
        db.add(artwork)
        db.flush()
        media = MediaAsset(artwork_id=artwork.id, original_key="missing.mp4", original_filename="missing.mp4", media_type="video", content_type="video/mp4", byte_size=1234, sha256="0"*64, status="failed")
        db.add(media)
        db.flush()
        job = MediaJob(media_id=media.id, kind="process_video", status="failed", attempts=3, error="테스트 실패")
        db.add(job)
        db.flush()
        job_id = job.id
    assert client.get("/api/v1/admin/overview").status_code == 401
    csrf = login(client)
    overview = client.get("/api/v1/admin/overview")
    assert overview.status_code == 200
    assert overview.json()["storage"]["stored_bytes"] == 1234
    assert overview.json()["failed_jobs"][0]["id"] == job_id
    assert client.post(f"/api/v1/admin/jobs/{job_id}/retry").status_code == 403
    assert client.post(f"/api/v1/admin/jobs/{job_id}/retry", headers={"X-CSRF-Token":csrf}).json() == {"status":"queued"}
    with SessionLocal() as db:
        assert db.get(MediaJob, job_id).attempts == 0


def test_series_filter_and_exhibition_management(client):
    create_admin()
    csrf = login(client)
    headers = {"X-CSRF-Token":csrf}
    series_response = client.post("/api/v1/series/admin", headers=headers, json={"name":"빛의 표면", "description":"가상 시리즈", "sort_order":1})
    assert series_response.status_code == 201
    series_id = series_response.json()["id"]
    work = {"slug":"series-work", "title":"시리즈 작품", "year":2026, "medium":"종이에 안료", "dimensions":"40 × 30 cm", "description":"", "price_text":None, "show_price":False, "sale_status":"available", "is_published":True, "featured":False, "series_id":series_id}
    assert client.post("/api/v1/artworks/admin", headers=headers, json=work).status_code == 201
    assert client.get(f"/api/v1/artworks?series_id={series_id}").json()["total"] == 1
    assert client.get("/api/v1/artworks?series_id=missing").json()["total"] == 0
    invalid = {"slug":"bad-dates", "title":"잘못된 날짜", "venue":"", "location":"", "start_date":"2026-12-31", "end_date":"2026-01-01", "description":"", "is_published":True, "sort_order":0}
    assert client.post("/api/v1/exhibitions/admin", headers=headers, json=invalid).status_code == 422
    exhibition = {**invalid, "slug":"light-stay", "title":"빛의 체류", "start_date":"2026-11-01", "end_date":"2026-12-20", "venue":"프로젝트 스페이스"}
    created = client.post("/api/v1/exhibitions/admin", headers=headers, json=exhibition)
    assert created.status_code == 201
    assert client.get("/api/v1/exhibitions").json()[0]["slug"] == "light-stay"
    assert client.get("/api/v1/exhibitions/light-stay").status_code == 200
    assert client.get("/api/v1/exhibitions/admin/all").status_code == 200
    assert client.delete(f"/api/v1/series/admin/{series_id}", headers=headers).status_code == 409


def test_first_admin_setup(client):
    assert client.get("/api/v1/auth/setup").json() == {"needs_setup": True}
    assert client.post("/api/v1/auth/setup", json={"email":"owner@example.com", "password":"short"}).status_code == 422
    response = client.post("/api/v1/auth/setup", json={"email":"Owner@Example.com", "password":"very-safe-password"})
    assert response.status_code == 201
    assert response.json()["email"] == "owner@example.com"
    assert client.get("/api/v1/auth/me").json()["email"] == "owner@example.com"
    assert client.get("/api/v1/auth/setup").json() == {"needs_setup": False}
    again = client.post("/api/v1/auth/setup", json={"email":"intruder@example.com", "password":"very-safe-password"})
    assert again.status_code == 409


def test_setup_rejects_foreign_origin(client):
    body = {"email":"owner@example.com", "password":"very-safe-password"}
    assert client.post("/api/v1/auth/setup", json=body, headers={"Origin":"https://evil.example"}).status_code == 403
    assert client.get("/api/v1/auth/setup").json() == {"needs_setup": True}
