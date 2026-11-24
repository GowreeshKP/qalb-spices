import Link from "next/link";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/current-user";
import { CartBadge } from "./cart-badge";
import { LogoutButton } from "./logout-button";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const cartCount = user
    ? ((await db.cartItem.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }))._sum.quantity ?? 0)
    : 0;

  const navLink = "qalb-navlink qalb-label inline-flex min-h-[44px] items-center text-qalb-black no-underline hover:text-qalb-clay";

  return (
    <header className="px-[var(--page-margin)] pt-4 text-center">
      <Link href="/" aria-label="QALB Spices, home" className="inline-block p-[60px] pb-[30px]">
        <img src="/qalb-logo-fullcolor.png" alt="QALB Spices" width={120} height={205} />
      </Link>
      <nav aria-label="Main">
        <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-8 gap-y-2 p-0">
          <li><Link className={navLink} href="/shop">Shop</Link></li>
          {user ? (
            <>
              <li>
                <Link className={navLink} href="/cart">
                  Cart<CartBadge count={cartCount} />
                </Link>
              </li>
              <li><Link className={navLink} href="/orders">Orders</Link></li>
              <li><Link className={navLink} href="/account">Account</Link></li>
              {user.role === "ADMIN" ? <li><Link className={navLink} href="/admin">Admin</Link></li> : null}
              <li><LogoutButton /></li>
            </>
          ) : (
            <>
              <li><Link className={navLink} href="/login">Log in</Link></li>
              <li><Link className={navLink} href="/signup">Sign up</Link></li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}
