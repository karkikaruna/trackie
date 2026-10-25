import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Issue, IssuePriority, IssueStatus, IssueType
from app.tests.conftest import add_member, make_issue, make_project


@pytest.fixture
def project(alice):
    return make_project(alice, "ShipTrack", key="SHIP")


# ---------- creation ----------
def test_issue_keys_are_sequential_per_project(alice):
    a = make_project(alice, "One", key="ONE")
    b = make_project(alice, "Two", key="TWO")
    assert make_issue(alice, a["id"])["key"] == "ONE-1"
    assert make_issue(alice, a["id"])["key"] == "ONE-2"
    assert make_issue(alice, b["id"])["key"] == "TWO-1"


def test_create_issue_defaults_and_reporter(alice, project):
    i = make_issue(alice, project["id"], title="  Spaced  ")
    assert i["title"] == "Spaced"
    assert (i["status"], i["priority"], i["issue_type"]) == ("OPEN", "MEDIUM", "TASK")
    assert i["reporter"]["id"] == alice.id and i["assignee"] is None
    assert i["project_key"] == "SHIP"


def test_client_cannot_spoof_reporter_or_status(alice, bob, project):
    r = alice.post(
        "/api/v1/issues",
        json={"project_id": project["id"], "title": "x", "reporter_id": bob.id, "status": "DONE"},
    )
    assert r.status_code == 422


@pytest.mark.parametrize(
    "bad", [{"priority": "URGENT"}, {"issue_type": "EPIC"}, {"title": ""}, {"title": "x" * 201}]
)
def test_invalid_issue_payloads_are_rejected(alice, project, bad):
    r = alice.post("/api/v1/issues", json={"project_id": project["id"], "title": "ok", **bad})
    assert r.status_code == 422


def test_non_member_cannot_create_issue_in_project(alice, bob, project):
    r = bob.post("/api/v1/issues", json={"project_id": project["id"], "title": "sneaky"})
    assert r.status_code == 404


def test_assignee_must_be_project_member(alice, bob, carol, project):
    add_member(alice, project["id"], bob)
    ok = make_issue(alice, project["id"], assignee_id=bob.id)
    assert ok["assignee"]["id"] == bob.id
    bad = alice.post(
        "/api/v1/issues", json={"project_id": project["id"], "title": "x", "assignee_id": carol.id}
    )
    assert bad.status_code == 422
    patch = alice.patch(f"/api/v1/issues/{ok['id']}", json={"assignee_id": carol.id})
    assert patch.status_code == 422
    assert alice.get(f"/api/v1/issues/{ok['id']}").json()["assignee"]["id"] == bob.id  # unchanged


# ---------- cross-project isolation ----------
def test_cross_project_access_is_blocked(alice, bob, project):
    theirs = make_project(bob, "Theirs", key="THEM")
    secret = make_issue(bob, theirs["id"], title="secret roadmap")
    mine = make_issue(alice, project["id"])
    url = f"/api/v1/issues/{secret['id']}"
    assert alice.get(url).status_code == 404
    assert alice.patch(url, json={"title": "pwned"}).status_code == 404
    assert alice.delete(url).status_code == 404
    assert alice.get(f"{url}/activities").status_code == 404
    listing = alice.get("/api/v1/issues").json()
    assert [i["id"] for i in listing["items"]] == [mine["id"]]
    assert alice.get(f"/api/v1/issues?project_id={theirs['id']}").status_code == 404
    assert alice.get("/api/v1/issues?q=secret").json()["total"] == 0


def test_cannot_use_other_projects_member_as_assignee(alice, bob, project):
    other = make_project(bob, "Other", key="OTH")
    r = alice.post("/api/v1/issues", json={"project_id": project["id"], "title": "x", "assignee_id": bob.id})
    assert r.status_code == 422
    assert other["id"]  # bob is a member of *his* project only


# ---------- updates, transitions, activity ----------
def test_update_fields_and_activity_log(alice, bob, project):
    add_member(alice, project["id"], bob)
    i = make_issue(alice, project["id"], title="Original")
    url = f"/api/v1/issues/{i['id']}"

    r = alice.patch(url, json={"status": "IN_PROGRESS", "priority": "HIGH", "assignee_id": bob.id})
    assert r.status_code == 200
    out = r.json()
    assert (out["status"], out["priority"], out["assignee"]["id"]) == ("IN_PROGRESS", "HIGH", bob.id)
    r = alice.patch(url, json={"title": "Renamed", "description": "Details", "issue_type": "BUG"})
    assert r.json()["title"] == "Renamed" and r.json()["issue_type"] == "BUG"
    alice.patch(url, json={"assignee_id": None})
    assert alice.get(url).json()["assignee"] is None

    acts = alice.get(f"{url}/activities").json()
    kinds = [a["action_type"] for a in acts["items"]]
    assert acts["total"] == len(kinds) == 6
    assert kinds[-1] == "ISSUE_CREATED"  # newest first
    assert set(kinds) == {
        "ISSUE_CREATED",
        "STATUS_CHANGED",
        "PRIORITY_CHANGED",
        "ASSIGNEE_CHANGED",
        "ISSUE_UPDATED",
    }
    status = next(a for a in acts["items"] if a["action_type"] == "STATUS_CHANGED")
    assert status["details"] == {"from": "OPEN", "to": "IN_PROGRESS"}
    assert status["actor"]["id"] == alice.id
    updated = next(a for a in acts["items"] if a["action_type"] == "ISSUE_UPDATED")
    assert "Details" not in str(updated["details"])  # field names only, never content


