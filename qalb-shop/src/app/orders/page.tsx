import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { OrderStatusBadge } from "@/components/order-status";
import { Pagination } from "@/components/pagination";
import { formatMoney } from "@/lib/money";
import { listOrdersQuerySchema } from "@/lib/validators";
import { requireUserPage } from "@/server/current-user";
import { listOrders } from "@/server/services/orders";

export const metadata: Metadata = { title: "Your orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUserPage("/orders");
  const raw = await searchParams;
  const parsed = listOrdersQuerySchema.safeParse({ page: typeof raw.page === "string" ? raw.page : undefined });
  const query = parsed.success ? parsed.data : listOrdersQuerySchema.parse({});
  const { items, meta } = await listOrders(user, { scope: "mine", page: query.page, pageSize: query.pageSize });

  return (
    <section className="page">
      <div className="container-qalb">
        <p className="qalb-label qalb-muted">History</p>
        <h1>Your orders</h1>
        <hr className="qalb-divider" />
        {items.length === 0 ? (
          <EmptyState title="No orders yet">
            <p>When you place an order it will show up here.</p>
            <Link className="qalb-btn" href="/shop">Shop spices</Link>
          </EmptyState>
        ) : (
          <div className="qalb-table-wrap">
            <table className="qalb-table">
              <thead>
                <tr><th>Order</th><th>Placed</th><th>Items</th><th>Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id} data-testid="order-row">
                    <td><Link className="qalb-link" href={`/orders/${order.id}`}>#{order.id.slice(-8)}</Link></td>
                    <td>{new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td>
                    <td>{order.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td>{formatMoney(order.totalCents)}</td>
                    <td><OrderStatusBadge status={order.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} basePath="/orders" params={{}} />
      </div>
    </section>
  );
}
