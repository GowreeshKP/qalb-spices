import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listProducts, POST as createProductRoute } from "@/app/api/products/route";
import { DELETE as deleteProductRoute, GET as getProduct, PATCH as patchProduct } from "@/app/api/products/[id]/route";
import { db } from "@/server/db";
import { call, cookieFor, createProduct, createUser, resetDb } from "./helpers";

interface ErrorBody { error: string; code: string; details?: { fieldErrors: Record<string, string[]> } }
interface ProductBody { product: { id: string; slug: string; name: string; status: string; version: number; stock: number } }
interface ListBody {
  items: { id: string; name: string; priceCents: number; status: string }[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const validProduct = {
  name: "Star anise",
  description: "Sweet, licorice-like whole stars.",
  category: "whole",
  priceCents: 12900,
  stock: 25,
};

let adminCookie: string;
let userCookie: string;

beforeEach(async () => {
  await resetDb();
  adminCookie = await cookieFor(await createUser({ role: "ADMIN" }));
  userCookie = await cookieFor(await createUser());
});
afterAll(() => db.$disconnect());

describe("GET /api/products (public)", () => {
  it("works for guests and hides archived products", async () => {
    await createProduct({ name: "Visible" });
    await createProduct({ name: "Hidden", status: "ARCHIVED" });
    const res = await call<ListBody>(listProducts);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.name)).toEqual(["Visible"]);
    expect(res.body.meta.total).toBe(1);
  });

  it("ignores status=ARCHIVED from non-admins but honours it for admins", async () => {
    await createProduct({ name: "Visible" });
    await createProduct({ name: "Hidden", status: "ARCHIVED" });
    const guest = await call<ListBody>(listProducts, { path: "/api/products?status=ARCHIVED" });
    expect(guest.body.items.map((i) => i.name)).toEqual(["Visible"]);
    const user = await call<ListBody>(listProducts, { path: "/api/products?status=ARCHIVED", cookie: userCookie });
    expect(user.body.items.map((i) => i.name)).toEqual(["Visible"]);
    const admin = await call<ListBody>(listProducts, { path: "/api/products?status=ARCHIVED", cookie: adminCookie });
    expect(admin.body.items.map((i) => i.name)).toEqual(["Hidden"]);
    const all = await call<ListBody>(listProducts, { cookie: adminCookie });
    expect(all.body.items).toHaveLength(2);
  });

  it("searches case-insensitively across name and description", async () => {
    await createProduct({ name: "Black pepper", description: "Sharp and woody peppercorns." });
    await createProduct({ name: "Cardamom", description: "Sweet green pods for chai." });
    const byName = await call<ListBody>(listProducts, { path: "/api/products?q=PEPPER" });
    expect(byName.body.items.map((i) => i.name)).toEqual(["Black pepper"]);
    const byDescription = await call<ListBody>(listProducts, { path: "/api/products?q=chai" });
    expect(byDescription.body.items.map((i) => i.name)).toEqual(["Cardamom"]);
    const none = await call<ListBody>(listProducts, { path: "/api/products?q=zzz" });
    expect(none.body.items).toEqual([]);
    expect(none.body.meta.total).toBe(0);
  });

  it("treats SQL metacharacters in search as plain text", async () => {
    await createProduct({ name: "Plain" });
    const res = await call<ListBody>(listProducts, { path: `/api/products?q=${encodeURIComponent("'; DROP TABLE Product; --")}` });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(await db.product.count()).toBe(1);
  });

  it("filters by category", async () => {
    await createProduct({ name: "Whole thing", category: "whole" });
    await createProduct({ name: "Blend thing", category: "blend" });
    const res = await call<ListBody>(listProducts, { path: "/api/products?category=blend" });
    expect(res.body.items.map((i) => i.name)).toEqual(["Blend thing"]);
  });

  it("ignores blank filter values like a submitted 'All' option", async () => {
    await createProduct({ name: "Blank filter spice" });
    const res = await call<ListBody>(listProducts, { path: "/api/products?q=&category=&sort=&status=" });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("sorts by price and name", async () => {
    await createProduct({ name: "B", priceCents: 300 });
    await createProduct({ name: "A", priceCents: 500 });
    await createProduct({ name: "C", priceCents: 100 });
    const asc = await call<ListBody>(listProducts, { path: "/api/products?sort=price_asc" });
    expect(asc.body.items.map((i) => i.priceCents)).toEqual([100, 300, 500]);
    const desc = await call<ListBody>(listProducts, { path: "/api/products?sort=price_desc" });
    expect(desc.body.items.map((i) => i.priceCents)).toEqual([500, 300, 100]);
    const name = await call<ListBody>(listProducts, { path: "/api/products?sort=name" });
    expect(name.body.items.map((i) => i.name)).toEqual(["A", "B", "C"]);
  });

  it("paginates with accurate metadata and no overlap", async () => {
    for (let i = 1; i <= 5; i++) await createProduct({ name: `P${i}`, priceCents: i * 100 });
    const page1 = await call<ListBody>(listProducts, { path: "/api/products?sort=price_asc&pageSize=2&page=1" });
    const page3 = await call<ListBody>(listProducts, { path: "/api/products?sort=price_asc&pageSize=2&page=3" });
    const beyond = await call<ListBody>(listProducts, { path: "/api/products?sort=price_asc&pageSize=2&page=9" });
    expect(page1.body.items.map((i) => i.name)).toEqual(["P1", "P2"]);
    expect(page1.body.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(page3.body.items.map((i) => i.name)).toEqual(["P5"]);
    expect(beyond.body.items).toEqual([]);
  });

  it("returns 422 for invalid query parameters", async () => {
    for (const q of ["page=0", "pageSize=500", "sort=random", "category=liquid", "page=abc"]) {
      const res = await call<ErrorBody>(listProducts, { path: `/api/products?${q}` });
      expect(res.status, q).toBe(422);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("GET /api/products/:id", () => {
  it("returns an active product to anyone", async () => {
    const p = await createProduct({ name: "Open" });
    const res = await call<ProductBody, { id: string }>(getProduct, { params: { id: p.id } });
    expect(res.status).toBe(200);
    expect(res.body.product.name).toBe("Open");
  });

  it("returns 404 for unknown ids and for archived products to non-admins", async () => {
    const archived = await createProduct({ status: "ARCHIVED" });
    expect((await call<ErrorBody, { id: string }>(getProduct, { params: { id: "nope" } })).status).toBe(404);
    expect((await call<ErrorBody, { id: string }>(getProduct, { params: { id: archived.id }, cookie: userCookie })).status).toBe(404);
    expect((await call<ProductBody, { id: string }>(getProduct, { params: { id: archived.id }, cookie: adminCookie })).status).toBe(200);
  });
});

describe("POST /api/products", () => {
  it("is forbidden for guests (401) and customers (403)", async () => {
    expect((await call<ErrorBody>(createProductRoute, { method: "POST", body: validProduct })).status).toBe(401);
    expect((await call<ErrorBody>(createProductRoute, { method: "POST", body: validProduct, cookie: userCookie })).status).toBe(403);
    expect(await db.product.count()).toBe(0);
  });

  it("creates a product with a generated unique slug", async () => {
    const first = await call<ProductBody>(createProductRoute, { method: "POST", body: validProduct, cookie: adminCookie });
    const second = await call<ProductBody>(createProductRoute, { method: "POST", body: validProduct, cookie: adminCookie });
    expect(first.status).toBe(201);
    expect(first.body.product).toMatchObject({ slug: "star-anise", status: "ACTIVE", version: 1, stock: 25 });
    expect(second.body.product.slug).toBe("star-anise-2");
  });

  it.each([
    ["missing name", { name: undefined }, "name"],
    ["negative stock", { stock: -3 }, "stock"],
    ["zero price", { priceCents: 0 }, "priceCents"],
    ["string price", { priceCents: "12" }, "priceCents"],
    ["unknown category", { category: "liquid" }, "category"],
    ["remote image", { imageUrl: "https://evil.example/x.png" }, "imageUrl"],
    ["javascript image", { imageUrl: "javascript:alert(1)" }, "imageUrl"],
  ])("rejects %s with a field error", async (_label, patch, field) => {
    const res = await call<ErrorBody>(createProductRoute, { method: "POST", body: { ...validProduct, ...patch }, cookie: adminCookie });
    expect(res.status).toBe(422);
    expect(res.body.details?.fieldErrors[field]).toBeDefined();
    expect(await db.product.count()).toBe(0);
  });

  it("stores markup as inert text and strips control characters", async () => {
    const res = await call<ProductBody>(createProductRoute, {
      method: "POST",
      cookie: adminCookie,
      body: { ...validProduct, name: "<script>alert(1)</script>\u0000Spice" },
    });
    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe("<script>alert(1)</script>Spice");
    expect(res.body.product.slug).toBe("script-alert-1-script-spice");
  });

  it("ignores unknown fields such as id, slug and version", async () => {
    const res = await call<ProductBody>(createProductRoute, {
      method: "POST",
      cookie: adminCookie,
      body: { ...validProduct, id: "hacked", slug: "hacked", version: 99 },
    });
    expect(res.status).toBe(201);
    expect(res.body.product.id).not.toBe("hacked");
    expect(res.body.product.slug).toBe("star-anise");
    expect(res.body.product.version).toBe(1);
  });
});

describe("PATCH /api/products/:id", () => {
  it("is admin-only", async () => {
    const p = await createProduct();
    expect((await call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, body: { stock: 1 } })).status).toBe(401);
    expect((await call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, body: { stock: 1 }, cookie: userCookie })).status).toBe(403);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(p.stock);
  });

  it("updates fields and bumps the version", async () => {
    const p = await createProduct({ stock: 5 });
    const res = await call<ProductBody, { id: string }>(patchProduct, {
      method: "PATCH",
      params: { id: p.id },
      cookie: adminCookie,
      body: { stock: 9, priceCents: 777 },
    });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ stock: 9, version: 2 });
  });

  it("archives and restores, hiding archived items from the public list", async () => {
    const p = await createProduct({ name: "Seasonal" });
    await call(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: { status: "ARCHIVED" } });
    expect((await call<ListBody>(listProducts)).body.items).toEqual([]);
    await call(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: { status: "ACTIVE" } });
    expect((await call<ListBody>(listProducts)).body.items).toHaveLength(1);
  });

  it("rejects a stale version with 409 VERSION_CONFLICT and leaves data untouched", async () => {
    const p = await createProduct({ stock: 5 });
    const first = await call<ProductBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: { stock: 6, version: 1 } });
    expect(first.status).toBe(200);
    const stale = await call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: { stock: 99, version: 1 } });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(6);
  });

  it("lets only one of two concurrent edits with the same version win", async () => {
    const p = await createProduct({ stock: 5 });
    const edit = (stock: number) =>
      call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: { stock, version: 1 } });
    const results = await Promise.all([edit(11), edit(22)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("returns 404 for unknown products and 422 for empty or invalid patches", async () => {
    const p = await createProduct();
    expect((await call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: "missing" }, cookie: adminCookie, body: { stock: 1 } })).status).toBe(404);
    expect((await call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: {} })).status).toBe(422);
    expect((await call<ErrorBody, { id: string }>(patchProduct, { method: "PATCH", params: { id: p.id }, cookie: adminCookie, body: { stock: -1 } })).status).toBe(422);
  });
});

