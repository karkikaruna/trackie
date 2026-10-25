import math
import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class UserRef(BaseModel):
    """Minimal public view of a user, embedded in other responses."""

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str


class PageParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: Annotated[int, Field(ge=1, le=100_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 20


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=max(1, math.ceil(total / page_size)),
        )
