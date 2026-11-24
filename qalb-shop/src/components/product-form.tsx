"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { centsToInput, parsePriceToCents } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";
import { createProductSchema, PRODUCT_CATEGORIES, PRODUCT_STATUSES, updateProductSchema } from "@/lib/validators";
import { Alert, SelectField, TextAreaField, TextField } from "./ui";
import { useAction } from "./use-action";

export function ProductForm({ product }: { product?: ProductDTO }) {
  const router = useRouter();
  const { run, fail, pending, error, fieldErrors } = useAction();
  const upload = useAction();
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);

  async function onFile(file: File) {
    await upload.run(async () => {
      const body = new FormData();
      body.set("file", file);
      let response: Response;
      try {
        response = await fetch("/api/uploads", { method: "POST", body, credentials: "same-origin" });
      } catch {
        throw new ApiError(0, "NETWORK_ERROR", "Could not upload the image.");
      }
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string; code?: string };
      if (!response.ok || !payload.url) {
        throw new ApiError(response.status, payload.code ?? "UNKNOWN", payload.error ?? "Upload failed");
      }
      setImageUrl(payload.url);
    });
  }

  return (
    <form
      noValidate
      aria-label={product ? "Edit product" : "New product"}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const priceCents = parsePriceToCents(String(data.get("price") ?? ""));

        const values = {
          name: data.get("name"),
          description: data.get("description"),
          category: data.get("category"),
          flavour: data.get("flavour"),
          packSize: data.get("packSize"),
          // A placeholder keeps the schema from adding a second price error; the real one is set below.
          priceCents: priceCents ?? 1,
          stock: Number(data.get("stock")),
          status: data.get("status"),
          imageUrl,
        };
        const parsed = product
          ? updateProductSchema.safeParse({ ...values, version: product.version })
          : createProductSchema.safeParse(values);
        const out: Record<string, string[]> = {};
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const key = issue.path[0] === "priceCents" ? "price" : issue.path.join(".") || "_";
            (out[key] ??= []).push(issue.message);
          }
        }
        if (priceCents === null) out.price = ["Enter a price like 349.00"];
        if (!parsed.success || priceCents === null) return fail(out);
        void run(async () => {
          if (product) await api(`/api/products/${product.id}`, { method: "PATCH", body: parsed.data });
          else await api("/api/products", { method: "POST", body: parsed.data });
          router.push("/admin");
          router.refresh();
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Name" name="name" defaultValue={product?.name} required errors={fieldErrors.name} />
      <TextAreaField label="Description" name="description" defaultValue={product?.description} required errors={fieldErrors.description} />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Category" name="category" defaultValue={product?.category ?? "whole"} errors={fieldErrors.category}>
          {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <SelectField label="Status" name="status" defaultValue={product?.status ?? "ACTIVE"} errors={fieldErrors.status}>
          {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s === "ACTIVE" ? "Active" : "Archived"}</option>)}
        </SelectField>
        <TextField label="Price (INR)" name="price" inputMode="decimal" defaultValue={product ? centsToInput(product.priceCents) : ""} required errors={fieldErrors.price} />
        <TextField label="Stock" name="stock" type="number" min={0} defaultValue={product?.stock ?? 0} required errors={fieldErrors.stock} />
        <TextField label="Flavour notes" name="flavour" defaultValue={product?.flavour} errors={fieldErrors.flavour} />
        <TextField label="Pack size" name="packSize" defaultValue={product?.packSize} errors={fieldErrors.packSize} />
      </div>

      <div className="qalb-field">
        <label htmlFor="image">Product image</label>
        {imageUrl ? <img src={imageUrl} alt="Current product" width={120} height={150} className="aspect-[4/5] w-[120px] object-cover" /> : null}
        <input
          id="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="qalb-input"
          disabled={upload.pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <p className="qalb-hint">PNG, JPEG or WebP, up to 2 MB.</p>
        {upload.error ? <p className="qalb-field-error" role="alert">{upload.error}</p> : null}
        {fieldErrors.imageUrl?.[0] ? <p className="qalb-field-error" role="alert">{fieldErrors.imageUrl[0]}</p> : null}
        {imageUrl ? <button type="button" className="qalb-link" onClick={() => setImageUrl(null)}>Remove image</button> : null}
      </div>

      <div className="flex gap-4">
        <button className="qalb-btn" type="submit" disabled={pending || upload.pending}>
          {pending ? "Saving..." : product ? "Save changes" : "Create product"}
        </button>
        <button className="qalb-btn qalb-btn-secondary" type="button" onClick={() => router.push("/admin")}>Cancel</button>
      </div>
    </form>
  );
}
