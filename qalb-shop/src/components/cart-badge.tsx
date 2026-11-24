"use client";

import { useEffect, useRef, useState } from "react";

/** The "(n)" next to Cart in the header. It gives a small pop whenever the count changes. */
export function CartBadge({ count }: { count: number }) {
  const previous = useRef(count);
  const [pops, setPops] = useState(0);

  useEffect(() => {
    if (previous.current !== count) {
      previous.current = count;
      setPops((n) => n + 1);
    }
  }, [count]);

  return (
    <span
      key={pops}
      aria-label={`${count} items in cart`}
      data-testid="cart-count"
      className={pops > 0 ? "qalb-pop inline-block" : "inline-block"}
    >
      &nbsp;({count})
    </span>
  );
}
