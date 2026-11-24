import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as removeCartItem, PATCH as updateCartItem } from "@/app/api/cart/[productId]/route";
import { GET as getCart, POST as addToCart } from "@/app/api/cart/route";
import { GET as getOrder, PATCH as patchOrder } from "@/app/api/orders/[id]/route";
import { GET as listOrders, POST as checkout } from "@/app/api/orders/route";
import { db } from "@/server/db";
import { call, checkoutBody, cookieFor, createProduct, createUser, resetDb } from "./helpers";

interface ErrorBody { error: string; code: string; details?: { fieldErrors?: Record<string, string[]>; available?: number } }
interface CartBody { cart: { items: { productId: string; quantity: number }[]; itemCount: number; totalCents: number } }
interface OrderBody { order: { id: string; status: string; totalCents: number; items: { name: string; unitPriceCents: number; quantity: number }[] } }
interface OrderListBody { items: { id: string }[]; meta: { total: number } }

const add = (cookie: string | null, productId: string, quantity: number) =>
  call<CartBody & ErrorBody>(addToCart, { method: "POST", cookie, body: { productId, quantity } });

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("cart", () => {
  it("requires login for every cart operation", async () => {
    const p = await createProduct();
    expect((await call<ErrorBody>(getCart)).status).toBe(401);
    expect((await add(null, p.id, 1)).status).toBe(401);
    expect((await call<ErrorBody, { productId: string }>(updateCartItem, { method: "PATCH", params: { productId: p.id }, body: { quantity: 2 } })).status).toBe(401);
    expect((await call<ErrorBody, { productId: string }>(removeCartItem, { method: "DELETE", params: { productId: p.id } })).status).toBe(401);
  });

  it("adds items, merges repeat adds and totals using database prices", async () => {
    const user = await createUser();
    const cookie = await cookieFor(user);
    const pepper = await createProduct({ priceCents: 34900 });
    const clove = await createProduct({ priceCents: 1000 });
    expect((await add(cookie, pepper.id, 1)).status).toBe(201);
    await add(cookie, pepper.id, 2);
    const res = await add(cookie, clove.id, 3);
    expect(res.body.cart.itemCount).toBe(6);
    expect(res.body.cart.totalCents).toBe(34900 * 3 + 1000 * 3);
    expect(res.body.cart.items.find((i) => i.productId === pepper.id)?.quantity).toBe(3);
  });

  it("refuses more than the stock on hand, with the available amount", async () => {
    const cookie = await cookieFor(await createUser());
    const p = await createProduct({ stock: 2 });
    const res = await add(cookie, p.id, 3);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_STOCK");
    expect(res.body.details?.available).toBe(2);
    await add(cookie, p.id, 2);
    expect((await add(cookie, p.id, 1)).status).toBe(409);
  });

  it("refuses out-of-stock, archived and unknown products", async () => {
    const cookie = await cookieFor(await createUser());
    const soldOut = await createProduct({ stock: 0 });
    const archived = await createProduct({ status: "ARCHIVED" });
    expect((await add(cookie, soldOut.id, 1)).body.code).toBe("INSUFFICIENT_STOCK");
    const arch = await add(cookie, archived.id, 1);
    expect(arch.status).toBe(409);
    expect(arch.body.code).toBe("PRODUCT_UNAVAILABLE");
    expect((await add(cookie, "missing", 1)).status).toBe(404);
  });

  it.each([0, -1, 1.5, 21])("rejects quantity %s", async (quantity) => {
    const cookie = await cookieFor(await createUser());
    const p = await createProduct({ stock: 100 });
    expect((await add(cookie, p.id, quantity)).status).toBe(422);
  });

  it("updates and removes lines, and keeps carts private per user", async () => {
    const alice = await cookieFor(await createUser());
    const bob = await cookieFor(await createUser());
    const p = await createProduct({ stock: 10 });
    await add(alice, p.id, 1);

    const updated = await call<CartBody, { productId: string }>(updateCartItem, { method: "PATCH", params: { productId: p.id }, cookie: alice, body: { quantity: 4 } });
    expect(updated.body.cart.itemCount).toBe(4);

    expect((await call<CartBody>(getCart, { cookie: bob })).body.cart.items).toEqual([]);
    expect((await call<ErrorBody, { productId: string }>(updateCartItem, { method: "PATCH", params: { productId: p.id }, cookie: bob, body: { quantity: 2 } })).status).toBe(404);
    expect((await call<ErrorBody, { productId: string }>(updateCartItem, { method: "PATCH", params: { productId: p.id }, cookie: alice, body: { quantity: 11 } })).status).toBe(409);

    const removed = await call<CartBody, { productId: string }>(removeCartItem, { method: "DELETE", params: { productId: p.id }, cookie: alice });
    expect(removed.body.cart.items).toEqual([]);
  });
});

