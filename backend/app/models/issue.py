import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import IssuePriority, IssueStatus, IssueType
from app.models.project import Project
from app.models.user import User


def _enum(e: type, name: str) -> Enum:
    # VARCHAR + CHECK constraint: the database itself rejects invalid values, and adding a value
    # later is a simple migration (no ALTER TYPE gymnastics).
    return Enum(e, native_enum=False, length=16, create_constraint=True, name=name)


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (
        UniqueConstraint("project_id", "issue_number", name="uq_issues_project_number"),
        Index("ix_issues_project_status", "project_id", "status"),
        Index("ix_issues_project_priority", "project_id", "priority"),
        Index("ix_issues_updated_at", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    issue_number: Mapped[int] = mapped_column(Integer)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    issue_type: Mapped[IssueType] = mapped_column(_enum(IssueType, "issue_type"), index=True)
    status: Mapped[IssueStatus] = mapped_column(_enum(IssueStatus, "issue_status"))
    priority: Mapped[IssuePriority] = mapped_column(_enum(IssuePriority, "issue_priority"))
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[Project] = relationship(lazy="joined")
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id], lazy="joined")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")

    @property
    def key(self) -> str:
        return f"{self.project.key}-{self.issue_number}"


class IssueActivity(Base):
    __tablename__ = "issue_activities"
    __table_args__ = (Index("ix_issue_activities_issue_created", "issue_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    issue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    action_type: Mapped[str] = mapped_column(String(32))
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), index=True
    )

    actor: Mapped[User] = relationship(lazy="joined")
    issue: Mapped[Issue] = relationship(lazy="select")
