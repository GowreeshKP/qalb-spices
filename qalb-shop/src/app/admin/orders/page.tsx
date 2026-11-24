import type { Metadata } from "next";
import Link from "next/link";
import { AdminOrderStatus } from "@/components/order-actions";
import { OrderStatusBadge } from "@/components/order-status";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { listOrdersQuerySchema, ORDER_STATUSES } from "@/lib/validators";
import { requireAdminPage } from "@/server/current-user";
import { listOrders } from "@/server/services/orders";

export const metadata: Metadata = { title: "Admin: orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminPage("/admin/orders");
  const raw = await searchParams;
  const parsed = listOrdersQuerySchema.safeParse({
    scope: "all",
    status: typeof raw.status === "string" && raw.status ? raw.status : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const query = parsed.success ? parsed.data : listOrdersQuerySchema.parse({ scope: "all" });
  const { items, meta } = await listOrders(admin, { scope: "all", status: query.status, page: query.page, pageSize: query.pageSize });

  return (
    <section className="page">
      <div className="container-qalb">
        <p className="qalb-label qalb-muted">Admin</p>
        <h1 style={{ fontSize: "var(--text-h2)" }}>Orders</h1>
        <hr className="qalb-divider" />
        <form method="get" action="/admin/orders" className="mb-8 flex items-end gap-4">
          <div className="qalb-field !mb-0">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" className="qalb-input" defaultValue={query.status ?? ""}>
              <option value="">All</option>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s[0]}{s.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <button className="qalb-btn" type="submit">Filter</button>
        </form>

        {items.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <div className="qalb-table-wrap">
            <table className="qalb-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Update</th></tr></thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} data-testid="admin-order-row">
                    <td><Link className="qalb-link" href={`/orders/${o.id}`}>#{o.id.slice(-8)}</Link></td>
                    <td>{o.customer?.name}<br /><span className="qalb-muted text-xs">{o.customer?.email}</span></td>
                    <td>{formatMoney(o.totalCents)}</td>
                    <td><OrderStatusBadge status={o.status} /></td>
                    <td><AdminOrderStatus orderId={o.id} status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} basePath="/admin/orders" params={{ status: query.status }} />
      </div>
    </section>
  );
}
