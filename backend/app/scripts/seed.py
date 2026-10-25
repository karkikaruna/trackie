"""Populate a development database with demo data.  Usage:  python -m app.scripts.seed

Creates two users (password: Demo1234pass), one project and a handful of issues.
Refuses to run in production and is safe to re-run (it skips if the demo user exists).
"""

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import get_sessionmaker
from app.models import User
from app.schemas.auth import RegisterRequest
from app.schemas.issue import IssueCreate, IssueUpdate
from app.schemas.project import ProjectCreate
from app.services import auth, issues, projects

DEMO_PASSWORD = "Demo1234pass"


def main() -> None:
    if get_settings().is_production:
        raise SystemExit("Refusing to seed a production database.")
    with get_sessionmaker()() as db:
        if db.scalar(select(User).where(User.email == "demo@shiptrack.dev")):
            print("Demo data already present; nothing to do.")
            return
        demo = auth.register_user(
            db, RegisterRequest(name="Demo User", email="demo@shiptrack.dev", password=DEMO_PASSWORD)
        )
        teammate = auth.register_user(
            db, RegisterRequest(name="Sam Teammate", email="sam@shiptrack.dev", password=DEMO_PASSWORD)
        )
        project = projects.create_project(
            db, demo, ProjectCreate(name="ShipTrack", key="SHIP", description="Our own issue tracker.")
        )
        projects.add_member(db, demo, project.id, teammate.email)

        rows = [
            ("Login button shows a blank screen", "BUG", "HIGH", demo, "IN_PROGRESS"),
            ("Add dark mode", "FEATURE", "LOW", teammate, None),
            ("Write API documentation", "TASK", "MEDIUM", teammate, "IN_PROGRESS"),
            ("Dashboard chart overlaps on mobile", "BUG", "MEDIUM", None, None),
            ("Data export drops the last row", "BUG", "CRITICAL", demo, None),
            ("Upgrade dependencies", "TASK", "LOW", None, "IN_PROGRESS"),
            ("Email notifications", "FEATURE", "MEDIUM", None, None),
        ]
        for title, kind, prio, assignee, status in rows:
            created = issues.create_issue(
                db,
                demo,
                IssueCreate(
                    project_id=project.id,
                    title=title,
                    issue_type=kind,
                    priority=prio,
                    assignee_id=assignee.id if assignee else None,
                    description=f"Demo issue: {title}.",
                ),
            )
            if status:
                issues.update_issue(db, demo, created.id, IssueUpdate(status=status))
        print("Seeded. Log in with demo@shiptrack.dev / " + DEMO_PASSWORD)


if __name__ == "__main__":
    main()
