import { requireUser } from "@/server/auth/guards";
import { tokenFromRequest } from "@/server/auth/session";
import { json, readJson, route } from "@/server/http";
import { changePassword } from "@/server/services/users";
import { changePasswordSchema } from "@/lib/validators";

export const POST = route(async ({ request }) => {
  const actor = await requireUser(request);
  const { currentPassword, newPassword } = await readJson(request, changePasswordSchema);
  await changePassword(actor.id, currentPassword, newPassword, tokenFromRequest(request));
  return json({ ok: true });
});
