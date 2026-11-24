import type { Metadata } from "next";
import { ProductForm } from "@/components/product-form";

export const metadata: Metadata = { title: "Admin: new product" };

export default function NewProductPage() {
  return (
    <section className="page">
      <div className="page-narrow" style={{ maxWidth: 720 }}>
        <p className="qalb-label qalb-muted">Admin</p>
        <h1 style={{ fontSize: "var(--text-h2)" }}>New product</h1>
        <hr className="qalb-divider" />
        <ProductForm />
      </div>
    </section>
  );
}
