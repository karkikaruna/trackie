import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ISSUE, authed, mockApi, renderApp } from "../test/utils";

const dash = {
  total_projects: 2, open_issues: 5, in_progress_issues: 3, in_review_issues: 0, completed_issues: 7, total_issues: 15,
  critical_high_issues: 4, status_distribution: { OPEN: 5, IN_PROGRESS: 3, IN_REVIEW: 0, DONE: 7 },
  recently_updated: [ISSUE], assigned_to_me: [{ ...ISSUE, id: "i2", key: "SHIP-2", title: "Mine" }], assigned_to_me_count: 1,
  recent_activity: [{ id: "a1", issue_id: "i1", issue_key: "SHIP-1", issue_title: "Login crashes", actor: { id: "u1", name: "Ada Lovelace" }, action_type: "STATUS_CHANGED", details: { from: "OPEN", to: "IN_PROGRESS" }, created_at: new Date().toISOString() }],
};

describe("dashboard", () => {
  it("renders statistics from the API response (no hardcoded numbers)", async () => {
    mockApi({ ...authed, "GET /dashboard": { body: dash } });
    renderApp("/dashboard");
    expect(await screen.findByText("Active projects")).toBeInTheDocument();
    const stat = (label: string) => screen.getByText(label).parentElement!;
    expect(stat("Active projects")).toHaveTextContent("2");
    expect(stat("Open issues")).toHaveTextContent("5");
    expect(stat("In progress")).toHaveTextContent("3");
    expect(stat("Completed")).toHaveTextContent("7");
    expect(stat("Critical / high (not done)")).toHaveTextContent("4");
    expect(screen.getByRole("img", { name: /Open 5, In Progress 3, In Review 0, Done 7/ })).toBeInTheDocument();
    expect(screen.getByText("Mine")).toBeInTheDocument();
    expect(screen.getByText(/changed status from Open to In Progress/)).toBeInTheDocument();
  });

  it("shows a helpful empty state for new users", async () => {
    mockApi({ ...authed, "GET /dashboard": { body: { ...dash, total_projects: 0, total_issues: 0, recent_activity: [], recently_updated: [], assigned_to_me: [] } } });
    renderApp("/dashboard");
    expect(await screen.findByText("Welcome to ShipTrack")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a project" })).toBeInTheDocument();
  });

  it("shows an error state when the API fails", async () => {
    mockApi({ ...authed, "GET /dashboard": { status: 500, body: { error: { code: "internal_error", message: "An unexpected error occurred." } } } });
    renderApp("/dashboard");
    expect(await screen.findByText("An unexpected error occurred.")).toBeInTheDocument();
  });
});
