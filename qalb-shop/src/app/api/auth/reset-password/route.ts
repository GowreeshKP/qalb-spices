import { json, readJson, route } from "@/server/http";
import { resetPassword } from "@/server/services/users";
import { resetPasswordSchema } from "@/lib/validators";

export const POST = route(async ({ request }) => {
  const { token, password } = await readJson(request, resetPasswordSchema);
  await resetPassword(token, password);
  return json({ ok: true });
});
