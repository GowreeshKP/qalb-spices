"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { ProductDTO } from "@/lib/types";
import type { ProductStatus } from "@/lib/validators";
import { Alert } from "./ui";
import { useAction } from "./use-action";

/** Archive/restore flips instantly in the UI and rolls back if the server rejects it. */
export function ProductRowActions({ product }: { product: ProductDTO }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [version, setVersion] = useState(product.version);

  const nextStatus: ProductStatus = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`qalb-badge ${status === "ACTIVE" ? "qalb-badge-stock" : "qalb-badge-sale"}`} data-testid="product-status">
        {status === "ACTIVE" ? "Active" : "Archived"}
      </span>
      <Link className="qalb-link" href={`/admin/products/${product.id}`} aria-label={`Edit ${product.name}`}>Edit</Link>
      <button
        type="button"
        className="qalb-link"
        disabled={pending}
        aria-label={`${nextStatus === "ARCHIVED" ? "Archive" : "Restore"} ${product.name}`}
        onClick={() => {
          const previous = status;
          setStatus(nextStatus);
          void run(async () => {
            try {
              const result = await api<{ product: ProductDTO }>(`/api/products/${product.id}`, {
                method: "PATCH",
                body: { status: nextStatus, version },
              });
              setVersion(result.product.version);
              router.refresh();
            } catch (error) {
              setStatus(previous);
              throw error;
            }
          });
        }}
      >
        {nextStatus === "ARCHIVED" ? "Archive" : "Restore"}
      </button>
      <button
        type="button"
        className="qalb-link !text-qalb-paprika"
        disabled={pending}
        aria-label={`Delete ${product.name}`}
        onClick={() => {
          if (!window.confirm(`Delete "${product.name}" permanently?`)) return;
          void run(async () => {
            await api(`/api/products/${product.id}`, { method: "DELETE" });
            router.refresh();
          });
        }}
      >
        Delete
      </button>
      {error ? <div className="w-full"><Alert kind="error">{error}</Alert></div> : null}
    </div>
  );
}
