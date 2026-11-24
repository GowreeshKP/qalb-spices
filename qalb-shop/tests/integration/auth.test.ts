import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { db } from "@/server/db";
import { outbox } from "@/server/mailer";
import { PASSWORD, call, cookieFor, createUser, resetDb } from "./helpers";

interface ErrorBody { error: string; code: string; details?: { fieldErrors: Record<string, string[]> } }
interface UserBody { user: { id: string; email: string; role: string; name: string } }

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("GET /api/health", () => {
  it("reports ok with a working database", async () => {
    const res = await call<{ status: string; database: string }>(health);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const spy = vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("connection refused"));
    const res = await call<{ status: string; database: string }>(health);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", database: "down" });
    expect(JSON.stringify(res.body)).not.toContain("refused");
    spy.mockRestore();
  });
});

describe("POST /api/auth/signup", () => {
  it("creates a USER, starts a session and never returns the password hash", async () => {
    const res = await call<UserBody>(signup, {
      method: "POST",
      body: { name: "Asha Rao", email: "Asha@Example.com", password: PASSWORD },
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "asha@example.com", role: "USER", name: "Asha Rao" });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2/i);
    expect(res.cookie).toMatch(/^qalb_session=/);

    const meRes = await call<UserBody>(me, { cookie: res.cookie });
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe("asha@example.com");

    const stored = await db.user.findUniqueOrThrow({ where: { email: "asha@example.com" } });
    expect(stored.passwordHash).not.toBe(PASSWORD);
  });

  it("cannot be used to become admin via a role field", async () => {
    const res = await call<UserBody>(signup, {
      method: "POST",
      body: { name: "Mallory", email: "m@example.com", password: PASSWORD, role: "ADMIN" },
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("USER");
  });

  it("rejects duplicate emails with 409 EMAIL_TAKEN", async () => {
    await createUser({ email: "dup@example.com" });
    const res = await call<ErrorBody>(signup, {
      method: "POST",
      body: { name: "Dup", email: "DUP@example.com", password: PASSWORD },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("returns 422 with per-field errors", async () => {
    const res = await call<ErrorBody>(signup, { method: "POST", body: { name: "A", email: "nope", password: "short" } });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.details?.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("only one of two simultaneous signups for the same email wins", async () => {
    const attempt = () =>
      call<ErrorBody>(signup, { method: "POST", body: { name: "Racer", email: "race@example.com", password: PASSWORD } });
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.user.count({ where: { email: "race@example.com" } })).toBe(1);
  });

  it("handles malformed requests with clear errors", async () => {
    expect((await call<ErrorBody>(signup, { method: "POST", rawBody: "{not json" })).body.code).toBe("INVALID_JSON");
    const wrongType = await call<ErrorBody>(signup, { method: "POST", rawBody: "a=b", headers: { "content-type": "text/plain" } });
    expect(wrongType.status).toBe(415);
    const emptyObject = await call<ErrorBody>(signup, { method: "POST", body: {} });
    expect(emptyObject.status).toBe(422);
  });
});

describe("CSRF protection", () => {
  it("rejects cross-origin and origin-less mutations", async () => {
    const body = { name: "Eve", email: "eve@example.com", password: PASSWORD };
    const foreign = await call<ErrorBody>(signup, { method: "POST", body, origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe("CSRF_REJECTED");
    const none = await call<ErrorBody>(signup, { method: "POST", body, origin: false });
    expect(none.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    const user = await createUser({ email: "ok@example.com" });
    const res = await call<UserBody>(login, { method: "POST", body: { email: "OK@example.com", password: PASSWORD } });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.cookie).toMatch(/^qalb_session=/);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("gives the same 401 for wrong password and unknown email", async () => {
    await createUser({ email: "real@example.com" });
    const wrong = await call<ErrorBody>(login, { method: "POST", body: { email: "real@example.com", password: "Wrong-pass-1" } });
    const unknown = await call<ErrorBody>(login, { method: "POST", body: { email: "ghost@example.com", password: "Wrong-pass-1" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.cookie).toBeNull();
  });

  it("rate limits repeated failures, then recovers on the next window", async () => {
    await createUser({ email: "brute@example.com" });
    const bad = () => call<ErrorBody>(login, { method: "POST", body: { email: "brute@example.com", password: "Wrong-pass-1" } });
    for (let i = 0; i < 10; i++) expect((await bad()).status).toBe(401);
    const blocked = await bad();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Even the right password is refused while limited.
    const right = await call<ErrorBody>(login, { method: "POST", body: { email: "brute@example.com", password: PASSWORD } });
    expect(right.status).toBe(429);
  });
});

describe("sessions", () => {
  it("GET /api/auth/me needs a valid session", async () => {
    expect((await call<ErrorBody>(me)).status).toBe(401);
    expect((await call<ErrorBody>(me, { cookie: "qalb_session=garbage" })).status).toBe(401);
  });

  it("logout revokes the session server-side", async () => {
    const user = await createUser();
    const cookie = await cookieFor(user);
    const out = await call(logout, { method: "POST", cookie, body: {} });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await call<ErrorBody>(me, { cookie })).status).toBe(401);
  });

  it("expired sessions are rejected and cleaned up", async () => {
    const user = await createUser();
    const cookie = await cookieFor(user);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call<ErrorBody>(me, { cookie })).status).toBe(401);
    expect(await db.session.count()).toBe(0);
  });
});

describe("password reset", () => {
  it("responds identically for known and unknown emails (no enumeration)", async () => {
    await createUser({ email: "known@example.com" });
    const known = await call<Record<string, unknown>>(forgot, { method: "POST", body: { email: "known@example.com" } });
    const unknown = await call<Record<string, unknown>>(forgot, { method: "POST", body: { email: "nobody@example.com" } });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("known@example.com");
    // Dev-only link exposure: present only for real accounts and only when explicitly enabled.
    expect(known.body.devResetUrl).toBeTypeOf("string");
    expect(unknown.body.devResetUrl).toBeUndefined();
  });

  it("never exposes the link in production", async () => {
    await createUser({ email: "prod@example.com" });
    vi.stubEnv("NODE_ENV", "production");
    const res = await call<Record<string, unknown>>(forgot, { method: "POST", body: { email: "prod@example.com" } });
    vi.unstubAllEnvs();
    expect(res.body.devResetUrl).toBeUndefined();
  });

  async function requestToken(email: string): Promise<string> {
    await call(forgot, { method: "POST", body: { email } });
    const url = new URL(outbox.at(-1)?.text.match(/https?:\/\/\S+/)?.[0] ?? "");
    return url.searchParams.get("token") ?? "";
  }

  it("resets the password once, revokes sessions, and lets the new password log in", async () => {
    const user = await createUser({ email: "reset@example.com" });
    const oldCookie = await cookieFor(user);
    const token = await requestToken("reset@example.com");

    const newPassword = "Brand-new-pass-7";
    const res = await call(reset, { method: "POST", body: { token, password: newPassword } });
    expect(res.status).toBe(200);

    expect((await call<ErrorBody>(me, { cookie: oldCookie })).status).toBe(401);
    expect((await call(login, { method: "POST", body: { email: "reset@example.com", password: newPassword } })).status).toBe(200);
    expect((await call(login, { method: "POST", body: { email: "reset@example.com", password: PASSWORD } })).status).toBe(401);

    const reuse = await call<ErrorBody>(reset, { method: "POST", body: { token, password: "Another-pass-8" } });
    expect(reuse.status).toBe(400);
  });

  it("rejects expired, unknown, and weak-password resets", async () => {
    await createUser({ email: "exp@example.com" });
    const token = await requestToken("exp@example.com");

    const weak = await call<ErrorBody>(reset, { method: "POST", body: { token, password: "weak" } });
    expect(weak.status).toBe(422);

    const unknown = await call<ErrorBody>(reset, { method: "POST", body: { token: "x".repeat(43), password: "Strong-pass-1" } });
    expect(unknown.status).toBe(400);

    await db.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await call<ErrorBody>(reset, { method: "POST", body: { token, password: "Strong-pass-1" } });
    expect(expired.status).toBe(400);
  });

  it("only one of two simultaneous uses of a token succeeds", async () => {
    await createUser({ email: "twice@example.com" });
    const token = await requestToken("twice@example.com");
    const use = (password: string) => call<ErrorBody>(reset, { method: "POST", body: { token, password } });
    const results = await Promise.all([use("Winner-pass-1"), use("Loser-pass-22")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe("unexpected failures", () => {
  it("returns a generic 500 without leaking internals", async () => {
    const spy = vi.spyOn(db.user, "findUnique").mockRejectedValueOnce(new Error("secret connection string postgres://u:p@h/db"));
    const res = await call<ErrorBody>(login, { method: "POST", body: { email: "a@b.co", password: "whatever1" } });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong on our side", code: "INTERNAL_ERROR" });
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
