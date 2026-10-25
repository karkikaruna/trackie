"""Test configuration.

Safety: tests ALWAYS run against TEST_DATABASE_URL (default: a database named *_test) and refuse to
run against anything else, so development or production data can never be touched.
"""

import os

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://shiptrack:shiptrack@localhost:5432/shiptrack_test"
)
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SESSION_SECRET_KEY"] = "test-secret-key-not-for-production-0123456789"
os.environ["AI_PROVIDER"] = "mock"
os.environ["AI_API_KEY"] = ""
os.environ["AI_MODEL"] = ""
os.environ["RATE_LIMIT_ENABLED"] = "false"

import uuid  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.session import get_engine, get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session", autouse=True)
def _database():
    """Create a clean schema using the real Alembic migrations (this also tests the migrations)."""
    engine = get_engine()
    db_name = engine.url.database or ""
    assert db_name.endswith("_test"), f"Refusing to run tests against database '{db_name}'"
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean_state():
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("TRUNCATE issue_activities, issues, project_members, projects, sessions, users CASCADE")
        )
    limiter.reset()
    yield


@pytest.fixture
def db() -> Session:
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()


class Api:
    """A browser-like client: keeps its own cookie jar and sends the CSRF header automatically."""

    def __init__(self) -> None:
        self.http = TestClient(app)
        self.csrf: str | None = None
        self.user: dict | None = None

    def request(self, method: str, url: str, **kwargs):
        headers = kwargs.pop("headers", {})
        if self.csrf and method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers.setdefault("X-CSRF-Token", self.csrf)
        return self.http.request(method, url, headers=headers, **kwargs)

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def patch(self, url, **kw):
        return self.request("PATCH", url, **kw)

    def delete(self, url, **kw):
        return self.request("DELETE", url, **kw)

    def register(self, name: str, email: str, password: str = "Passw0rd!long") -> "Api":
        r = self.post("/api/v1/auth/register", json={"name": name, "email": email, "password": password})
        assert r.status_code == 201, r.text
        self._adopt(r.json())
        return self

    def login(self, email: str, password: str = "Passw0rd!long"):
        r = self.post("/api/v1/auth/login", json={"email": email, "password": password})
        if r.status_code == 200:
            self._adopt(r.json())
        return r

    def _adopt(self, body: dict) -> None:
        self.csrf = body["csrf_token"]
        self.user = body["user"]

    @property
    def id(self) -> str:
        assert self.user
        return self.user["id"]


@pytest.fixture
def anon() -> Api:
    return Api()


def _user(name: str) -> Api:
    return Api().register(name.title(), f"{name}-{uuid.uuid4().hex[:6]}@example.com")


@pytest.fixture
def alice() -> Api:
    return _user("alice")


@pytest.fixture
def bob() -> Api:
    return _user("bob")


@pytest.fixture
def carol() -> Api:
    return _user("carol")


# ---- helpers shared by tests ----
def make_project(api: Api, name: str = "ShipTrack", key: str | None = None, **extra) -> dict:
    body = {"name": name, **extra}
    if key:
        body["key"] = key
    r = api.post("/api/v1/projects", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def make_issue(api: Api, project_id: str, title: str = "A bug", **extra) -> dict:
    r = api.post("/api/v1/issues", json={"project_id": project_id, "title": title, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def add_member(owner: Api, project_id: str, member: Api) -> None:
    assert member.user
    r = owner.post(f"/api/v1/projects/{project_id}/members", json={"email": member.user["email"]})
    assert r.status_code == 201, r.text


@pytest.fixture
def settings():
    return get_settings()
