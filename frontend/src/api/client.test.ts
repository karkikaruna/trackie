import { describe, expect, it } from "vitest";
import { mockApi } from "../test/utils";
import { ApiError, api, errorMessage, setCsrfToken } from "./client";

describe("api client", () => {
  it("sends the CSRF header on writes but not on reads, and always includes cookies", async () => {
    const m = mockApi({ "GET /x": { body: {} }, "POST /x": { body: {} } });
    setCsrfToken("tok");
    await api("/x");
    await api("/x", { method: "POST", body: { a: 1 } });
    expect(m.calls[0].headers["X-CSRF-Token"]).toBeUndefined();
    expect(m.calls[1].headers["X-CSRF-Token"]).toBe("tok");
    expect(m.fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    setCsrfToken(null);
  });

  it("drops empty query values", async () => {
    const m = mockApi({ "GET /x": { body: {} } });
    await api("/x", { query: { a: "1", b: "", c: undefined } });
    expect(m.calls[0].query.toString()).toBe("a=1");
  });

  it("maps the backend error envelope to ApiError", async () => {
    mockApi({ "GET /x": { status: 422, body: { error: { code: "validation_error", message: "Bad input", details: [1] } } } });
    const err = await api("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "validation_error", message: "Bad input" });
    expect(errorMessage(err)).toBe("Bad input");
  });

  it("reports network failures with a friendly message", async () => {
    const m = mockApi({});
    m.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await api("/x").catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: "network_error" });
    expect(errorMessage(new Error("secret internals"))).toBe("Something went wrong. Please try again.");
  });

  it("returns undefined for 204", async () => {
    mockApi({ "DELETE /x": { status: 204 } });
    expect(await api("/x", { method: "DELETE" })).toBeUndefined();
  });
});
