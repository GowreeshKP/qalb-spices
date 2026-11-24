import { clearSessionCookieHeader, destroySession, tokenFromRequest } from "@/server/auth/session";
import { json, route } from "@/server/http";

export const POST = route(async ({ request }) => {
  await destroySession(tokenFromRequest(request));
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookieHeader() } });
});
