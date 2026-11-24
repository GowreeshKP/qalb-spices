import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { PATCH as patchProfile } from "@/app/api/profile/route";
import { POST as changePassword } from "@/app/api/profile/password/route";
import { db } from "@/server/db";
import { PASSWORD, call, cookieFor, createUser, resetDb } from "./helpers";

interface ErrorBody { error: string; code: string; details?: { fieldErrors: Record<string, string[]> } }
interface UserBody { user: { name: string; email: string } }

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("PATCH /api/profile", () => {
  it("requires login", async () => {
    expect((await call<ErrorBody>(patchProfile, { method: "PATCH", body: { name: "New" } })).status).toBe(401);
  });

  it("updates name and email (normalised)", async () => {
    const user = await createUser({ email: "old@example.com", name: "Old Name" });
    const cookie = await cookieFor(user);
    const res = await call<UserBody>(patchProfile, { method: "PATCH", cookie, body: { name: "  New Name ", email: "NEW@example.com" } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: "New Name", email: "new@example.com" });
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.email).toBe("new@example.com");
  });

  it("rejects an email that belongs to someone else", async () => {
    await createUser({ email: "taken@example.com" });
    const user = await createUser();
    const res = await call<ErrorBody>(patchProfile, { method: "PATCH", cookie: await cookieFor(user), body: { email: "taken@example.com" } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("allows saving your own unchanged email", async () => {
    const user = await createUser({ email: "same@example.com" });
    const res = await call(patchProfile, { method: "PATCH", cookie: await cookieFor(user), body: { email: "same@example.com" } });
    expect(res.status).toBe(200);
  });

  it("validates input and ignores attempts to change the role", async () => {
    const user = await createUser();
    const cookie = await cookieFor(user);
    expect((await call(patchProfile, { method: "PATCH", cookie, body: {} })).status).toBe(422);
    expect((await call(patchProfile, { method: "PATCH", cookie, body: { email: "bad" } })).status).toBe(422);
    await call(patchProfile, { method: "PATCH", cookie, body: { name: "Still User", role: "ADMIN" } });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("USER");
  });
});

describe("POST /api/profile/password", () => {
  const newPassword = "Fresh-password-5";

  it("requires login", async () => {
    expect((await call(changePassword, { method: "POST", body: { currentPassword: PASSWORD, newPassword } })).status).toBe(401);
  });

  it("rejects a wrong current password with a field error", async () => {
    const user = await createUser();
    const res = await call<ErrorBody>(changePassword, {
      method: "POST",
      cookie: await cookieFor(user),
      body: { currentPassword: "Not-my-password-1", newPassword },
    });
    expect(res.status).toBe(422);
    expect(res.body.details?.fieldErrors.currentPassword).toBeDefined();
  });

  it("rejects weak new passwords", async () => {
    const user = await createUser();
    const res = await call(changePassword, { method: "POST", cookie: await cookieFor(user), body: { currentPassword: PASSWORD, newPassword: "weak" } });
    expect(res.status).toBe(422);
  });

  it("changes the password, keeps this session and revokes the others", async () => {
    const user = await createUser({ email: "pw@example.com" });
    const current = await cookieFor(user);
    const other = await cookieFor(user);

    const res = await call(changePassword, { method: "POST", cookie: current, body: { currentPassword: PASSWORD, newPassword } });
    expect(res.status).toBe(200);

    expect((await call<UserBody>(me, { cookie: current })).status).toBe(200);
    expect((await call<ErrorBody>(me, { cookie: other })).status).toBe(401);
    expect((await call(login, { method: "POST", body: { email: "pw@example.com", password: newPassword } })).status).toBe(200);
    expect((await call(login, { method: "POST", body: { email: "pw@example.com", password: PASSWORD } })).status).toBe(401);
  });
});
