"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { cartTotal, formatMoney } from "@/lib/money";
import type { CartDTO, OrderDTO } from "@/lib/types";
import { checkoutSchema } from "@/lib/validators";
import { Alert, EmptyState, TextField } from "./ui";
import { useAction } from "./use-action";

function recompute(items: CartDTO["items"]): CartDTO {
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    totalCents: cartTotal(items.map((i) => ({ unitPriceCents: i.product.priceCents, quantity: i.quantity }))),
  };
}

const LINE_EXIT_MS = 320;

/** Slides a cart line out and closes the gap, so the list below it glides up instead of jumping. */
function animateLineOut(line: HTMLElement | null): Promise<void> {
  if (!line || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  line.style.maxHeight = `${line.offsetHeight}px`;
  void line.offsetHeight; // commit the starting height so the collapse can transition
  line.classList.add("qalb-line-out");
  return new Promise((resolve) => window.setTimeout(resolve, LINE_EXIT_MS));
}

export function CartView({ initial }: { initial: CartDTO }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartDTO>(initial);
  const [lineError, setLineError] = useState<string | null>(null);
  const checkout = useAction();
  // One key per checkout attempt: a retry after a timeout reuses it, so the order cannot be created twice.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function changeQuantity(productId: string, quantity: number) {
    const previous = cart;
    setLineError(null);
    // Optimistic update, rolled back if the server says no.
    setCart(recompute(cart.items.map((i) => (i.productId === productId ? { ...i, quantity } : i))));
    try {
      const result = await api<{ cart: CartDTO }>(`/api/cart/${productId}`, { method: "PATCH", body: { quantity } });
      setCart(result.cart);
      router.refresh();
    } catch (error) {
      setCart(previous);
      setLineError(error instanceof ApiError ? error.message : "Could not update the cart.");
    }
  }

  async function remove(productId: string, line: HTMLElement | null) {
    const previous = cart;
    setLineError(null);
    await animateLineOut(line);
    setCart(recompute(cart.items.filter((i) => i.productId !== productId)));
    try {
      const result = await api<{ cart: CartDTO }>(`/api/cart/${productId}`, { method: "DELETE" });
      setCart(result.cart);
      router.refresh();
    } catch (error) {
      setCart(previous);
      setLineError(error instanceof ApiError ? error.message : "Could not remove the item.");
    }
  }

  if (cart.items.length === 0) {
    return (
      <EmptyState title="Your cart is empty">
        <p>Add a spice or two and they will appear here.</p>
        <Link className="qalb-btn" href="/shop">Shop spices</Link>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-12 xl:grid-cols-[3fr_2fr]">
      <div>
        {lineError ? <Alert kind="error">{lineError}</Alert> : null}
        <ul className="m-0 list-none p-0" aria-label="Cart items">
          {cart.items.map((item) => (
            <li key={item.id} className="qalb-card qalb-line mb-4 !flex-row items-center gap-4" data-testid="cart-line">
              {item.product.imageUrl ? (
                <img src={item.product.imageUrl} alt="" width={80} height={100} className="aspect-[4/5] w-20 object-cover" />
              ) : null}
              <div className="flex-1">
                <h3 style={{ fontSize: "1.125rem" }}>
                  <Link href={`/shop/${item.product.slug}`} className="text-inherit no-underline">{item.product.name}</Link>
                </h3>
                <p className="text-xs">{item.product.packSize} · {formatMoney(item.product.priceCents)} each</p>
                {item.product.status !== "ACTIVE" ? <p className="text-xs !text-qalb-paprika">No longer available. Remove it to check out.</p> : null}
                <div className="mt-3 flex items-center gap-4">
                  <label className="qalb-label" htmlFor={`qty-${item.productId}`} style={{ fontSize: "0.75rem" }}>Qty</label>
                  <input
                    id={`qty-${item.productId}`}
                    type="number"
                    className="qalb-input !w-20"
                    min={1}
                    max={Math.max(1, Math.min(item.product.stock, 20))}
                    value={item.quantity}
                    onChange={(e) => {
                      const next = Math.floor(Number(e.target.value));
                      if (Number.isFinite(next) && next >= 1 && next !== item.quantity) void changeQuantity(item.productId, next);
                    }}
                  />
                  <button
                    type="button"
                    className="qalb-link"
                    onClick={(event) => void remove(item.productId, event.currentTarget.closest("li"))}
                    aria-label={`Remove ${item.product.name}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <strong className="font-medium">{formatMoney(item.product.priceCents * item.quantity)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <form
        className="qalb-card h-fit"
        noValidate
        aria-labelledby="checkout-title"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const parsed = checkoutSchema.safeParse({
            shippingName: data.get("shippingName"),
            shippingAddress: data.get("shippingAddress"),
            shippingCity: data.get("shippingCity"),
            shippingPostal: data.get("shippingPostal"),
            idempotencyKey: idempotencyKey.current,
          });
          if (!parsed.success) {
            const out: Record<string, string[]> = {};
            for (const issue of parsed.error.issues) (out[issue.path.join(".")] ??= []).push(issue.message);
            return checkout.fail(out);
          }
          void checkout.run(async () => {
            const result = await api<{ order: OrderDTO }>("/api/orders", { method: "POST", body: parsed.data });
            idempotencyKey.current = crypto.randomUUID();
            router.push(`/orders/${result.order.id}?placed=1`);
            router.refresh();
          });
        }}
      >
        <h2 id="checkout-title" style={{ fontSize: "1.5rem" }}>Checkout</h2>
        <p className="!text-qalb-black" data-testid="cart-total">
          Total <strong className="font-medium">{formatMoney(cart.totalCents)}</strong>
        </p>
        <p className="qalb-hint">Pay on delivery. We will confirm your order by email.</p>
        {checkout.error ? <Alert kind="error">{checkout.error}</Alert> : null}
        <TextField label="Full name" name="shippingName" autoComplete="name" required errors={checkout.fieldErrors.shippingName} />
        <TextField label="Address" name="shippingAddress" autoComplete="street-address" required errors={checkout.fieldErrors.shippingAddress} />
        <TextField label="City" name="shippingCity" autoComplete="address-level2" required errors={checkout.fieldErrors.shippingCity} />
        <TextField label="Postal code" name="shippingPostal" autoComplete="postal-code" required errors={checkout.fieldErrors.shippingPostal} />
        <button className="qalb-btn w-full" type="submit" disabled={checkout.pending}>
          {checkout.pending ? "Placing order..." : "Place order"}
        </button>
      </form>
    </div>
  );
}
