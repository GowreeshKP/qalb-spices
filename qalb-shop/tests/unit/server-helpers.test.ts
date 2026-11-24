import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/server/auth/password";
import {
  clearSessionCookieHeader,
  hashToken,
  newToken,
  readCookie,
  sessionCookieHeader,
  toRole,
} from "@/server/auth/session";
import { AppError, Errors } from "@/server/errors";
import { assertSameOrigin, paramRoute, parseQuery, readJson, route, toAppError, zodDetails } from "@/server/http";
import { logger } from "@/server/logger";
import { checkRate, clearRate, recordAttempt, resetAllRateLimits } from "@/server/rate-limit";

function req(method: string, init: { headers?: Record<string, string>; body?: string } = {}, url = "http://localhost/api/x") {
  return new Request(url, { method, headers: init.headers, body: init.body });
}

describe("password hashing", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("Correct-horse-9");
    const b = await hashPassword("Correct-horse-9");
    expect(a).not.toBe(b);
    expect(a).not.toContain("Correct-horse-9");
    expect(await verifyPassword("Correct-horse-9", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });

  it("burnPasswordCheck resolves without leaking", async () => {
    await expect(burnPasswordCheck("anything")).resolves.toBeUndefined();
  });
});

describe("session helpers", () => {
  it("generates unguessable, unique tokens and stores only hashes", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });

  it("parses cookies defensively", () => {
    expect(readCookie("a=1; qalb_session=tok%20en; b=2", "qalb_session")).toBe("tok en");
    expect(readCookie(null, "x")).toBeNull();
    expect(readCookie("novalue", "novalue")).toBeNull();
    expect(readCookie("x=%E0%A4%A", "x")).toBeNull();
  });

  it("sets HttpOnly + SameSite=Lax, and Secure in production", () => {
    const expires = new Date("2030-01-01T00:00:00Z");
    const dev = sessionCookieHeader("t", expires);
    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Lax");
    expect(dev).toContain("Path=/");
    expect(dev).not.toContain("Secure");

    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieHeader("t", expires)).toContain("Secure");
    expect(clearSessionCookieHeader()).toContain("Secure");
    vi.unstubAllEnvs();
    expect(clearSessionCookieHeader()).toContain("Max-Age=0");
  });

  it("maps unknown roles to the least-privileged one", () => {
    expect(toRole("ADMIN")).toBe("ADMIN");
    expect(toRole("USER")).toBe("USER");
    expect(toRole("root")).toBe("USER");
  });
});

describe("rate limiter", () => {
  beforeEach(() => resetAllRateLimits());

  it("limits after N recorded attempts and reports retry-after", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRate("k", 3, now).limited).toBe(false);
      recordAttempt("k", 60_000, now);
    }
    const status = checkRate("k", 3, now + 1000);
    expect(status.limited).toBe(true);
    expect(status.retryAfterSeconds).toBe(59);
  });

  it("resets after the window and can be cleared", () => {
    const now = 5_000_000;
    recordAttempt("k", 1000, now);
    recordAttempt("k", 1000, now);
    expect(checkRate("k", 2, now).limited).toBe(true);
    expect(checkRate("k", 2, now + 1001).limited).toBe(false);
    recordAttempt("j", 1000, now);
    clearRate("j");
    expect(checkRate("j", 1, now).limited).toBe(false);
  });

  it("keeps keys independent", () => {
    recordAttempt("a", 1000);
    expect(checkRate("b", 1).limited).toBe(false);
  });
});