def test_noop_patch_writes_no_activity(alice, project):
    i = make_issue(alice, project["id"])
    alice.patch(f"/api/v1/issues/{i['id']}", json={"priority": "MEDIUM", "title": i["title"]})
    assert alice.get(f"/api/v1/issues/{i['id']}/activities").json()["total"] == 1


def test_invalid_status_transition_is_rejected(alice, project):
    i = make_issue(alice, project["id"])
    url = f"/api/v1/issues/{i['id']}"
    r = alice.patch(url, json={"status": "DONE"})  # OPEN -> DONE is not allowed
    assert r.status_code == 422 and "cannot move" in r.json()["error"]["message"]
    assert alice.get(url).json()["status"] == "OPEN"
    for s in ("IN_PROGRESS", "IN_REVIEW", "DONE", "OPEN"):
        assert alice.patch(url, json={"status": s}).status_code == 200, s


def test_updated_at_changes_on_edit(alice, project):
    i = make_issue(alice, project["id"])
    after = alice.patch(f"/api/v1/issues/{i['id']}", json={"priority": "LOW"}).json()
    assert after["updated_at"] > i["updated_at"]


# ---------- delete ----------
def test_delete_permissions(alice, bob, carol, project):
    add_member(alice, project["id"], bob)
    add_member(alice, project["id"], carol)
    by_bob = make_issue(bob, project["id"], title="bob's")
    by_alice = make_issue(alice, project["id"], title="alice's")

    assert carol.delete(f"/api/v1/issues/{by_bob['id']}").status_code == 403  # member, not reporter
    assert bob.delete(f"/api/v1/issues/{by_alice['id']}").status_code == 403
    assert bob.delete(f"/api/v1/issues/{by_bob['id']}").status_code == 204  # reporter
    assert alice.delete(f"/api/v1/issues/{by_alice['id']}").status_code == 204  # owner/reporter
    assert alice.get(f"/api/v1/issues/{by_bob['id']}").status_code == 404


def test_owner_can_delete_any_issue(alice, bob, project):
    add_member(alice, project["id"], bob)
    i = make_issue(bob, project["id"])
    assert alice.delete(f"/api/v1/issues/{i['id']}").status_code == 204


def test_archived_project_is_read_only(alice, project):
    i = make_issue(alice, project["id"])
    alice.patch(f"/api/v1/projects/{project['id']}", json={"is_archived": True})
    assert alice.post("/api/v1/issues", json={"project_id": project["id"], "title": "x"}).status_code == 409
    assert alice.patch(f"/api/v1/issues/{i['id']}", json={"title": "y"}).status_code == 409
    assert alice.delete(f"/api/v1/issues/{i['id']}").status_code == 409
    assert alice.get(f"/api/v1/issues/{i['id']}").status_code == 200  # still readable


# ---------- filtering, search, sort, pagination ----------
@pytest.fixture
def seeded(alice, bob, project):
    add_member(alice, project["id"], bob)
    pid = project["id"]
    rows = [
        ("Login crashes on Safari", "BUG", "CRITICAL", alice.id),
        ("Add dark mode", "FEATURE", "LOW", bob.id),
        ("Update README", "TASK", "MEDIUM", None),
        ("Fix 100% CPU spike", "BUG", "HIGH", bob.id),
        ("Refactor auth_service", "TASK", "LOW", None),
    ]
    out = []
    for title, kind, prio, assignee in rows:
        out.append(make_issue(alice, pid, title=title, issue_type=kind, priority=prio, assignee_id=assignee))
    alice.patch(f"/api/v1/issues/{out[3]['id']}", json={"status": "IN_PROGRESS"})
    return out


def titles(r):
    assert r.status_code == 200, r.text
    return [i["title"] for i in r.json()["items"]]


def test_filter_by_status_priority_type(alice, seeded):
    assert titles(alice.get("/api/v1/issues?status=IN_PROGRESS")) == ["Fix 100% CPU spike"]
    assert titles(alice.get("/api/v1/issues?priority=LOW&sort=created_at&order=asc")) == [
        "Add dark mode",
        "Refactor auth_service",
    ]
    assert sorted(titles(alice.get("/api/v1/issues?issue_type=BUG"))) == [
        "Fix 100% CPU spike",
        "Login crashes on Safari",
    ]
    combo = alice.get("/api/v1/issues?issue_type=BUG&status=OPEN&priority=CRITICAL")
    assert titles(combo) == ["Login crashes on Safari"]


