import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { StockBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getCurrentUser } from "@/server/current-user";
import { getProductBySlug } from "@/server/services/products";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug, { isAdmin: false });
  return { title: product?.name ?? "Spice not found" };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const product = await getProductBySlug(slug, { isAdmin: user?.role === "ADMIN" });
  if (!product) notFound();

  return (
    <section className="page">
      <div className="container-qalb">
        <p className="mb-8"><Link className="qalb-link" href="/shop">&larr; All spices</Link></p>
        <div className="grid gap-12 md:grid-cols-2 md:items-start">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={`${product.name}, ${product.packSize}`} width={768} height={1024} className="aspect-[4/5] w-full object-cover" />
          ) : (
            <div className="aspect-[4/5] w-full bg-qalb-warm-white" role="img" aria-label={`No photo yet for ${product.name}`} />
          )}
          <div>
            {product.status === "ARCHIVED" ? (
              <p className="qalb-badge qalb-badge-sale mb-4">Archived (only admins can see this)</p>
            ) : null}
            <p className="qalb-label qalb-muted capitalize">{product.category}</p>
            <h1 style={{ fontSize: "var(--text-h2)" }}>{product.name}</h1>
            <hr className="qalb-divider" />
            <p className="text-2xl" data-testid="product-price">{formatMoney(product.priceCents)}</p>
            <div className="mb-6"><StockBadge stock={product.stock} /></div>
            <p>{product.description}</p>
            {product.flavour ? <p className="qalb-muted">Flavour: {product.flavour}</p> : null}
            {product.packSize ? <p className="qalb-muted">Pack size: {product.packSize}</p> : null}
            <div className="mt-8">
              {product.status === "ACTIVE" ? (
                <AddToCart productId={product.id} stock={product.stock} loggedIn={Boolean(user)} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
