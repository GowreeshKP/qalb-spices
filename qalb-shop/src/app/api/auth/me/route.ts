import { requireUser } from "@/server/auth/guards";
import { json, route } from "@/server/http";

export const GET = route(async ({ request }) => {
  const user = await requireUser(request);
  return json({ user });
});
