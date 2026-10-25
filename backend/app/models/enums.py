import enum


class IssueType(enum.StrEnum):
    BUG = "BUG"
    TASK = "TASK"
    FEATURE = "FEATURE"


class IssueStatus(enum.StrEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    IN_REVIEW = "IN_REVIEW"
    DONE = "DONE"


class IssuePriority(enum.StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ProjectRole(enum.StrEnum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"


class ActivityAction(enum.StrEnum):
    ISSUE_CREATED = "ISSUE_CREATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    ASSIGNEE_CHANGED = "ASSIGNEE_CHANGED"
    ISSUE_UPDATED = "ISSUE_UPDATED"
