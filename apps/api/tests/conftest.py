import os
import shutil
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_artist.db"
os.environ["STORAGE_ROOT"] = "./test_storage"
os.environ["MIN_FREE_BYTES"] = "0"

import pytest
from fastapi.testclient import TestClient
from app.core.database import engine
from app.main import app
from app.models import Base


@pytest.fixture(autouse=True)
def database():
    shutil.rmtree("test_storage", ignore_errors=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
    shutil.rmtree("test_storage", ignore_errors=True)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def pytest_sessionfinish(session, exitstatus):
    Path("test_artist.db").unlink(missing_ok=True)

