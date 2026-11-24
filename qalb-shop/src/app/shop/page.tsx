import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { EmptyState } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { ShopCatalog, type CategoryTab } from "@/components/shop-catalog";
import { listProductsQuerySchema, PRODUCT_CATEGORIES, PRODUCT_SORTS } from "@/lib/validators";
import { listProducts } from "@/server/services/products";

export const metadata: Metadata = { title: "Shop spices" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValues(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) out[key] = v;
  }
  return out;
}

const SORT_LABELS: Record<(typeof PRODUCT_SORTS)[number], string> = {
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  name: "Name",
};

function capitalise(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = firstValues(await searchParams);
  const parsed = listProductsQuerySchema.safeParse(raw);
  // Bad params fall back to defaults instead of erroring the page.
  const query = parsed.success ? parsed.data : listProductsQuerySchema.parse({});
  const { items, meta } = await listProducts(query, { isAdmin: false });
  const filterActive = Boolean(query.q || query.category);

  // Switching category keeps the search and sort but always returns to page 1.
  const hrefFor = (category: string): string => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (category) params.set("category", category);
    if (query.sort !== "newest") params.set("sort", query.sort);
    if (query.pageSize !== 12) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };
  const tabs: CategoryTab[] = [
    { value: "", label: "All", href: hrefFor("") },
    ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: capitalise(c), href: hrefFor(c) })),
  ];
  const viewKey = [query.q ?? "", query.category ?? "", query.sort, query.page, query.pageSize].join("|");

  return (
    <section className="page">
      <div className="container-qalb">
        <div className="qalb-intro mb-12 text-center">
          <p className="qalb-label qalb-muted">The collection</p>
          <h1>Shop spices</h1>
          <hr className="qalb-divider qalb-divider-center" />
        </div>

        <form method="get" action="/shop" role="search" className="mb-8 grid items-end gap-4 md:grid-cols-[2fr_1fr_auto]">
          {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
          <div className="qalb-field !mb-0">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" className="qalb-input" defaultValue={query.q ?? ""} placeholder="Pepper, cardamom..." maxLength={80} />
          </div>
          <div className="qalb-field !mb-0">
            <label htmlFor="sort">Sort by</label>
            <select id="sort" name="sort" className="qalb-input" defaultValue={query.sort}>
              {PRODUCT_SORTS.map((s) => (
                <option key={s} value={s}>{SORT_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="qalb-btn">Apply</button>
        </form>

        <ShopCatalog tabs={tabs} active={query.category ?? ""} viewKey={viewKey}>
          <p className="qalb-hint mb-6" aria-live="polite" data-testid="result-count">
            {meta.total} {meta.total === 1 ? "spice" : "spices"}
            {filterActive ? " match your filters" : ""}
          </p>

          {items.length === 0 ? (
            <EmptyState title="No spices found">
              <p>Try a different search, or clear the filters.</p>
              <a className="qalb-link" href="/shop">Clear filters</a>
            </EmptyState>
          ) : (
            <ul className="qalb-stagger m-0 grid list-none gap-8 p-0 md:grid-cols-2 xl:grid-cols-3">
              {items.map((product, index) => (
                <li key={product.id} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </ShopCatalog>

        <Reveal>
          <Pagination
            meta={meta}
            basePath="/shop"
            params={{
              q: query.q,
              category: query.category,
              sort: query.sort === "newest" ? undefined : query.sort,
              pageSize: query.pageSize === 12 ? undefined : String(query.pageSize),
            }}
          />
        </Reveal>
      </div>
    </section>
  );
}
