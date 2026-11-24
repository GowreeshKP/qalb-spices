import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { isProduction } from "../env";
import type { UserRole } from "@/lib/validators";

export const SESSION_COOKIE = "qalb_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function toRole(value: string): UserRole {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

/** Pull a named cookie out of a Cookie header. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function tokenFromRequest(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE);
}

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function userFromToken(token: string | null): Promise<PublicUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const { user } = session;
  return { id: user.id, email: user.email, name: user.name, role: toRole(user.role) };
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Revoke every session of a user, optionally keeping the current one. */
export async function destroyUserSessions(userId: string, keepToken?: string | null): Promise<void> {
  await db.session.deleteMany({
    where: {
      userId,
      ...(keepToken ? { NOT: { tokenHash: hashToken(keepToken) } } : {}),
    },
  });
}
