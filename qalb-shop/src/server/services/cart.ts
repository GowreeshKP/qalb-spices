import { db } from "../db";
import { Errors } from "../errors";
import { cartTotal } from "@/lib/money";
import type { CartDTO, ProductDTO } from "@/lib/types";
import type { ProductStatus } from "@/lib/validators";
import { MAX_CART_QUANTITY } from "@/lib/validators";

export async function getCart(userId: string): Promise<CartDTO> {
  const rows = await db.cartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: "asc" },
  });
  const items = rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    quantity: row.quantity,
    product: {
      id: row.product.id,
      slug: row.product.slug,
      name: row.product.name,
      priceCents: row.product.priceCents,
      stock: row.product.stock,
      imageUrl: row.product.imageUrl,
      status: row.product.status as ProductStatus,
      packSize: row.product.packSize,
    } satisfies CartDTO["items"][number]["product"],
  }));
  return {
    items,
    itemCount: items.reduce((n, item) => n + item.quantity, 0),
    totalCents: cartTotal(items.map((i) => ({ unitPriceCents: i.product.priceCents, quantity: i.quantity }))),
  };
}

async function requireBuyable(productId: string): Promise<ProductDTO["stock"]> {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw Errors.notFound("Product");
  if (product.status !== "ACTIVE") {
    throw Errors.conflict("This product is no longer available", "PRODUCT_UNAVAILABLE");
  }
  return product.stock;
}

function assertStock(quantity: number, stock: number): void {
  if (quantity > stock) {
    throw Errors.conflict(stock === 0 ? "This product is out of stock" : `Only ${stock} left in stock`, "INSUFFICIENT_STOCK", {
      available: stock,
    });
  }
}

/** Adds to the existing line (capped at MAX_CART_QUANTITY and stock). */
export async function addToCart(userId: string, productId: string, quantity: number): Promise<CartDTO> {
  const stock = await requireBuyable(productId);
  const existing = await db.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_CART_QUANTITY) {
    throw Errors.conflict(`Maximum ${MAX_CART_QUANTITY} per item`, "CONFLICT");
  }
  assertStock(next, stock);
  await db.cartItem.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId, quantity },
    update: { quantity: next },
  });
  return getCart(userId);
}

export async function setCartQuantity(userId: string, productId: string, quantity: number): Promise<CartDTO> {
  const existing = await db.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
  if (!existing) throw Errors.notFound("Cart item");
  const stock = await requireBuyable(productId);
  assertStock(quantity, stock);
  await db.cartItem.update({ where: { id: existing.id }, data: { quantity } });
  return getCart(userId);
}

export async function removeFromCart(userId: string, productId: string): Promise<CartDTO> {
  await db.cartItem.deleteMany({ where: { userId, productId } });
  return getCart(userId);
}
