import { exposeDevResetLink } from "@/server/env";
import { Errors } from "@/server/errors";
import { clientIp, json, readJson, route } from "@/server/http";
import { checkRate, recordAttempt } from "@/server/rate-limit";
import { requestPasswordReset } from "@/server/services/users";
import { forgotPasswordSchema } from "@/lib/validators";

const MAX_REQUESTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export const POST = route(async ({ request }) => {
  const { email } = await readJson(request, forgotPasswordSchema);
  const key = `forgot:${clientIp(request)}`;
  const status = checkRate(key, MAX_REQUESTS);
  if (status.limited) throw Errors.rateLimited(status.retryAfterSeconds);
  recordAttempt(key, WINDOW_MS);

  const { resetUrl } = await requestPasswordReset(email);
  // Identical response whether or not the account exists.
  return json({
    ok: true,
    message: "If an account exists for that email, a reset link is on its way.",
    ...(exposeDevResetLink() && resetUrl ? { devResetUrl: resetUrl } : {}),
  });
});