describe("POST /api/orders (checkout)", () => {
  async function userWithCart(items: { stock: number; priceCents: number; quantity: number }[]) {
    const user = await createUser();
    const cookie = await cookieFor(user);
    const products = [];
    for (const item of items) {
      const p = await createProduct({ stock: item.stock, priceCents: item.priceCents });
      await add(cookie, p.id, item.quantity);
      products.push(p);
    }
    return { user, cookie, products };
  }

  it("requires login and validates the body", async () => {
    expect((await call<ErrorBody>(checkout, { method: "POST", body: checkoutBody("key-12345678") })).status).toBe(401);
    const { cookie } = await userWithCart([{ stock: 5, priceCents: 100, quantity: 1 }]);
    const res = await call<ErrorBody>(checkout, { method: "POST", cookie, body: { ...checkoutBody("key-12345678"), shippingPostal: "" } });
    expect(res.status).toBe(422);
    expect(res.body.details?.fieldErrors?.shippingPostal).toBeDefined();
  });

  it("rejects an empty cart", async () => {
    const cookie = await cookieFor(await createUser());
    const res = await call<ErrorBody>(checkout, { method: "POST", cookie, body: checkoutBody("key-12345678") });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMPTY_CART");
  });

  it("creates the order, snapshots prices, decrements stock and clears the cart", async () => {
    const { cookie, products } = await userWithCart([
      { stock: 10, priceCents: 34900, quantity: 2 },
      { stock: 4, priceCents: 1050, quantity: 1 },
    ]);
    const res = await call<OrderBody>(checkout, { method: "POST", cookie, body: checkoutBody("key-12345678") });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("PLACED");
    expect(res.body.order.totalCents).toBe(34900 * 2 + 1050);
    expect(res.body.order.items).toHaveLength(2);

    expect((await db.product.findUniqueOrThrow({ where: { id: products[0]?.id } })).stock).toBe(8);
    expect((await db.product.findUniqueOrThrow({ where: { id: products[1]?.id } })).stock).toBe(3);
    expect((await call<CartBody>(getCart, { cookie })).body.cart.items).toEqual([]);

    // Later price changes do not rewrite history.
    await db.product.update({ where: { id: products[0]?.id }, data: { priceCents: 1 } });
    const again = await call<OrderBody, { id: string }>(getOrder, { params: { id: res.body.order.id }, cookie });
    expect(again.body.order.items.find((i) => i.unitPriceCents === 34900)).toBeDefined();
  });

  it("is idempotent: replaying a key returns the same order and charges stock once", async () => {
    const { cookie, products } = await userWithCart([{ stock: 5, priceCents: 500, quantity: 2 }]);
    const first = await call<OrderBody>(checkout, { method: "POST", cookie, body: checkoutBody("same-key-123") });
    const replay = await call<OrderBody>(checkout, { method: "POST", cookie, body: checkoutBody("same-key-123") });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect(await db.order.count()).toBe(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: products[0]?.id } })).stock).toBe(3);
  });

  it("creates only one order when the same key is submitted twice at once", async () => {
    const { cookie, products } = await userWithCart([{ stock: 5, priceCents: 500, quantity: 1 }]);
    const submit = () => call<OrderBody | ErrorBody>(checkout, { method: "POST", cookie, body: checkoutBody("double-click-1") });
    const results = await Promise.all([submit(), submit()]);
    expect(await db.order.count()).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    // The loser either replays the winner (200) or sees the already-emptied cart (400); never a second order.
    expect(results.every((r) => [200, 201, 400].includes(r.status))).toBe(true);
    expect((await db.product.findUniqueOrThrow({ where: { id: products[0]?.id } })).stock).toBe(4);
  });

  it("does not oversell: two buyers racing for the last unit, one wins", async () => {
    const p = await createProduct({ stock: 1, priceCents: 900 });
    const a = await cookieFor(await createUser());
    const b = await cookieFor(await createUser());
    await add(a, p.id, 1);
    await add(b, p.id, 1);
    // Stock is 1, so both carts are valid until checkout.
    const results = await Promise.all([
      call<OrderBody | ErrorBody>(checkout, { method: "POST", cookie: a, body: checkoutBody("buyer-a-key-1") }),
      call<OrderBody | ErrorBody>(checkout, { method: "POST", cookie: b, body: checkoutBody("buyer-b-key-1") }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)?.body as ErrorBody;
    expect(loser.code).toBe("INSUFFICIENT_STOCK");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(0);
    expect(await db.order.count()).toBe(1);
  });

  it("rolls everything back when any line cannot be fulfilled", async () => {
    const { user, cookie, products } = await userWithCart([
      { stock: 5, priceCents: 100, quantity: 2 },
      { stock: 5, priceCents: 200, quantity: 3 },
    ]);
    // Someone else buys most of the second product after it was added to the cart.
    await db.product.update({ where: { id: products[1]?.id }, data: { stock: 1 } });
    const res = await call<ErrorBody>(checkout, { method: "POST", cookie, body: checkoutBody("rollback-key-1") });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_STOCK");
    expect((await db.product.findUniqueOrThrow({ where: { id: products[0]?.id } })).stock).toBe(5);
    expect(await db.order.count()).toBe(0);
    expect(await db.cartItem.count({ where: { userId: user.id } })).toBe(2);
  });

  it("refuses products archived after they were added to the cart", async () => {
    const { cookie, products } = await userWithCart([{ stock: 5, priceCents: 100, quantity: 1 }]);
    await db.product.update({ where: { id: products[0]?.id }, data: { status: "ARCHIVED" } });
    const res = await call<ErrorBody>(checkout, { method: "POST", cookie, body: checkoutBody("archived-key-1") });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PRODUCT_UNAVAILABLE");
  });
});

