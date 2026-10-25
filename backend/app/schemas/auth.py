import re
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def validate_password_strength(value: str) -> str:
    if not 8 <= len(value) <= 128:
        raise ValueError("Password must be between 8 and 128 characters.")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one number.")
    return value


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    current_password: Annotated[str, Field(max_length=128)] | None = None
    new_password: str | None = None

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str | None) -> str | None:
        return None if v is None else validate_password_strength(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    email: str
    created_at: datetime


class SessionOut(BaseModel):
    """Returned by login/register/me. The SPA keeps ``csrf_token`` in memory and sends it back
    in the ``X-CSRF-Token`` header on every state-changing request."""

    user: UserOut
    csrf_token: str
