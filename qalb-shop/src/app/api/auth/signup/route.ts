import { createSession, sessionCookieHeader } from "@/server/auth/session";
import { json, readJson, route } from "@/server/http";
import { signup } from "@/server/services/users";
import { signupSchema } from "@/lib/validators";

export const POST = route(async ({ request }) => {
  const input = await readJson(request, signupSchema);
  const user = await signup(input);
  const { token, expiresAt } = await createSession(user.id);
  return json({ user }, { status: 201, headers: { "set-cookie": sessionCookieHeader(token, expiresAt) } });
});
