import { requireUser } from "@/server/auth/guards";
import { json, parseQuery, readJson, route } from "@/server/http";
import { createOrder, listOrders } from "@/server/services/orders";
import { checkoutSchema, listOrdersQuerySchema } from "@/lib/validators";

export const GET = route(async ({ request }) => {
  const user = await requireUser(request);
  const query = parseQuery(request, listOrdersQuerySchema);
  return json(await listOrders(user, query));
});

/** 201 for a new order; 200 when the same idempotency key is replayed. */
export const POST = route(async ({ request }) => {
  const user = await requireUser(request);
  const input = await readJson(request, checkoutSchema);
  const { order, created } = await createOrder(user.id, input);
  return json({ order }, { status: created ? 201 : 200 });
});