describe("DELETE /api/products/:id", () => {
  it("is admin-only", async () => {
    const p = await createProduct();
    expect((await call<ErrorBody, { id: string }>(deleteProductRoute, { method: "DELETE", params: { id: p.id } })).status).toBe(401);
    expect((await call<ErrorBody, { id: string }>(deleteProductRoute, { method: "DELETE", params: { id: p.id }, cookie: userCookie })).status).toBe(403);
    expect(await db.product.count()).toBe(1);
  });

  it("deletes an unordered product, and then returns 404", async () => {
    const p = await createProduct();
    expect((await call(deleteProductRoute, { method: "DELETE", params: { id: p.id }, cookie: adminCookie })).status).toBe(200);
    expect(await db.product.count()).toBe(0);
    expect((await call<ErrorBody, { id: string }>(deleteProductRoute, { method: "DELETE", params: { id: p.id }, cookie: adminCookie })).status).toBe(404);
  });

  it("refuses to delete a product that appears in orders (409) and suggests archiving", async () => {
    const p = await createProduct();
    const buyer = await createUser();
    await db.order.create({
      data: {
        userId: buyer.id,
        totalCents: p.priceCents,
        shippingName: "A B",
        shippingAddress: "Street 1",
        shippingCity: "City",
        shippingPostal: "12345",
        idempotencyKey: "seed-order-key",
        items: { create: [{ productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: 1 }] },
      },
    });
    const res = await call<ErrorBody, { id: string }>(deleteProductRoute, { method: "DELETE", params: { id: p.id }, cookie: adminCookie });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PRODUCT_HAS_ORDERS");
    expect(await db.product.count()).toBe(1);
  });
});
