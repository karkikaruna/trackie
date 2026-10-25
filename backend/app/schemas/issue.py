import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.models.enums import IssuePriority, IssueStatus, IssueType
from app.schemas.common import PageParams, UserRef

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
IssueDescription = Annotated[str, StringConstraints(max_length=10_000)]


class IssueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: uuid.UUID
    title: Title
    description: IssueDescription | None = None
    issue_type: IssueType = IssueType.TASK
    priority: IssuePriority = IssuePriority.MEDIUM
    assignee_id: uuid.UUID | None = None


class IssueUpdate(BaseModel):
    """PATCH body. Omitted fields are untouched; ``assignee_id: null`` explicitly unassigns."""

    model_config = ConfigDict(extra="forbid")
    title: Title | None = None
    description: IssueDescription | None = None
    issue_type: IssueType | None = None
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    assignee_id: uuid.UUID | None = None

    @field_validator("title", "issue_type", "status", "priority", mode="before")
    @classmethod
    def not_null(cls, v: Any) -> Any:
        if v is None:
            raise ValueError("This field cannot be null.")
        return v


class IssueOut(BaseModel):
    id: uuid.UUID
    key: str
    issue_number: int
    project_id: uuid.UUID
    project_key: str
    project_name: str
    title: str
    description: str | None
    issue_type: IssueType
    status: IssueStatus
    priority: IssuePriority
    reporter: UserRef
    assignee: UserRef | None
    created_at: datetime
    updated_at: datetime


class SortField(StrEnum):
    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"
    PRIORITY = "priority"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class IssueListParams(PageParams):
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    issue_type: IssueType | None = None
    project_id: uuid.UUID | None = None
    assignee: str | None = None  # "me", "unassigned", or a user UUID
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    sort: SortField = SortField.CREATED_AT
    order: SortOrder = SortOrder.DESC

    @field_validator("assignee")
    @classmethod
    def valid_assignee(cls, v: str | None) -> str | None:
        if v in (None, "", "me", "unassigned"):
            return v or None
        uuid.UUID(v)  # raises ValueError -> 422
        return v


class ActivityOut(BaseModel):
    id: uuid.UUID
    issue_id: uuid.UUID
    issue_key: str | None = None
    issue_title: str | None = None
    actor: UserRef
    action_type: str
    details: dict[str, Any]
    created_at: datetime
