"""Anthropic Messages API provider using a forced tool call for structured output."""

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
    wrap_report,
)

TOOL_NAME = "submit_bug_report_draft"


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(self, *, api_key: str, model: str, base_url: str, timeout: float):
        self._api_key = api_key
        self._model = model
        self._url = (base_url or "https://api.anthropic.com").rstrip("/") + "/v1/messages"
        self._timeout = timeout

    def generate_draft(self, report: str) -> dict[str, Any]:
        body = {
            "model": self._model,
            "max_tokens": 1500,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": wrap_report(report)}],
            "tools": [
                {
                    "name": TOOL_NAME,
                    "description": "Submit the structured bug report draft.",
                    "input_schema": DRAFT_JSON_SCHEMA,
                }
            ],
            "tool_choice": {"type": "tool", "name": TOOL_NAME},
        }
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        try:
            resp = httpx.post(self._url, json=body, headers=headers, timeout=self._timeout)
        except httpx.TimeoutException:
            raise AITimeoutError("The AI service took too long to respond." + FALLBACK_HINT) from None
        except httpx.HTTPError:
            raise AIUnavailableError("The AI service could not be reached." + FALLBACK_HINT) from None

        if resp.status_code == 429:
            raise AIRateLimitedError("The AI service is busy. Try again shortly." + FALLBACK_HINT)
        if resp.status_code >= 400:
            # Deliberately do not include the response body: it may echo request content.
            raise AIUnavailableError("The AI service is unavailable right now." + FALLBACK_HINT)

        try:
            for block in resp.json().get("content", []):
                if block.get("type") == "tool_use" and block.get("name") == TOOL_NAME:
                    data = block.get("input")
                    if isinstance(data, dict):
                        return data
        except ValueError:
            pass
        raise AIInvalidResponseError("The AI service returned an unreadable draft." + FALLBACK_HINT)
