import { requireUser } from "@/server/auth/guards";
import { json, readJson, route } from "@/server/http";
import { addToCart, getCart } from "@/server/services/cart";
import { cartAddSchema } from "@/lib/validators";

export const GET = route(async ({ request }) => {
  const user = await requireUser(request);
  return json({ cart: await getCart(user.id) });
});

export const POST = route(async ({ request }) => {
  const user = await requireUser(request);
  const { productId, quantity } = await readJson(request, cartAddSchema);
  return json({ cart: await addToCart(user.id, productId, quantity) }, { status: 201 });
});
