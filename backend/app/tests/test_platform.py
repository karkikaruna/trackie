"""Health checks, error envelope, security headers, request limits."""


def test_health_and_readiness(anon):
    assert anon.get("/api/v1/health").json()["status"] == "ok"
    ready = anon.get("/api/v1/health/ready")
    assert ready.status_code == 200 and ready.json()["database"] == "ok"


def test_unknown_route_uses_error_envelope(anon):
    r = anon.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_security_headers_present(anon):
    r = anon.get("/api/v1/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"


def test_oversized_body_is_rejected(anon, settings):
    big = "x" * (settings.max_request_body_bytes + 10)
    r = anon.post("/api/v1/auth/login", content=big, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_openapi_documents_core_endpoints(anon):
    paths = anon.get("/api/v1/openapi.json").json()["paths"]
    for p in (
        "/api/v1/auth/register",
        "/api/v1/projects",
        "/api/v1/issues",
        "/api/v1/issues/{issue_id}/activities",
        "/api/v1/ai/structure-bug-report",
        "/api/v1/dashboard",
    ):
        assert p in paths, p


def test_cors_allows_only_configured_origin(anon, settings):
    ok = anon.http.options(
        "/api/v1/projects",
        headers={"Origin": settings.frontend_url, "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == settings.frontend_url
    bad = anon.http.options(
        "/api/v1/projects",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in bad.headers