describe("error mapping", () => {
  it("passes AppError through untouched", () => {
    const err = Errors.notFound("Thing");
    expect(toAppError(err)).toBe(err);
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("turns ZodError into a 422 with field errors", () => {
    const result = z.object({ email: z.string().email("bad email") }).safeParse({ email: "x" });
    if (result.success) throw new Error("expected failure");
    const mapped = toAppError(result.error);
    expect(mapped.status).toBe(422);
    expect(mapped.code).toBe("VALIDATION_ERROR");
    expect(zodDetails(result.error).fieldErrors.email).toEqual(["bad email"]);
  });

  it("hides internals of unknown errors", () => {
    const mapped = toAppError(new Error("SELECT * FROM users WHERE password = 'hunter2'"));
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("hunter2");
    expect(mapped.details).toBeUndefined();
  });
});

describe("assertSameOrigin", () => {
  it("ignores safe methods", () => {
    expect(() => assertSameOrigin(req("GET"))).not.toThrow();
  });

  it("accepts a matching Origin", () => {
    expect(() => assertSameOrigin(req("POST", { headers: { origin: "http://localhost" } }))).not.toThrow();
  });

  it("rejects missing and foreign origins on mutations", () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      expect(() => assertSameOrigin(req(method))).toThrow(AppError);
      expect(() => assertSameOrigin(req(method, { headers: { origin: "https://evil.example" } }))).toThrow(AppError);
    }
  });
});

describe("readJson / parseQuery", () => {
  const schema = z.object({ n: z.number() });

  it("parses valid JSON", async () => {
    const r = req("POST", { headers: { "content-type": "application/json" }, body: '{"n":1}' });
    await expect(readJson(r, schema)).resolves.toEqual({ n: 1 });
  });

  it("rejects wrong content types, bad JSON, and oversize bodies", async () => {
    await expect(readJson(req("POST", { headers: { "content-type": "text/plain" }, body: "{}" }), schema)).rejects.toMatchObject({ status: 415 });
    await expect(readJson(req("POST", { headers: { "content-type": "application/json" }, body: "{oops" }), schema)).rejects.toMatchObject({ code: "INVALID_JSON" });
    const huge = JSON.stringify({ n: 1, pad: "x".repeat(200_000) });
    await expect(readJson(req("POST", { headers: { "content-type": "application/json" }, body: huge }), schema)).rejects.toMatchObject({ status: 413 });
  });

  it("surfaces schema failures as ZodError", async () => {
    const r = req("POST", { headers: { "content-type": "application/json" }, body: '{"n":"1"}' });
    await expect(readJson(r, schema)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("uses the first value of repeated query params", () => {
    const q = parseQuery(req("GET", {}, "http://localhost/x?a=1&a=2"), z.object({ a: z.string() }));
    expect(q.a).toBe("1");
  });
});

describe("route wrapper", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds a request id and returns the standard error shape", async () => {
    const handler = route(async () => {
      throw Errors.forbidden();
    });
    const res = await handler(req("GET", { headers: { "x-request-id": "abc-123" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("x-request-id")).toBe("abc-123");
    expect(await res.json()).toEqual({ error: "You do not have permission to do that", code: "FORBIDDEN" });
  });

  it("never leaks the message or stack of unexpected errors", async () => {
    const handler = route(async () => {
      throw new Error("db password is hunter2");
    });
    const res = await handler(req("GET"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("stack");
    expect(JSON.parse(text)).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("adds Retry-After to rate limit errors", async () => {
    const handler = route(async () => {
      throw Errors.rateLimited(42);
    });
    const res = await handler(req("GET"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("blocks cross-origin mutations before the handler runs", async () => {
    const spy = vi.fn(async () => new Response("ok"));
    const res = await route(spy)(req("POST", { headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("passes awaited params to the handler", async () => {
    const handler = paramRoute<{ id: string }>(async ({ params }) => new Response(params.id));
    const res = await handler(req("GET"), { params: Promise.resolve({ id: "42" }) });
    expect(await res.text()).toBe("42");
  });
});

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("emits JSON lines and redacts sensitive keys", () => {
    vi.stubEnv("LOG_LEVEL", "info");
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("login", { email: "a@b.co", password: "hunter2", sessionToken: "abc" });
    const line = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line.msg).toBe("login");
    expect(line.level).toBe("info");
    expect(line.password).toBe("[redacted]");
    expect(line.sessionToken).toBe("[redacted]");
    expect(line.email).toBe("a@b.co");
  });

  it("respects the log level", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("quiet");
    expect(spy).not.toHaveBeenCalled();
  });
});
