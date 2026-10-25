"""Deterministic, offline provider for development and tests. Makes no network calls."""

import re
from typing import Any

from app.services.ai.base import AIProvider

_CRITICAL = ("data loss", "lost data", "deleted", "security", "leak", "breach", "password exposed")
_HIGH = ("crash", "crashes", "cannot", "can't", "unable", "blank screen", "500", "fails", "broken")
_LOW = ("typo", "cosmetic", "misaligned", "color", "colour", "spelling", "minor")


class MockProvider(AIProvider):
    name = "mock"

    def generate_draft(self, report: str) -> dict[str, Any]:
        text = " ".join(report.split())
        lower = text.lower()
        first_sentence = re.split(r"(?<=[.!?])\s", text, maxsplit=1)[0].rstrip(".!? ")
        title = (first_sentence[:100] or "Untitled bug report").strip()

        # Only use steps the reporter explicitly numbered; never invent any.
        steps = [
            re.sub(r"^\s*(?:\d+[.)]|[-*])\s*", "", line).strip()
            for line in report.splitlines()
            if re.match(r"^\s*(?:\d+[.)]|[-*])\s+\S", line)
        ][:20]

        if any(k in lower for k in _CRITICAL):
            priority = "CRITICAL"
        elif any(k in lower for k in _HIGH):
            priority = "HIGH"
        elif any(k in lower for k in _LOW):
            priority = "LOW"
        else:
            priority = "MEDIUM"

        missing: list[str] = []
        if not re.search(r"chrome|firefox|safari|edge|browser|android|ios|windows|linux|mac", lower):
            missing.append("Browser/device and version")
        if not re.search(r"error|exception|console|stack ?trace|log", lower):
            missing.append("Any error messages or console output")
        if not re.search(r"always|every time|sometimes|intermittent|once|consistently|often", lower):
            missing.append("How often it happens (always, sometimes, once)")
        if not steps:
            missing.append("Exact steps to reproduce")

        return {
            "title": title,
            "description": text[:1000],
            "steps_to_reproduce": steps,
            "expected_behavior": "",
            "actual_behavior": title,
            "suggested_priority": priority,
            "missing_information": missing[:6],
        }
