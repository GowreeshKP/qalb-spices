import { optionalUser, requireAdmin } from "@/server/auth/guards";
import { json, parseQuery, readJson, route } from "@/server/http";
import { createProduct, listProducts } from "@/server/services/products";
import { createProductSchema, listProductsQuerySchema } from "@/lib/validators";

export const GET = route(async ({ request }) => {
  const user = await optionalUser(request);
  const query = parseQuery(request, listProductsQuerySchema);
  const result = await listProducts(query, { isAdmin: user?.role === "ADMIN" });
  return json(result);
});

export const POST = route(async ({ request }) => {
  await requireAdmin(request);
  const input = await readJson(request, createProductSchema);
  const product = await createProduct(input);
  return json({ product }, { status: 201 });
});
