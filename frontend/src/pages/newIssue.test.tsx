import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ISSUE, PROJECT, authed, mockApi, page, renderApp } from "../test/utils";

const members = [{ user_id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "OWNER", joined_at: "2026-01-01T00:00:00Z" }];
const base = {
  ...authed,
  "GET /projects": { body: page([PROJECT]) },
  "GET /projects/p1/members": { body: members },
};
const DRAFT = {
  title: "Blank screen after login",
  description: "Login shows a blank screen.",
  steps_to_reproduce: [],
  expected_behavior: "",
  actual_behavior: "Blank screen",
  suggested_priority: "CRITICAL",
  missing_information: ["Browser and version"],
};

describe("create issue", () => {
  it("validates required fields client-side", async () => {
    const m = mockApi(base);
    renderApp("/issues/new");
    await userEvent.click(await screen.findByRole("button", { name: "Create issue" }));
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(m.find("POST", "/issues")).toHaveLength(0);
  });

  it("creates an issue manually (no AI needed) and opens it", async () => {
    const m = mockApi({
      ...base,
      "POST /issues": { status: 201, body: ISSUE },
      "GET /issues/i1": { body: ISSUE },
      "GET /projects/p1": { body: PROJECT },
      "GET /issues/i1/activities": { body: page([]) },
    });
    renderApp("/issues/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Login crashes");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    await userEvent.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(m.find("POST", "/issues")).toHaveLength(1));
    expect(m.find("POST", "/issues")[0].body).toEqual({
      project_id: "p1", title: "Login crashes", issue_type: "BUG", priority: "HIGH", assignee_id: null,
    });
    expect(await screen.findByRole("heading", { name: "Login crashes" })).toBeInTheDocument();
  });

  it("shows server errors without losing the form", async () => {
    mockApi({ ...base, "POST /issues": { status: 409, body: { error: { code: "conflict", message: "This project is archived and read-only." } } } });
    renderApp("/issues/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Something");
    await userEvent.click(screen.getByRole("button", { name: "Create issue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("archived");
    expect(screen.getByLabelText("Title")).toHaveValue("Something");
  });

  it("guides users without a project", async () => {
    mockApi({ ...authed, "GET /projects": { body: page([]) } });
    renderApp("/issues/new");
    expect(await screen.findByText("You need a project first")).toBeInTheDocument();
  });
});

describe("AI assistant", () => {
  it("generates a draft, requires explicit confirmation to apply it, and keeps fields editable", async () => {
    const m = mockApi({ ...base, "POST /ai/structure-bug-report": { body: { draft: DRAFT } } });
    renderApp("/issues/new");
    await userEvent.type(await screen.findByLabelText("Bug report"), "The login page shows a blank screen after I click Sign In.");
    await userEvent.click(screen.getByRole("button", { name: "Generate draft" }));

    const draft = await screen.findByRole("region", { name: "AI draft" });
    expect(draft).toHaveTextContent("Blank screen after login");
    expect(draft).toHaveTextContent("Browser and version"); // missing info surfaced
    expect(draft).toHaveTextContent("only a suggestion");
    expect(screen.getByLabelText("Title")).toHaveValue(""); // NOT applied automatically
    expect(m.find("POST", "/issues")).toHaveLength(0); // and nothing saved

    await userEvent.click(screen.getByRole("button", { name: "Use this draft" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Blank screen after login");
    expect(screen.getByLabelText("Priority")).toHaveValue("CRITICAL");
    expect(screen.getByLabelText("Description")).toHaveValue("Login shows a blank screen.\n\nActual behavior:\nBlank screen");

    await userEvent.type(screen.getByLabelText("Title"), " (edited)"); // user can edit every field
    expect(screen.getByLabelText("Title")).toHaveValue("Blank screen after login (edited)");
    expect(m.find("POST", "/issues")).toHaveLength(0);
  });

  it("shows a loading state while generating", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    mockApi({ ...base, "POST /ai/structure-bug-report": async () => { await gate; return { body: { draft: DRAFT } }; } });
    renderApp("/issues/new");
    await userEvent.type(await screen.findByLabelText("Bug report"), "The login page shows a blank screen.");
    await userEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    expect(await screen.findByRole("button", { name: /generating draft/i })).toBeDisabled();
    release();
    expect(await screen.findByRole("region", { name: "AI draft" })).toBeInTheDocument();
  });

  it("handles AI failure gracefully and manual creation still works", async () => {
    const m = mockApi({
      ...base,
      "POST /ai/structure-bug-report": { status: 503, body: { error: { code: "ai_unavailable", message: "The AI service is unavailable right now. You can still create the issue manually." } } },
      "POST /issues": { status: 201, body: ISSUE },
      "GET /issues/i1": { body: ISSUE },
      "GET /projects/p1": { body: PROJECT },
      "GET /issues/i1/activities": { body: page([]) },
    });
    renderApp("/issues/new");
    await userEvent.type(await screen.findByLabelText("Bug report"), "The login page shows a blank screen.");
    await userEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    expect(await screen.findByText("Couldn't generate a draft")).toBeInTheDocument();
    expect(screen.getByText(/fill out the form manually/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Title"), "By hand");
    await userEvent.click(screen.getByRole("button", { name: "Create issue" }));
    await waitFor(() => expect(m.find("POST", "/issues")).toHaveLength(1));
  });

  it("validates report length before calling the API", async () => {
    const m = mockApi(base);
    renderApp("/issues/new");
    await userEvent.type(await screen.findByLabelText("Bug report"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(m.find("POST", "/ai/structure-bug-report")).toHaveLength(0);
  });
});
