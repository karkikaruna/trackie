import logging

import httpx
import pytest

from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.base import (
    AIInvalidResponseError,
    AIProvider,
    AIRateLimitedError,
    AITimeoutError,
    AIUnavailableError,
)
from app.services.ai.openai_provider import OpenAIProvider
from app.tests.conftest import make_issue, make_project

URL = "/api/v1/ai/structure-bug-report"
REPORT = (
    "The app crashes whenever I click the login button. It works sometimes after refreshing, "
    "but most of the time it just shows a blank screen."
)
GOOD = {
    "title": "Blank screen after login",
    "description": "Login shows a blank screen.",
    "steps_to_reproduce": [],
    "expected_behavior": "",
    "actual_behavior": "Blank screen",
    "suggested_priority": "HIGH",
    "missing_information": ["Browser"],
}


class Stub(AIProvider):
    name = "stub"

    def __init__(self, result=None, error: Exception | None = None):
        self.result, self.error = result, error

    def generate_draft(self, report):
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def use_provider(monkeypatch):
    def _use(provider):
        monkeypatch.setattr("app.api.v1.ai.get_ai_provider", lambda: provider)

    return _use


# ---------- endpoint behaviour ----------
def test_mock_provider_returns_valid_draft(alice):
    r = alice.post(URL, json={"report": REPORT})
    assert r.status_code == 200
    d = r.json()["draft"]
    assert d["suggested_priority"] == "HIGH"
    assert d["steps_to_reproduce"] == []  # nothing invented
    assert d["missing_information"]


def test_draft_endpoint_never_creates_issues(alice):
    p = make_project(alice)
    alice.post(URL, json={"report": REPORT})
    assert alice.get("/api/v1/issues").json()["total"] == 0
    assert p["issue_count"] == 0


def test_requires_authentication(anon):
    assert anon.post(URL, json={"report": REPORT}).status_code == 401


def test_input_limits(alice, settings):
    assert alice.post(URL, json={"report": "short"}).status_code == 422
    assert alice.post(URL, json={"report": "x" * (settings.ai_max_input_chars + 1)}).status_code == 422
    assert alice.post(URL, json={"report": "x" * 60_000}).status_code == 422
    assert alice.post(URL, json={"report": REPORT, "extra": 1}).status_code == 422


def test_invalid_provider_output_is_rejected(alice, use_provider):
    for bad in (
        {**GOOD, "suggested_priority": "URGENT"},
        {**GOOD, "unexpected": "field"},
        {"title": "only a title"},
        "not a dict",
    ):
        use_provider(Stub(result=bad))
        r = alice.post(URL, json={"report": REPORT})
        assert r.status_code == 502 and r.json()["error"]["code"] == "ai_invalid_response"
        assert "manually" in r.json()["error"]["message"]


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (AITimeoutError("slow"), 504, "ai_timeout"),
        (AIUnavailableError("down"), 503, "ai_unavailable"),
        (AIRateLimitedError("busy"), 429, "ai_rate_limited"),
        (AIInvalidResponseError("garbled"), 502, "ai_invalid_response"),
    ],
)
def test_provider_failures_map_to_clean_errors(alice, use_provider, error, status, code):
    use_provider(Stub(error=error))
    r = alice.post(URL, json={"report": REPORT})
    assert r.status_code == status and r.json()["error"]["code"] == code


def test_manual_issue_creation_works_when_ai_is_down(alice, use_provider):
    use_provider(Stub(error=AIUnavailableError("down")))
    assert alice.post(URL, json={"report": REPORT}).status_code == 503
    p = make_project(alice)
    assert make_issue(alice, p["id"], title="Created by hand")["key"].endswith("-1")


def test_ai_endpoint_is_rate_limited(alice, settings, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    codes = [alice.post(URL, json={"report": REPORT}).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


def test_report_text_is_not_logged(alice, caplog):
    secret = "SUPER-SECRET-CUSTOMER-DATA-12345 causes a crash in the exporter"
    with caplog.at_level(logging.DEBUG):
        alice.post(URL, json={"report": secret})
    assert "SUPER-SECRET" not in caplog.text


# ---------- real providers (HTTP mocked; no network, no paid calls) ----------
def _resp(status: int, payload: dict | None = None) -> httpx.Response:
    return httpx.Response(status, json=payload or {}, request=httpx.Request("POST", "http://x"))


@pytest.fixture
def anthropic():
    return AnthropicProvider(api_key="sk-test-KEY", model="m", base_url="", timeout=5)


@pytest.fixture
def openai():
    return OpenAIProvider(api_key="sk-test-KEY", model="m", base_url="", timeout=5)


def test_anthropic_parses_tool_use(anthropic, monkeypatch):
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured.update(url=url, json=json, headers=headers)
        return _resp(
            200, {"content": [{"type": "tool_use", "name": "submit_bug_report_draft", "input": GOOD}]}
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    assert anthropic.generate_draft(REPORT) == GOOD
    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    assert captured["json"]["tool_choice"]["name"] == "submit_bug_report_draft"
    assert "<bug_report>" in captured["json"]["messages"][0]["content"]


@pytest.mark.parametrize(
    ("status", "exc"),
    [(429, AIRateLimitedError), (401, AIUnavailableError), (500, AIUnavailableError)],
)
def test_anthropic_http_errors(anthropic, monkeypatch, status, exc):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(status, {"error": "echo " + REPORT}))
    with pytest.raises(exc) as info:
        anthropic.generate_draft(REPORT)
    assert "sk-test-KEY" not in info.value.message and "echo" not in info.value.message


def test_anthropic_timeout_and_network_errors(anthropic, monkeypatch):
    def timeout(*a, **k):
        raise httpx.ReadTimeout("slow")

    def network(*a, **k):
        raise httpx.ConnectError("nope")

    monkeypatch.setattr(httpx, "post", timeout)
    with pytest.raises(AITimeoutError):
        anthropic.generate_draft(REPORT)
    monkeypatch.setattr(httpx, "post", network)
    with pytest.raises(AIUnavailableError):
        anthropic.generate_draft(REPORT)


def test_anthropic_without_tool_call_is_invalid(anthropic, monkeypatch):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _resp(200, {"content": [{"type": "text", "text": "hi"}]})
    )
    with pytest.raises(AIInvalidResponseError):
        anthropic.generate_draft(REPORT)


def test_openai_parses_json_content_with_fences(openai, monkeypatch):
    import json as _json

    content = "```json\n" + _json.dumps(GOOD) + "\n```"
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _resp(200, {"choices": [{"message": {"content": content}}]})
    )
    assert openai.generate_draft(REPORT) == GOOD


def test_openai_bad_payloads(openai, monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(200, {"unexpected": True}))
    with pytest.raises(AIInvalidResponseError):
        openai.generate_draft(REPORT)
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _resp(200, {"choices": [{"message": {"content": "nope"}}]})
    )
    with pytest.raises(AIInvalidResponseError):
        openai.generate_draft(REPORT)
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(429))
    with pytest.raises(AIRateLimitedError):
        openai.generate_draft(REPORT)
