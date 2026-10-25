import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ISSUE, PROJECT, authed, mockApi, page, renderApp } from "../test/utils";

const base = { ...authed, "GET /projects": { body: page([PROJECT]) } };

describe("issues list", () => {
  it("shows a loading state, then results", async () => {
    mockApi({ ...base, "GET /issues": { body: page([ISSUE]) } });
    renderApp("/issues");
    expect(await screen.findByText("Loading issues…")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Login crashes" })).toHaveAttribute("href", "/issues/i1");
    expect(screen.getByText("SHIP-1")).toBeInTheDocument();
  });

  it("filters on the server: changing a filter sends query parameters", async () => {
    const m = mockApi({ ...base, "GET /issues": { body: page([ISSUE]) } });
    renderApp("/issues");
    await screen.findByRole("link", { name: "Login crashes" });

    await userEvent.selectOptions(screen.getByLabelText("Status"), "IN_PROGRESS");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "me");

    await waitFor(() => {
      const last = m.find("GET", "/issues").at(-1)!;
      expect(last.query.get("status")).toBe("IN_PROGRESS");
      expect(last.query.get("priority")).toBe("HIGH");
      expect(last.query.get("assignee")).toBe("me");
      expect(last.query.get("page")).toBe("1");
    });
  });

  it("debounces search and sends it as q", async () => {
    const m = mockApi({ ...base, "GET /issues": { body: page([ISSUE]) } });
    renderApp("/issues");
    await screen.findByRole("link", { name: "Login crashes" });
    await userEvent.type(screen.getByLabelText("Search"), "crash");
    await waitFor(() => expect(m.find("GET", "/issues").at(-1)!.query.get("q")).toBe("crash"));
    const withQ = m.find("GET", "/issues").filter((c) => c.query.has("q"));
    expect(withQ).toHaveLength(1); // one request for the whole word, not one per keystroke
  });

  it("restores filters from the URL", async () => {
    const m = mockApi({ ...base, "GET /issues": { body: page([ISSUE]) } });
    renderApp("/issues?status=DONE&sort=priority&page=2");
    await screen.findByRole("link", { name: "Login crashes" });
    const first = m.find("GET", "/issues")[0];
    expect(first.query.get("status")).toBe("DONE");
    expect(first.query.get("sort")).toBe("priority");
    expect(first.query.get("page")).toBe("2");
    expect(screen.getByLabelText("Status")).toHaveValue("DONE");
  });

  it("shows an empty state with a way to clear filters", async () => {
    mockApi({ ...base, "GET /issues": { body: page([]) } });
    renderApp("/issues?status=DONE");
    expect(await screen.findByText("No issues match your filters")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /clear filters/i })[0]);
    expect(await screen.findByText("No issues yet")).toBeInTheDocument();
  });

  it("shows an error state and recovers on retry", async () => {
    let fail = true;
    mockApi({
      ...base,
      "GET /issues": () => (fail ? { status: 500, body: { error: { code: "internal_error", message: "An unexpected error occurred." } } } : { body: page([ISSUE]) }),
    });
    renderApp("/issues");
    expect(await screen.findByText("An unexpected error occurred.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("link", { name: "Login crashes" })).toBeInTheDocument();
  });

  it("paginates using backend metadata", async () => {
    const m = mockApi({ ...base, "GET /issues": { body: { items: [ISSUE], total: 45, page: 1, page_size: 20, pages: 3 } } });
    renderApp("/issues");
    expect(await screen.findByText(/Page 1 of 3 · 45 results/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(m.find("GET", "/issues").at(-1)!.query.get("page")).toBe("2"));
  });
});

describe("issue detail", () => {
  const detail = {
    ...base,
    "GET /issues/i1": { body: ISSUE },
    "GET /projects/p1": { body: PROJECT },
    "GET /projects/p1/members": { body: [{ user_id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "OWNER", joined_at: "2026-01-01T00:00:00Z" }] },
    "GET /issues/i1/activities": { body: page([]) },
  };

  it("only offers valid status transitions and sends a PATCH on change", async () => {
    const m = mockApi({ ...detail, "PATCH /issues/i1": { body: { ...ISSUE, status: "IN_PROGRESS" } } });
    renderApp("/issues/i1");
    const status = await screen.findByLabelText("Status");
    const options = within(status).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Open", "In Progress"]); // OPEN -> DONE is not offered

    await userEvent.selectOptions(status, "IN_PROGRESS");
    await waitFor(() => expect(m.find("PATCH", "/issues/i1")).toHaveLength(1));
    expect(m.find("PATCH", "/issues/i1")[0].body).toEqual({ status: "IN_PROGRESS" });
    expect(m.find("PATCH", "/issues/i1")[0].headers["X-CSRF-Token"]).toBe("csrf-123");
  });

  it("shows a friendly page for issues you can't access", async () => {
    mockApi({ ...authed, "GET /issues/zzz": { status: 404, body: { error: { code: "not_found", message: "Issue not found." } } }, "GET /issues/zzz/activities": { status: 404, body: { error: { code: "not_found", message: "Issue not found." } } } });
    renderApp("/issues/zzz");
    expect(await screen.findByText(/doesn't exist or you don't have access/i)).toBeInTheDocument();
  });

  it("asks for confirmation before deleting", async () => {
    const m = mockApi({ ...detail, "DELETE /issues/i1": { status: 204 }, "GET /issues": { body: page([]) } });
    renderApp("/issues/i1");
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(m.find("DELETE", "/issues/i1")).toHaveLength(0); // nothing yet
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete issue" }));
    await waitFor(() => expect(m.find("DELETE", "/issues/i1")).toHaveLength(1));
  });
});
