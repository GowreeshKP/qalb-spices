import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";
import { requireUserPage } from "@/server/current-user";
import { getCart } from "@/server/services/cart";

export const metadata: Metadata = { title: "Your cart" };

export default async function CartPage() {
  const user = await requireUserPage("/cart");
  const cart = await getCart(user.id);
  return (
    <section className="page">
      <div className="container-qalb">
        <p className="qalb-label qalb-muted">Almost there</p>
        <h1>Your cart</h1>
        <hr className="qalb-divider" />
        <CartView initial={cart} />
      </div>
    </section>
  );
}
