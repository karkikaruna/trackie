import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { USER, anonymous, mockApi, renderApp } from "../test/utils";

const emptyDashboard = {
  total_projects: 0, open_issues: 0, in_progress_issues: 0, in_review_issues: 0, completed_issues: 0, total_issues: 0,
  critical_high_issues: 0, status_distribution: { OPEN: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 },
  recently_updated: [], assigned_to_me: [], assigned_to_me_count: 0, recent_activity: [],
};

describe("authentication flows", () => {
  it("redirects unauthenticated visitors from protected pages to login", async () => {
    mockApi({ ...anonymous });
    renderApp("/issues");
    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });

  it("shows validation errors without calling the API", async () => {
    const m = mockApi({ ...anonymous });
    renderApp("/login");
    await userEvent.click(await screen.findByRole("button", { name: /log in/i }));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(m.find("POST", "/auth/login")).toHaveLength(0);
  });

  it("logs in and lands on the dashboard", async () => {
    const m = mockApi({
      ...anonymous,
      "POST /auth/login": { body: { user: USER, csrf_token: "csrf-1" } },
      "GET /dashboard": { body: emptyDashboard },
    });
    renderApp("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Passw0rd!long");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/hello, ada/i)).toBeInTheDocument();
    expect(m.find("POST", "/auth/login")[0].body).toEqual({ email: "ada@example.com", password: "Passw0rd!long" });
  });

  it("shows the server's generic error on bad credentials", async () => {
    mockApi({
      ...anonymous,
      "POST /auth/login": { status: 401, body: { error: { code: "unauthorized", message: "Invalid email or password." } } },
    });
    renderApp("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("validates registration (weak password, mismatch) before submitting", async () => {
    const m = mockApi({ ...anonymous });
    renderApp("/register");
    await userEvent.type(await screen.findByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm password"), "other");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(m.find("POST", "/auth/register")).toHaveLength(0);
  });

  it("surfaces a duplicate-email error from the server", async () => {
    mockApi({
      ...anonymous,
      "POST /auth/register": { status: 409, body: { error: { code: "conflict", message: "An account with this email already exists." } } },
    });
    renderApp("/register");
    await userEvent.type(await screen.findByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Passw0rd!long");
    await userEvent.type(screen.getByLabelText("Confirm password"), "Passw0rd!long");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i));
  });
});
