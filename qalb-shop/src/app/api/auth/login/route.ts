import { createSession, sessionCookieHeader } from "@/server/auth/session";
import { Errors } from "@/server/errors";
import { clientIp, json, readJson, route } from "@/server/http";
import { checkRate, clearRate, recordAttempt } from "@/server/rate-limit";
import { authenticate } from "@/server/services/users";
import { logger } from "@/server/logger";
import { loginSchema } from "@/lib/validators";

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

export const POST = route(async ({ request }) => {
  const input = await readJson(request, loginSchema);
  const key = `login:${clientIp(request)}:${input.email}`;

  const status = checkRate(key, MAX_FAILURES);
  if (status.limited) throw Errors.rateLimited(status.retryAfterSeconds);

  const user = await authenticate(input.email, input.password);
  if (!user) {
    recordAttempt(key, WINDOW_MS);
    logger.warn("login_failed", { ip: clientIp(request) });
    throw Errors.invalidCredentials();
  }
  clearRate(key);
  const { token, expiresAt } = await createSession(user.id);
  return json({ user }, { headers: { "set-cookie": sessionCookieHeader(token, expiresAt) } });
});
