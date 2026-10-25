from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.core.rate_limit import limiter
from app.models import AuthSession
from app.tests.conftest import Api

PW = "Passw0rd!long"


def test_register_login_logout_flow(anon):
    r = anon.post("/api/v1/auth/register", json={"name": "Ada", "email": "ada@example.com", "password": PW})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "ada@example.com"
    assert "password" not in r.text and "password_hash" not in r.text
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie

    anon._adopt(body)
    assert anon.get("/api/v1/auth/me").status_code == 200

    assert anon.post("/api/v1/auth/logout").status_code == 204
    assert anon.get("/api/v1/auth/me").status_code == 401

    again = Api()
    assert again.login("ada@example.com").status_code == 200
    assert again.get("/api/v1/auth/me").json()["user"]["name"] == "Ada"


def test_duplicate_email_is_rejected_case_insensitively(anon):
    anon.register("Ada", "ada@example.com")
    r = Api().post(
        "/api/v1/auth/register", json={"name": "Imposter", "email": "ADA@Example.com", "password": PW}
    )
    assert r.status_code == 409


def test_registration_validation_errors(anon):
    r = anon.post("/api/v1/auth/register", json={"name": "", "email": "bad", "password": "short"})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "validation_error"
    assert {d["field"] for d in body["details"]} == {"name", "email", "password"}


def test_login_errors_are_generic(anon):
    anon.register("Ada", "ada@example.com")
    wrong_pw = Api().login("ada@example.com", "Wrong-pass1")
    unknown = Api().login("nobody@example.com", PW)
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()  # identical: no account enumeration


def test_protected_endpoints_require_authentication(anon):
    for method, url in [
        ("GET", "/api/v1/auth/me"),
        ("GET", "/api/v1/projects"),
        ("POST", "/api/v1/projects"),
        ("GET", "/api/v1/issues"),
        ("GET", "/api/v1/dashboard"),
        ("POST", "/api/v1/ai/structure-bug-report"),
    ]:
        assert anon.request(method, url, json={}).status_code == 401, url


def test_csrf_token_is_required_for_state_changing_requests(alice):
    good = alice.csrf
    alice.csrf = None
    r = alice.post("/api/v1/projects", json={"name": "P"})
    assert r.status_code == 403 and "CSRF" in r.json()["error"]["message"]
    alice.csrf = "wrong-token"
    assert alice.post("/api/v1/projects", json={"name": "P"}).status_code == 403
    alice.csrf = good
    assert alice.post("/api/v1/projects", json={"name": "P"}).status_code == 201
    # Safe methods don't need it.
    alice.csrf = None
    assert alice.get("/api/v1/projects").status_code == 200


def test_csrf_token_from_one_session_does_not_work_for_another(alice, bob):
    alice.csrf = bob.csrf
    assert alice.post("/api/v1/projects", json={"name": "P"}).status_code == 403


def test_expired_session_is_rejected(alice, db):
    db.execute(update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
    db.commit()
    assert alice.get("/api/v1/auth/me").status_code == 401


def test_logout_invalidates_the_session_server_side(alice):
    stolen_cookie = alice.http.cookies.get("shiptrack_session")
    stolen_csrf = alice.csrf
    alice.post("/api/v1/auth/logout")
    attacker = Api()
    attacker.http.cookies.set("shiptrack_session", stolen_cookie)
    attacker.csrf = stolen_csrf
    assert attacker.get("/api/v1/auth/me").status_code == 401


def test_update_profile_and_password_change(alice):
    r = alice.patch("/api/v1/auth/me", json={"name": "New Name"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "New Name"

    email = alice.user["email"]
    other_device = Api()
    other_device.login(email)

    bad = alice.patch("/api/v1/auth/me", json={"new_password": "Another1pass", "current_password": "nope"})
    assert bad.status_code == 422
    ok = alice.patch("/api/v1/auth/me", json={"new_password": "Another1pass", "current_password": PW})
    assert ok.status_code == 200

    assert other_device.get("/api/v1/auth/me").status_code == 401  # other sessions signed out
    assert alice.get("/api/v1/auth/me").status_code == 200  # current one survives
    assert Api().login(email, PW).status_code == 401
    assert Api().login(email, "Another1pass").status_code == 200


def test_login_is_rate_limited(anon, settings, monkeypatch):
    anon.register("Ada", "ada@example.com")
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    limiter.reset()
    statuses = [Api().login("ada@example.com", "Wrong-pass1").status_code for _ in range(12)]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429
    r = Api().login("ada@example.com", PW)
    assert r.status_code == 429 and "retry-after" in r.headers
