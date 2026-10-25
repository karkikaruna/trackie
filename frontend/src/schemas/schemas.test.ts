import { describe, expect, it } from "vitest";
import { issueSchema, loginSchema, profileSchema, registerSchema, reportSchema } from ".";

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe("registerSchema", () => {
  const ok = { name: "Ada", email: "ada@example.com", password: "abcdefg1", confirmPassword: "abcdefg1" };
  it("accepts valid input", () => expect(registerSchema.safeParse(ok).success).toBe(true));
  it("rejects weak passwords", () => {
    expect(messages(registerSchema.safeParse({ ...ok, password: "short1", confirmPassword: "short1" }))).toContain("Use at least 8 characters.");
    expect(messages(registerSchema.safeParse({ ...ok, password: "abcdefgh", confirmPassword: "abcdefgh" }))).toContain("Include at least one number.");
    expect(messages(registerSchema.safeParse({ ...ok, password: "12345678", confirmPassword: "12345678" }))).toContain("Include at least one letter.");
  });
  it("rejects mismatched confirmation and bad email", () => {
    expect(messages(registerSchema.safeParse({ ...ok, confirmPassword: "different1" }))).toContain("Passwords don't match.");
    expect(registerSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires both fields", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});

describe("issueSchema", () => {
  const ok = { project_id: "p", title: "Bug", description: "", issue_type: "BUG", priority: "LOW", assignee_id: "" };
  it("requires a title and project and bounds title length", () => {
    expect(issueSchema.safeParse(ok).success).toBe(true);
    expect(issueSchema.safeParse({ ...ok, title: "   " }).success).toBe(false);
    expect(issueSchema.safeParse({ ...ok, title: "x".repeat(201) }).success).toBe(false);
    expect(issueSchema.safeParse({ ...ok, project_id: "" }).success).toBe(false);
    expect(issueSchema.safeParse({ ...ok, priority: "URGENT" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("needs the current password only when changing it", () => {
    expect(profileSchema.safeParse({ name: "A", current_password: "", new_password: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "A", current_password: "", new_password: "newpass12" }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "A", current_password: "old", new_password: "newpass12" }).success).toBe(true);
  });
});

describe("reportSchema", () => {
  it("enforces length limits", () => {
    expect(reportSchema.safeParse({ report: "short" }).success).toBe(false);
    expect(reportSchema.safeParse({ report: "x".repeat(5001) }).success).toBe(false);
    expect(reportSchema.safeParse({ report: "The login button does nothing." }).success).toBe(true);
  });
});
