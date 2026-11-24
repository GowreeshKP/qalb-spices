import { requireUser } from "@/server/auth/guards";
import { json, readJson, route } from "@/server/http";
import { updateProfile } from "@/server/services/users";
import { updateProfileSchema } from "@/lib/validators";

export const PATCH = route(async ({ request }) => {
  const actor = await requireUser(request);
  const input = await readJson(request, updateProfileSchema);
  const user = await updateProfile(actor.id, input);
  return json({ user });
});
