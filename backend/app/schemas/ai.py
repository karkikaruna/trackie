from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import IssuePriority

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class BugReportDraft(BaseModel):
    """Strict schema every AI provider response must satisfy before it reaches the client."""

    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
    steps_to_reproduce: Annotated[list[Short], Field(max_length=20)]
    expected_behavior: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
    actual_behavior: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
    suggested_priority: IssuePriority
    missing_information: Annotated[list[Short], Field(max_length=10)]


class StructureReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Upper bound is enforced again in the service using the configurable AI_MAX_INPUT_CHARS.
    report: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=50_000)]


class StructureReportResponse(BaseModel):
    draft: BugReportDraft
