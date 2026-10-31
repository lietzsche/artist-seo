from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import admin, artworks, auth, collections, health, inquiries, media, profile
from app.core.config import settings

app = FastAPI(title="작가 포트폴리오 API", version="0.1.0", openapi_url="/api/v1/openapi.json", docs_url="/api/v1/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
for router in (health.router, auth.router, artworks.router, collections.router, inquiries.router, media.router, admin.router, profile.router, profile.manifest_router):
    app.include_router(router, prefix="/api/v1")

