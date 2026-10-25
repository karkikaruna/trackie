import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.models.enums import ProjectRole
from app.schemas.common import PageParams, UserRef

ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
ProjectKey = Annotated[str, StringConstraints(pattern=r"^[A-Z][A-Z0-9]{1,9}$")]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ProjectName
    key: ProjectKey | None = Field(
        default=None, description="2-10 chars, A-Z/0-9, starts with a letter. Derived if omitted."
    )
    description: Description | None = None

    @field_validator("key", mode="before")
    @classmethod
    def upper_key(cls, v: object) -> object:
        return v.strip().upper() if isinstance(v, str) and v.strip() else None


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ProjectName | None = None
    description: Description | None = None
    is_archived: bool | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    key: str
    description: str | None
    owner: UserRef
    is_archived: bool
    my_role: ProjectRole
    member_count: int
    issue_count: int
    # status -> count, always containing all four statuses (zeros included)
    issue_counts: dict[str, int]
    created_at: datetime
    updated_at: datetime


class MemberAdd(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class MemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    role: ProjectRole
    joined_at: datetime


class ProjectListParams(PageParams):
    include_archived: bool = False
