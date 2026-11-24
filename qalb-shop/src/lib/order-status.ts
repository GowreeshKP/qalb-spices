import type { OrderStatus } from "./validators";

/** Allowed order status transitions. Terminal states have no outgoing edges. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PLACED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Customers may only cancel, and only before the order ships. */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === "PLACED";
}

/** Cancelling a not-yet-delivered order returns its items to stock. */
export function restocksOnTransition(from: OrderStatus, to: OrderStatus): boolean {
  return to === "CANCELLED" && (from === "PLACED" || from === "SHIPPED");
}
