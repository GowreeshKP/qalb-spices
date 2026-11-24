import type { Metadata } from "next";
import Link from "next/link";
import { ProductRowActions } from "@/components/admin-product-actions";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { listProductsQuerySchema, PRODUCT_CATEGORIES, PRODUCT_STATUSES } from "@/lib/validators";
import { listProducts } from "@/server/services/products";

export const metadata: Metadata = { title: "Admin: products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first !== undefined) flat[k] = first;
  }
  const parsed = listProductsQuerySchema.safeParse({ pageSize: "10", ...flat });
  const query = parsed.success ? parsed.data : listProductsQuerySchema.parse({ pageSize: "10" });
  const { items, meta } = await listProducts(query, { isAdmin: true });

  return (
    <section className="page">
      <div className="container-qalb">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="qalb-label qalb-muted">Admin</p>
            <h1 style={{ fontSize: "var(--text-h2)" }}>Products</h1>
          </div>
          <Link className="qalb-btn" href="/admin/products/new">Add product</Link>
        </div>
        <hr className="qalb-divider" />

        <form method="get" action="/admin" role="search" className="mb-8 grid items-end gap-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          <div className="qalb-field !mb-0">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" className="qalb-input" defaultValue={query.q ?? ""} maxLength={80} />
          </div>
          <div className="qalb-field !mb-0">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" className="qalb-input" defaultValue={query.status ?? ""}>
              <option value="">All</option>
              {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s === "ACTIVE" ? "Active" : "Archived"}</option>)}
            </select>
          </div>
          <div className="qalb-field !mb-0">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" className="qalb-input" defaultValue={query.category ?? ""}>
              <option value="">All</option>
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" className="qalb-btn">Filter</button>
        </form>

        <p className="qalb-hint mb-4" data-testid="result-count">{meta.total} {meta.total === 1 ? "product" : "products"}</p>

        {items.length === 0 ? (
          <EmptyState title="No products match"><Link className="qalb-link" href="/admin">Clear filters</Link></EmptyState>
        ) : (
          <div className="qalb-table-wrap">
            <table className="qalb-table">
              <thead>
                <tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status and actions</th></tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} data-testid="admin-product-row">
                    <td>{p.name}</td>
                    <td className="capitalize">{p.category}</td>
                    <td>{formatMoney(p.priceCents)}</td>
                    <td>{p.stock}</td>
                    <td><ProductRowActions product={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} basePath="/admin" params={{ q: query.q, status: query.status, category: query.category, pageSize: query.pageSize === 10 ? undefined : String(query.pageSize) }} />
      </div>
    </section>
  );
}
