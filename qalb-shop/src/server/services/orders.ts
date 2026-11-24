import type { Order, OrderItem, Prisma, User } from "@prisma/client";
import { db } from "../db";
import { AppError, Errors } from "../errors";
import { logger } from "../logger";
import type { PublicUser } from "../auth/session";
import { cartTotal } from "@/lib/money";
import { canCustomerCancel, canTransition, restocksOnTransition } from "@/lib/order-status";
import { buildPageMeta, skipFor } from "@/lib/pagination";
import type { OrderDTO, OrderListDTO } from "@/lib/types";
import type { CheckoutInput, OrderStatus } from "@/lib/validators";

type OrderRow = Order & { items: OrderItem[]; user?: Pick<User, "id" | "name" | "email"> };

export function toOrderDTO(order: OrderRow): OrderDTO {
  return {
    id: order.id,
    status: order.status as OrderStatus,
    totalCents: order.totalCents,
    shippingName: order.shippingName,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingPostal: order.shippingPostal,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
    })),
    ...(order.user ? { customer: { id: order.user.id, name: order.user.name, email: order.user.email } } : {}),
  };
}

const orderInclude = { items: true, user: { select: { id: true, name: true, email: true } } } as const;

export interface CreateOrderResult {
  order: OrderDTO;
  /** false when an earlier request with the same idempotency key already created this order. */
  created: boolean;
}

/**
 * Turn the user's cart into an order inside one transaction: prices come from the database,
 * stock is decremented with a guarded update (no overselling under concurrency), and the cart is cleared.
 * Replaying the same idempotency key returns the original order instead of creating a duplicate.
 */
export async function createOrder(userId: string, input: CheckoutInput): Promise<CreateOrderResult> {
  const findExisting = () =>
    db.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      include: orderInclude,
    });

  const replay = await findExisting();
  if (replay) return { order: toOrderDTO(replay), created: false };

  try {
    const order = await db.$transaction(async (tx) => {
      const cart = await tx.cartItem.findMany({ where: { userId }, include: { product: true } });
      if (cart.length === 0) throw new AppError(400, "EMPTY_CART", "Your cart is empty");

      for (const line of cart) {
        if (line.product.status !== "ACTIVE") {
          throw Errors.conflict(`${line.product.name} is no longer available`, "PRODUCT_UNAVAILABLE", {
            productId: line.productId,
          });
        }
        const decremented = await tx.product.updateMany({
          where: { id: line.productId, status: "ACTIVE", stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity }, version: { increment: 1 } },
        });
        if (decremented.count === 0) {
          const fresh = await tx.product.findUnique({ where: { id: line.productId }, select: { stock: true } });
          throw Errors.conflict(`Not enough stock for ${line.product.name}`, "INSUFFICIENT_STOCK", {
            productId: line.productId,
            available: fresh?.stock ?? 0,
          });
        }
      }

      const created = await tx.order.create({
        data: {
          userId,
          status: "PLACED",
          totalCents: cartTotal(cart.map((l) => ({ unitPriceCents: l.product.priceCents, quantity: l.quantity }))),
          shippingName: input.shippingName,
          shippingAddress: input.shippingAddress,
          shippingCity: input.shippingCity,
          shippingPostal: input.shippingPostal,
          idempotencyKey: input.idempotencyKey,
          items: {
            create: cart.map((l) => ({
              productId: l.productId,
              name: l.product.name,
              unitPriceCents: l.product.priceCents,
              quantity: l.quantity,
            })),
          },
        },
        include: orderInclude,
      });
      await tx.cartItem.deleteMany({ where: { userId } });
      return created;
    });
    logger.info("order_created", { orderId: order.id, userId });
    return { order: toOrderDTO(order), created: true };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      const winner = await findExisting();
      if (winner) return { order: toOrderDTO(winner), created: false };
    }
    throw error;
  }
}

export async function listOrders(
  actor: PublicUser,
  query: { scope: "mine" | "all"; status?: OrderStatus | undefined; page: number; pageSize: number },
): Promise<OrderListDTO> {
  if (query.scope === "all" && actor.role !== "ADMIN") throw Errors.forbidden();
  const where: Prisma.OrderWhereInput = {
    ...(query.scope === "mine" ? { userId: actor.id } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: skipFor(query.page, query.pageSize),
      take: query.pageSize,
    }),
  ]);
  return { items: rows.map(toOrderDTO), meta: buildPageMeta(query.page, query.pageSize, total) };
}

/** Customers can only see their own orders; anything else is reported as not found. */
export async function getOrder(actor: PublicUser, id: string): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!order || (order.userId !== actor.id && actor.role !== "ADMIN")) throw Errors.notFound("Order");
  return toOrderDTO(order);
}

export async function updateOrderStatus(actor: PublicUser, id: string, next: OrderStatus): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!order || (order.userId !== actor.id && actor.role !== "ADMIN")) throw Errors.notFound("Order");
  const from = order.status as OrderStatus;

  if (actor.role !== "ADMIN") {
    if (next !== "CANCELLED") throw Errors.forbidden();
    if (!canCustomerCancel(from)) {
      throw new AppError(409, "INVALID_TRANSITION", "This order can no longer be cancelled");
    }
  }
  if (!canTransition(from, next)) {
    throw new AppError(409, "INVALID_TRANSITION", `Cannot change an order from ${from} to ${next}`);
  }

  await db.$transaction(async (tx) => {
    // Compare-and-set on the previous status so two simultaneous changes cannot both apply.
    const moved = await tx.order.updateMany({ where: { id, status: from }, data: { status: next } });
    if (moved.count === 0) throw Errors.conflict("This order was just updated. Reload and try again.", "INVALID_TRANSITION");
    if (restocksOnTransition(from, next)) {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity }, version: { increment: 1 } },
        });
      }
    }
  });
  logger.info("order_status_changed", { orderId: id, from, to: next, actorId: actor.id });
  const fresh = await db.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  return toOrderDTO(fresh);
}