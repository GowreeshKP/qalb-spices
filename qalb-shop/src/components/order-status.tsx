import type { OrderStatus } from "@/lib/validators";
import { Icon } from "./ui";

const LABELS: Record<OrderStatus, string> = {
  PLACED: "Placed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Status is always shown as text plus an icon, never colour alone. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cls = status === "CANCELLED" ? "qalb-badge-sale" : status === "PLACED" ? "qalb-badge-new" : "qalb-badge-stock";
  return (
    <span className={`qalb-badge ${cls}`} data-testid="order-status">
      <Icon name={status === "CANCELLED" ? "alert" : "check"} />
      {LABELS[status]}
    </span>
  );
}

export { LABELS as ORDER_STATUS_LABELS };