def test_filter_by_assignee(alice, bob, seeded):
    assert titles(alice.get("/api/v1/issues?assignee=me")) == ["Login crashes on Safari"]
    assert sorted(titles(alice.get(f"/api/v1/issues?assignee={bob.id}"))) == [
        "Add dark mode",
        "Fix 100% CPU spike",
    ]
    assert sorted(titles(alice.get("/api/v1/issues?assignee=unassigned"))) == [
        "Refactor auth_service",
        "Update README",
    ]
    assert alice.get("/api/v1/issues?assignee=nonsense").status_code == 422


def test_filter_by_project(alice, seeded):
    other = make_project(alice, "Other", key="OTH")
    make_issue(alice, other["id"], title="Elsewhere")
    assert titles(alice.get(f"/api/v1/issues?project_id={other['id']}")) == ["Elsewhere"]
    assert alice.get("/api/v1/issues").json()["total"] == 6


def test_search_matches_title_and_description_and_escapes_wildcards(alice, project, seeded):
    make_issue(alice, project["id"], title="Unrelated", description="has the word Safari inside")
    assert sorted(titles(alice.get("/api/v1/issues?q=safari"))) == [
        "Login crashes on Safari",
        "Unrelated",
    ]
    assert titles(alice.get("/api/v1/issues?q=100%25")) == ["Fix 100% CPU spike"]  # literal %
    assert titles(alice.get("/api/v1/issues?q=auth_service")) == ["Refactor auth_service"]
    assert alice.get("/api/v1/issues?q=%25").json()["total"] == 1  # '%' is not a wildcard
    assert alice.get("/api/v1/issues?q=zzzz").json()["total"] == 0


def test_sort_by_priority_uses_severity_not_alphabet(alice, seeded):
    desc = titles(alice.get("/api/v1/issues?sort=priority&order=desc"))
    assert desc[:2] == ["Login crashes on Safari", "Fix 100% CPU spike"]  # CRITICAL, HIGH
    asc = [i["priority"] for i in alice.get("/api/v1/issues?sort=priority&order=asc").json()["items"]]
    assert asc == ["LOW", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


def test_sort_by_dates(alice, seeded):
    newest_first = titles(alice.get("/api/v1/issues?sort=created_at&order=desc"))
    assert newest_first[0] == "Refactor auth_service"
    assert titles(alice.get("/api/v1/issues?sort=created_at&order=asc"))[0] == "Login crashes on Safari"
    # touching an issue moves it to the top when sorting by updated_at
    first = seeded[0]
    alice.patch(f"/api/v1/issues/{first['id']}", json={"priority": "HIGH"})
    assert titles(alice.get("/api/v1/issues?sort=updated_at&order=desc"))[0] == first["title"]
    assert alice.get("/api/v1/issues?sort=title").status_code == 422


def test_pagination_metadata_and_stability(alice, seeded):
    p1 = alice.get("/api/v1/issues?page=1&page_size=2&sort=created_at&order=asc").json()
    p2 = alice.get("/api/v1/issues?page=2&page_size=2&sort=created_at&order=asc").json()
    p3 = alice.get("/api/v1/issues?page=3&page_size=2&sort=created_at&order=asc").json()
    assert (p1["total"], p1["pages"], p1["page"], p1["page_size"]) == (5, 3, 1, 2)
    assert len(p1["items"]) == len(p2["items"]) == 2 and len(p3["items"]) == 1
    seen = [i["id"] for p in (p1, p2, p3) for i in p["items"]]
    assert len(set(seen)) == 5  # no duplicates or gaps across pages
    assert alice.get("/api/v1/issues?page=99").json()["items"] == []
    assert alice.get("/api/v1/issues?page=0").status_code == 422
    assert alice.get("/api/v1/issues?page_size=101").status_code == 422


def test_unknown_query_params_are_rejected(alice):
    assert alice.get("/api/v1/issues?statuss=OPEN").status_code == 422


# ---------- database-level guarantees ----------
def test_database_rejects_invalid_enum_values(alice, project, db):
    i = make_issue(alice, project["id"])
    with pytest.raises(IntegrityError):
        db.execute(
            __import__("sqlalchemy").text("UPDATE issues SET status='BOGUS' WHERE id=:id"), {"id": i["id"]}
        )
    db.rollback()


def test_database_enforces_unique_issue_number_per_project(alice, project, db):
    i = make_issue(alice, project["id"])
    row = db.get(Issue, i["id"])
    dup = Issue(
        issue_number=row.issue_number,
        project_id=row.project_id,
        title="dup",
        issue_type=IssueType.BUG,
        status=IssueStatus.OPEN,
        priority=IssuePriority.LOW,
        reporter_id=row.reporter_id,
    )
    db.add(dup)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
