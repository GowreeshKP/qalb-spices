import { requireUser } from "@/server/auth/guards";
import { json, paramRoute, readJson } from "@/server/http";
import { removeFromCart, setCartQuantity } from "@/server/services/cart";
import { cartUpdateSchema } from "@/lib/validators";

type Params = { productId: string };

export const PATCH = paramRoute<Params>(async ({ request, params }) => {
  const user = await requireUser(request);
  const { quantity } = await readJson(request, cartUpdateSchema);
  return json({ cart: await setCartQuantity(user.id, params.productId, quantity) });
});

export const DELETE = paramRoute<Params>(async ({ request, params }) => {
  const user = await requireUser(request);
  return json({ cart: await removeFromCart(user.id, params.productId) });
});