describe("order access control", () => {
  async function placedOrder() {
    const owner = await createUser();
    const ownerCookie = await cookieFor(owner);
    const p = await createProduct({ stock: 10, priceCents: 1000 });
    await add(ownerCookie, p.id, 2);
    const res = await call<OrderBody>(checkout, { method: "POST", cookie: ownerCookie, body: checkoutBody("owner-key-1234") });
    return { owner, ownerCookie, product: p, orderId: res.body.order.id };
  }

  it("owners and admins can read an order; other customers get 404", async () => {
    const { ownerCookie, orderId } = await placedOrder();
    const other = await cookieFor(await createUser());
    const admin = await cookieFor(await createUser({ role: "ADMIN" }));
    expect((await call<OrderBody, { id: string }>(getOrder, { params: { id: orderId }, cookie: ownerCookie })).status).toBe(200);
    expect((await call<OrderBody, { id: string }>(getOrder, { params: { id: orderId }, cookie: admin })).status).toBe(200);
    expect((await call<ErrorBody, { id: string }>(getOrder, { params: { id: orderId }, cookie: other })).status).toBe(404);
    expect((await call<ErrorBody, { id: string }>(getOrder, { params: { id: orderId } })).status).toBe(401);
  });

  it("lists only your own orders; scope=all is admin-only", async () => {
    const { ownerCookie } = await placedOrder();
    const other = await cookieFor(await createUser());
    const admin = await cookieFor(await createUser({ role: "ADMIN" }));

    expect((await call<OrderListBody>(listOrders, { cookie: ownerCookie })).body.meta.total).toBe(1);
    expect((await call<OrderListBody>(listOrders, { cookie: other })).body.meta.total).toBe(0);
    expect((await call<ErrorBody>(listOrders, { cookie: other, path: "/api/orders?scope=all" })).status).toBe(403);
    expect((await call<OrderListBody>(listOrders, { cookie: admin, path: "/api/orders?scope=all" })).body.meta.total).toBe(1);
    expect((await call<ErrorBody>(listOrders, { cookie: admin, path: "/api/orders?status=BOGUS" })).status).toBe(422);
  });

  it("lets a customer cancel a placed order, restocking the items", async () => {
    const { ownerCookie, orderId, product } = await placedOrder();
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(8);
    const res = await call<OrderBody, { id: string }>(patchOrder, { method: "PATCH", params: { id: orderId }, cookie: ownerCookie, body: { status: "CANCELLED" } });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("CANCELLED");
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(10);
    // Cancelling twice must not restock twice.
    const again = await call<ErrorBody, { id: string }>(patchOrder, { method: "PATCH", params: { id: orderId }, cookie: ownerCookie, body: { status: "CANCELLED" } });
    expect(again.status).toBe(409);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(10);
  });

  it("stops customers from setting any status other than CANCELLED, or touching others' orders", async () => {
    const { ownerCookie, orderId } = await placedOrder();
    const other = await cookieFor(await createUser());
    const ship = await call<ErrorBody, { id: string }>(patchOrder, { method: "PATCH", params: { id: orderId }, cookie: ownerCookie, body: { status: "SHIPPED" } });
    expect(ship.status).toBe(403);
    const stranger = await call<ErrorBody, { id: string }>(patchOrder, { method: "PATCH", params: { id: orderId }, cookie: other, body: { status: "CANCELLED" } });
    expect(stranger.status).toBe(404);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PLACED");
  });

  it("lets admins move orders forward but not backwards or out of final states", async () => {
    const { ownerCookie, orderId } = await placedOrder();
    const admin = await cookieFor(await createUser({ role: "ADMIN" }));
    const move = (status: string, cookie = admin) =>
      call<OrderBody & ErrorBody, { id: string }>(patchOrder, { method: "PATCH", params: { id: orderId }, cookie, body: { status } });

    expect((await move("DELIVERED")).status).toBe(409);
    expect((await move("SHIPPED")).body.order.status).toBe("SHIPPED");
    // Customers can no longer cancel once shipped.
    expect((await move("CANCELLED", ownerCookie)).status).toBe(409);
    expect((await move("PLACED")).status).toBe(409);
    expect((await move("DELIVERED")).body.order.status).toBe("DELIVERED");
    const final = await move("CANCELLED");
    expect(final.status).toBe(409);
    expect(final.body.code).toBe("INVALID_TRANSITION");
    expect((await move("NONSENSE")).status).toBe(422);
  });

  it("restocks when an admin cancels a shipped order", async () => {
    const { orderId, product } = await placedOrder();
    const admin = await cookieFor(await createUser({ role: "ADMIN" }));
    await call(patchOrder, { method: "PATCH", params: { id: orderId }, cookie: admin, body: { status: "SHIPPED" } });
    await call(patchOrder, { method: "PATCH", params: { id: orderId }, cookie: admin, body: { status: "CANCELLED" } });
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(10);
  });
});
