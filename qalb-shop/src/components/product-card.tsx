import Link from "next/link";
import { formatMoney } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";
import { StockBadge } from "./ui";

export function ProductCard({ product }: { product: ProductDTO }) {
  return (
    <article className="qalb-card qalb-card-lift h-full" data-testid="product-card">
      {product.imageUrl ? (
        <div className="qalb-zoom">
          <img
            src={product.imageUrl}
            alt={`${product.name}, ${product.packSize || "spice"}`}
            width={768}
            height={1024}
            loading="lazy"
            className="aspect-[4/5] w-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-[4/5] w-full bg-qalb-cream" role="img" aria-label={`No photo yet for ${product.name}`} />
      )}
      <StockBadge stock={product.stock} />
      <h3>
        <Link href={`/shop/${product.slug}`} className="text-inherit no-underline hover:text-qalb-clay">
          {product.name}
        </Link>
      </h3>
      <p>{product.description}</p>
      <p className="text-xs">
        {product.flavour ? `${product.flavour} · ` : ""}
        {product.packSize}
      </p>
      <div className="mt-auto flex items-center justify-between gap-4">
        <strong className="font-medium">{formatMoney(product.priceCents)}</strong>
        <Link className="qalb-link" href={`/shop/${product.slug}`}>
          View
        </Link>
      </div>
    </article>
  );
}
