import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { ParallaxImage } from "@/components/parallax-image";
import { Reveal } from "@/components/reveal";
import { listProductsQuerySchema } from "@/lib/validators";
import { listProducts } from "@/server/services/products";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { items } = await listProducts(listProductsQuerySchema.parse({ pageSize: "3" }), { isAdmin: false });

  return (
    <>
      {params.forbidden ? (
        <p role="alert" className="qalb-alert qalb-alert-error mx-[var(--page-margin)] mt-6 max-w-none" data-testid="forbidden-notice">
          You do not have access to that page.
        </p>
      ) : null}

      <section className="page qalb-intro text-center" aria-labelledby="hero-title">
        <p className="qalb-label qalb-muted" style={{ fontSize: "1.125rem" }}>More than just a spice</p>
        <h1 id="hero-title" className="mx-auto max-w-[14ch]">Pure. Authentic. Exceptional.</h1>
        <hr className="qalb-divider qalb-divider-center" />
        <p className="mx-auto text-lg text-qalb-charcoal">
          Carefully sourced from the finest farms, QALB brings you pure, aromatic and naturally rich spices.
        </p>
        <Link className="qalb-btn" href="/shop">Shop spices</Link>
      </section>

      <section className="bg-qalb-warm-white px-[var(--page-margin)] py-[var(--section-pad)]" aria-labelledby="featured-title">
        <div className="container-qalb">
          <Reveal className="mb-12 text-center">
            <p className="qalb-label qalb-muted">Newest arrivals</p>
            <h2 id="featured-title">From the farm to your kitchen</h2>
            <hr className="qalb-divider qalb-divider-center" />
          </Reveal>
          <ul className="m-0 grid list-none gap-8 p-0 md:grid-cols-3">
            {items.map((product, index) => (
              <Reveal as="li" key={product.id} delay={index * 120}><ProductCard product={product} /></Reveal>
            ))}
          </ul>
          <Reveal as="p" className="mt-12 text-center"><Link className="qalb-btn qalb-btn-secondary" href="/shop">See every spice</Link></Reveal>
        </div>
      </section>

      <section className="px-[var(--page-margin)] py-[var(--section-pad)]" aria-labelledby="story-title">
        <div className="container-qalb grid items-center gap-12 xl:grid-cols-2">
          <Reveal>
            <ParallaxImage src="/images/lifestyle.jpg" alt="A stone mortar and pestle on linen with small bowls of cardamom, black pepper and cinnamon" width={1024} height={768} className="aspect-[3/2] w-full" />
          </Reveal>
          <Reveal delay={150}>
            <p className="qalb-label qalb-muted">Our story</p>
            <h2 id="story-title">A standard of quality</h2>
            <hr className="qalb-divider" />
            <p>We work directly with growers who share our care for the land, and we bring every harvest to you whole, fresh and unhurried, the way spice has always been meant to be.</p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
