import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { AppError } from "@/server/errors";
import { getProductById } from "@/server/services/products";

export const metadata: Metadata = { title: "Admin: edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product;
  try {
    product = await getProductById(id, { isAdmin: true });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return (
    <section className="page">
      <div className="page-narrow" style={{ maxWidth: 720 }}>
        <p className="qalb-label qalb-muted">Admin</p>
        <h1 style={{ fontSize: "var(--text-h2)" }}>Edit product</h1>
        <hr className="qalb-divider" />
        <ProductForm product={product} />
      </div>
    </section>
  );
}
