from sqlalchemy import select

from app.models import Issue, IssueActivity
from app.tests.conftest import add_member, make_issue, make_project


def test_create_project_derives_key_and_owner_membership(alice):
    p = make_project(alice, "Mobile App Redesign", description="Q4 work")
    assert p["key"] == "MAR"
    assert p["my_role"] == "OWNER" and p["member_count"] == 1
    assert p["issue_counts"] == {"OPEN": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "DONE": 0}
    p2 = make_project(alice, "Mobile Admin Region")  # same derived key -> suffix
    assert p2["key"] == "MAR2"


def test_explicit_key_must_be_unique_and_valid(alice, bob):
    make_project(alice, "One", key="SHIP")
    assert bob.post("/api/v1/projects", json={"name": "Two", "key": "ship"}).status_code == 409
    assert bob.post("/api/v1/projects", json={"name": "Two", "key": "1x"}).status_code == 422


def test_project_listing_only_shows_my_projects(alice, bob):
    make_project(alice, "Alice Only")
    mine = make_project(bob, "Bob Only")
    r = bob.get("/api/v1/projects")
    assert [p["id"] for p in r.json()["items"]] == [mine["id"]]
    assert r.json()["total"] == 1 and r.json()["pages"] == 1


def test_non_members_cannot_see_or_modify_a_project(alice, bob):
    p = make_project(alice)
    url = f"/api/v1/projects/{p['id']}"
    assert bob.get(url).status_code == 404  # existence is not revealed
    assert bob.patch(url, json={"name": "Hacked"}).status_code == 404
    assert bob.delete(url).status_code == 404
    assert bob.get(f"{url}/members").status_code == 404
    assert bob.post(f"{url}/members", json={"email": bob.user["email"]}).status_code == 404


def test_members_can_view_but_not_manage(alice, bob, carol):
    p = make_project(alice)
    add_member(alice, p["id"], bob)
    url = f"/api/v1/projects/{p['id']}"
    assert bob.get(url).json()["my_role"] == "MEMBER"
    assert bob.patch(url, json={"name": "Nope"}).status_code == 403
    assert bob.delete(url).status_code == 403
    assert bob.post(f"{url}/members", json={"email": carol.user["email"]}).status_code == 403
    assert bob.delete(f"{url}/members/{alice.id}").status_code == 403


def test_owner_can_edit_and_archive(alice):
    p = make_project(alice)
    url = f"/api/v1/projects/{p['id']}"
    r = alice.patch(url, json={"name": "Renamed", "description": "New", "is_archived": True})
    assert r.status_code == 200 and r.json()["name"] == "Renamed" and r.json()["is_archived"] is True
    assert alice.get("/api/v1/projects").json()["total"] == 0  # hidden by default
    assert alice.get("/api/v1/projects?include_archived=true").json()["total"] == 1
    assert alice.patch(url, json={"name": None}).status_code in (422,)


def test_membership_management(alice, bob):
    p = make_project(alice)
    url = f"/api/v1/projects/{p['id']}/members"
    assert alice.post(url, json={"email": "ghost@example.com"}).status_code == 404
    add_member(alice, p["id"], bob)
    assert alice.post(url, json={"email": bob.user["email"].upper()}).status_code == 409
    members = alice.get(url).json()
    assert {m["role"] for m in members} == {"OWNER", "MEMBER"}
    assert alice.delete(f"{url}/{alice.id}").status_code == 409  # owner can't be removed
    assert alice.delete(f"{url}/{bob.id}").status_code == 204
    assert bob.get(f"/api/v1/projects/{p['id']}").status_code == 404  # access revoked immediately
    assert alice.delete(f"{url}/{bob.id}").status_code == 404


def test_removing_a_member_unassigns_their_issues_and_logs_it(alice, bob, db):
    p = make_project(alice)
    add_member(alice, p["id"], bob)
    issue = make_issue(alice, p["id"], assignee_id=bob.id)
    assert alice.delete(f"/api/v1/projects/{p['id']}/members/{bob.id}").status_code == 204
    after = alice.get(f"/api/v1/issues/{issue['id']}").json()
    assert after["assignee"] is None
    acts = alice.get(f"/api/v1/issues/{issue['id']}/activities").json()["items"]
    assert acts[0]["action_type"] == "ASSIGNEE_CHANGED" and acts[0]["details"]["reason"] == "member_removed"


def test_delete_project_cascades(alice, db):
    p = make_project(alice)
    make_issue(alice, p["id"])
    assert alice.delete(f"/api/v1/projects/{p['id']}").status_code == 204
    assert alice.get(f"/api/v1/projects/{p['id']}").status_code == 404
    assert db.scalars(select(Issue)).all() == []
    assert db.scalars(select(IssueActivity)).all() == []


def test_archived_project_blocks_member_changes(alice, bob):
    p = make_project(alice)
    alice.patch(f"/api/v1/projects/{p['id']}", json={"is_archived": True})
    r = alice.post(f"/api/v1/projects/{p['id']}/members", json={"email": bob.user["email"]})
    assert r.status_code == 409


def test_project_stats_reflect_issues(alice):
    p = make_project(alice)
    a = make_issue(alice, p["id"])
    make_issue(alice, p["id"])
    alice.patch(f"/api/v1/issues/{a['id']}", json={"status": "IN_PROGRESS"})
    stats = alice.get(f"/api/v1/projects/{p['id']}").json()
    assert stats["issue_count"] == 2
    assert stats["issue_counts"]["OPEN"] == 1 and stats["issue_counts"]["IN_PROGRESS"] == 1
