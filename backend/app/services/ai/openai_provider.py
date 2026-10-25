"""OpenAI-compatible Chat Completions provider (works with OpenAI and compatible gateways)."""

from typing import Any

import httpx

from app.services.ai.base import (
    DRAFT_JSON_SCHEMA,
    FALLBACK_HINT,
    SYSTEM_PROMPT,
    AIInvalidResponseError,
    AIProvider,
    AIRateLimitedError,
    AITimeoutError,
    AIUnavailableError,
    parse_json_object,
    wrap_report,
)


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self, *, api_key: str, model: str, base_url: str, timeout: float):
        self._api_key = api_key
        self._model = model
        self._url = (base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
        self._timeout = timeout

    def generate_draft(self, report: str) -> dict[str, Any]:
        system = (
            SYSTEM_PROMPT
            + "\n\nReply with a single JSON object with exactly these keys: "
            + ", ".join(DRAFT_JSON_SCHEMA["required"])
            + "."
        )
        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": wrap_report(report)},
            ],
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        try:
            resp = httpx.post(self._url, json=body, headers=headers, timeout=self._timeout)
        except httpx.TimeoutException:
            raise AITimeoutError("The AI service took too long to respond." + FALLBACK_HINT) from None
        except httpx.HTTPError:
            raise AIUnavailableError("The AI service could not be reached." + FALLBACK_HINT) from None

        if resp.status_code == 429:
            raise AIRateLimitedError("The AI service is busy. Try again shortly." + FALLBACK_HINT)
        if resp.status_code >= 400:
            raise AIUnavailableError("The AI service is unavailable right now." + FALLBACK_HINT)

        try:
            content = resp.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            raise AIInvalidResponseError(
                "The AI service returned an unreadable draft." + FALLBACK_HINT
            ) from None
        return parse_json_object(content or "")
