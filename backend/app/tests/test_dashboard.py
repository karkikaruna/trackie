from app.tests.conftest import add_member, make_issue, make_project


def test_empty_dashboard(alice):
    d = alice.get("/api/v1/dashboard").json()
    assert d["total_projects"] == 0 and d["total_issues"] == 0
    assert d["status_distribution"] == {"OPEN": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "DONE": 0}
    assert d["recently_updated"] == [] and d["assigned_to_me"] == [] and d["recent_activity"] == []


def test_dashboard_reflects_real_data(alice, bob):
    p = make_project(alice, "ShipTrack", key="SHIP")
    add_member(alice, p["id"], bob)
    a = make_issue(alice, p["id"], title="a", priority="CRITICAL", assignee_id=alice.id)
    b = make_issue(alice, p["id"], title="b", priority="HIGH")
    c = make_issue(alice, p["id"], title="c", priority="LOW", assignee_id=bob.id)
    make_issue(alice, p["id"], title="d")
    alice.patch(f"/api/v1/issues/{b['id']}", json={"status": "IN_PROGRESS"})
    alice.patch(f"/api/v1/issues/{c['id']}", json={"status": "IN_PROGRESS"})
    alice.patch(f"/api/v1/issues/{c['id']}", json={"status": "DONE"})

    d = alice.get("/api/v1/dashboard").json()
    assert d["total_projects"] == 1
    assert d["total_issues"] == 4
    assert (d["open_issues"], d["in_progress_issues"], d["completed_issues"]) == (2, 1, 1)
    assert d["critical_high_issues"] == 2
    assert d["assigned_to_me_count"] == 1 and d["assigned_to_me"][0]["id"] == a["id"]
    assert d["recently_updated"][0]["id"] == c["id"]  # most recently touched
    assert d["recent_activity"][0]["issue_key"] == "SHIP-3"
    assert d["recent_activity"][0]["action_type"] == "STATUS_CHANGED"

    # Bob only sees the same project because he's a member; his own assignments differ.
    bd = bob.get("/api/v1/dashboard").json()
    assert bd["total_issues"] == 4 and bd["assigned_to_me_count"] == 0  # his only issue is DONE


def test_dashboard_is_scoped_to_the_user(alice, bob):
    make_issue(alice, make_project(alice)["id"])
    d = bob.get("/api/v1/dashboard").json()
    assert d["total_projects"] == 0 and d["total_issues"] == 0 and d["recent_activity"] == []


def test_archived_projects_are_excluded_from_project_count(alice):
    p = make_project(alice)
    make_issue(alice, p["id"])
    alice.patch(f"/api/v1/projects/{p['id']}", json={"is_archived": True})
    d = alice.get("/api/v1/dashboard").json()
    assert d["total_projects"] == 0 and d["total_issues"] == 1
