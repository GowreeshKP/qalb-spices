import { db } from "../db";
import { appUrl } from "../env";
import { Errors } from "../errors";
import { sendMail } from "../mailer";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { destroyUserSessions, hashToken, newToken, toRole, type PublicUser } from "../auth/session";
import { logger } from "../logger";
import type { SignupInput } from "@/lib/validators";

const RESET_TTL_MS = 60 * 60 * 1000;

function toPublic(user: { id: string; email: string; name: string; role: string }): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: toRole(user.role) };
}

export async function signup(input: SignupInput): Promise<PublicUser> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw Errors.conflict("An account with that email already exists", "EMAIL_TAKEN");
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: { email: input.email, name: input.name, passwordHash, role: "USER" },
    });
    return toPublic(user);
  } catch (error) {
    // Lost a race with a concurrent signup for the same email.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      throw Errors.conflict("An account with that email already exists", "EMAIL_TAKEN");
    }
    throw error;
  }
}

/** Returns the user when credentials match, or null. Always spends comparable time. */
export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await burnPasswordCheck(password);
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? toPublic(user) : null;
}

export async function updateProfile(userId: string, input: { name?: string; email?: string }): Promise<PublicUser> {
  if (input.email) {
    const other = await db.user.findUnique({ where: { email: input.email } });
    if (other && other.id !== userId) throw Errors.conflict("An account with that email already exists", "EMAIL_TAKEN");
  }
  const user = await db.user.update({
    where: { id: userId },
    data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.email !== undefined ? { email: input.email } : {}) },
  });
  return toPublic(user);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepToken: string | null,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("User");
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw Errors.validation({ fieldErrors: { currentPassword: ["Current password is incorrect"] } });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await destroyUserSessions(userId, keepToken);
}

/**
 * Always resolves the same way whether or not the email exists (no account enumeration).
 * Returns the reset URL only so callers can expose it in explicitly-enabled dev mode.
 */
export async function requestPasswordReset(email: string): Promise<{ resetUrl: string | null }> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { resetUrl: null };
  const token = newToken();
  await db.passwordResetToken.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: "Reset your QALB Spices password",
    text: `Use this link within one hour to choose a new password:\n\n${resetUrl}\n\nIf you did not ask for this, ignore this email.`,
  });
  logger.info("password_reset_requested", { userId: user.id });
  return { resetUrl };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw Errors.badRequest("This reset link is invalid or has expired");
  }
  const passwordHash = await hashPassword(newPassword);
  // Single-use: only the first request to flip usedAt wins.
  const claimed = await db.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw Errors.badRequest("This reset link is invalid or has expired");
  await db.user.update({ where: { id: record.userId }, data: { passwordHash } });
  await destroyUserSessions(record.userId);
}
