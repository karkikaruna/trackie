import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "../App";
import { setCsrfToken } from "../api/client";
import { AuthProvider } from "../features/auth/AuthContext";
import { createQueryClient } from "../queryClient";
import type { Issue, Project, User } from "../types/api";

export const USER: User = { id: "u1", name: "Ada Lovelace", email: "ada@example.com", created_at: "2026-01-01T00:00:00Z" };

export const PROJECT: Project = {
  id: "p1",
  name: "ShipTrack",
  key: "SHIP",
  description: "Demo",
  owner: { id: "u1", name: "Ada Lovelace" },
  is_archived: false,
  my_role: "OWNER",
  member_count: 1,
  issue_count: 1,
  issue_counts: { OPEN: 1, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const ISSUE: Issue = {
  id: "i1",
  key: "SHIP-1",
  issue_number: 1,
  project_id: "p1",
  project_key: "SHIP",
  project_name: "ShipTrack",
  title: "Login crashes",
  description: "Blank screen",
  issue_type: "BUG",
  status: "OPEN",
  priority: "HIGH",
  reporter: { id: "u1", name: "Ada Lovelace" },
  assignee: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, page_size: 20, pages: 1 });

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}
type Handler = (call: RecordedCall) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;
export type Routes = Record<string, Handler | { status?: number; body?: unknown }>;

/**
 * Replace global fetch with an in-memory router. Keys look like "GET /issues" (path is relative to
 * /api/v1). Unmatched requests fail the test loudly instead of silently returning nothing.
 */
export function mockApi(routes: Routes) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = init?.method ?? "GET";
    const call: RecordedCall = {
      method,
      path,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Unmocked request: ${method} ${path}`);
    const result = typeof route === "function" ? await route(call) : route;
    const status = result.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(result.body ?? {}), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, find: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path) };
}

export const authed = { "GET /auth/me": { body: { user: USER, csrf_token: "csrf-123" } } } satisfies Routes;
export const anonymous = { "GET /auth/me": { status: 401, body: { error: { code: "unauthorized", message: "Authentication required." } } } } satisfies Routes;

export function renderApp(route = "/") {
  setCsrfToken(null);
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
