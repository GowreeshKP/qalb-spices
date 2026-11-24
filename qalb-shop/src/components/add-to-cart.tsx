"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { MAX_CART_QUANTITY } from "@/lib/validators";
import { Alert } from "./ui";
import { useAction } from "./use-action";

export function AddToCart({ productId, stock, loggedIn }: { productId: string; stock: number; loggedIn: boolean }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const max = Math.min(stock, MAX_CART_QUANTITY);

  if (stock <= 0) {
    return <p className="qalb-hint" data-testid="sold-out">This spice is sold out for now.</p>;
  }

  return (
    <div>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {added ? <Alert kind="success">Added to your cart.</Alert> : null}
      <div className="qalb-field max-w-[160px]">
        <label htmlFor="quantity">Quantity</label>
        <input
          id="quantity"
          type="number"
          className="qalb-input"
          min={1}
          max={max}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(max, Math.floor(Number(e.target.value) || 1))))}
        />
      </div>
      <button
        type="button"
        className="qalb-btn"
        disabled={pending}
        onClick={() => {
          if (!loggedIn) {
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          setAdded(false);
          void run(async () => {
            try {
              await api("/api/cart", { method: "POST", body: { productId, quantity } });
            } catch (e) {
              if (e instanceof ApiError && e.status === 401) {
                router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
                return;
              }
              throw e;
            }
            setAdded(true);
            router.refresh();
          });
        }}
      >
        {pending ? "Adding..." : loggedIn ? "Add to cart" : "Log in to buy"}
      </button>
    </div>
  );
}
