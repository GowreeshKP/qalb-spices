import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelOrderButton } from "@/components/order-actions";
import { OrderStatusBadge } from "@/components/order-status";
import { Alert } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { canCustomerCancel } from "@/lib/order-status";
import { AppError } from "@/server/errors";
import { requireUserPage } from "@/server/current-user";
import { getOrder } from "@/server/services/orders";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requireUserPage(`/orders/${id}`);
  const raw = await searchParams;
  let order;
  try {
    order = await getOrder(user, id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <section className="page">
      <div className="container-qalb max-w-[800px]">
        <p className="mb-8"><Link className="qalb-link" href="/orders">&larr; All orders</Link></p>
        {raw.placed ? <Alert kind="success">Thank you. Your order has been placed.</Alert> : null}
        <p className="qalb-label qalb-muted">Order #{order.id.slice(-8)}</p>
        <h1 style={{ fontSize: "var(--text-h2)" }}>Order details</h1>
        <hr className="qalb-divider" />
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <OrderStatusBadge status={order.status} />
          <span className="qalb-muted text-sm">{new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>

        <div className="qalb-table-wrap mb-8">
          <table className="qalb-table">
            <thead><tr><th>Spice</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unitPriceCents)}</td>
                  <td>{formatMoney(item.unitPriceCents * item.quantity)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}><strong className="font-medium">Total</strong></td>
                <td><strong className="font-medium" data-testid="order-total">{formatMoney(order.totalCents)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="qalb-card mb-8">
          <h3>Delivery</h3>
          <p>{order.shippingName}</p>
          <p>{order.shippingAddress}, {order.shippingCity} {order.shippingPostal}</p>
        </div>

        {user.role !== "ADMIN" && canCustomerCancel(order.status) ? <CancelOrderButton orderId={order.id} /> : null}
      </div>
    </section>
  );
}
