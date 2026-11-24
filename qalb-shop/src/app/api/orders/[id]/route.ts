import { requireUser } from "@/server/auth/guards";
import { json, paramRoute, readJson } from "@/server/http";
import { getOrder, updateOrderStatus } from "@/server/services/orders";
import { updateOrderSchema } from "@/lib/validators";

type Params = { id: string };

export const GET = paramRoute<Params>(async ({ request, params }) => {
  const user = await requireUser(request);
  return json({ order: await getOrder(user, params.id) });
});

export const PATCH = paramRoute<Params>(async ({ request, params }) => {
  const user = await requireUser(request);
  const { status } = await readJson(request, updateOrderSchema);
  return json({ order: await updateOrderStatus(user, params.id, status) });
});
