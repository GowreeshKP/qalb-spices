import { optionalUser, requireAdmin } from "@/server/auth/guards";
import { json, paramRoute, readJson } from "@/server/http";
import { deleteProduct, getProductById, updateProduct } from "@/server/services/products";
import { updateProductSchema } from "@/lib/validators";

type Params = { id: string };

export const GET = paramRoute<Params>(async ({ request, params }) => {
  const user = await optionalUser(request);
  const product = await getProductById(params.id, { isAdmin: user?.role === "ADMIN" });
  return json({ product });
});

export const PATCH = paramRoute<Params>(async ({ request, params }) => {
  await requireAdmin(request);
  const input = await readJson(request, updateProductSchema);
  const product = await updateProduct(params.id, input);
  return json({ product });
});

export const DELETE = paramRoute<Params>(async ({ request, params }) => {
  await requireAdmin(request);
  await deleteProduct(params.id);
  return json({ ok: true });
});
