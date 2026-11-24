"use client";

import Link from "next/link";
import { useLayoutEffect, useOptimistic, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface CategoryTab {
  /** Empty string means "All". */
  value: string;
  label: string;
  href: string;
}

interface ShopCatalogProps {
  tabs: CategoryTab[];
  active: string;
  /** Changes whenever the visible result set changes, so the product grid replays its entrance. */
  viewKey: string;
  children: ReactNode;
}

interface Indicator {
  x: number;
  width: number;
}

/**
 * Category tabs with a sliding underline, plus the results area beneath them.
 *
 * Navigation is still plain links (shareable URLs, works without JavaScript, results come
 * from the server). With JavaScript, a click highlights the new tab immediately, dims the old
 * results while the new ones load, then swaps them in with a staggered entrance.
 */
export function ShopCatalog({ tabs, active, viewKey, children }: ShopCatalogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shownTab, setShownTab] = useOptimistic(active);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const link = list.querySelector<HTMLElement>('[data-active="true"]');
      if (link) setIndicator({ x: link.offsetLeft, width: link.offsetWidth });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [shownTab]);

  function onSelect(event: MouseEvent<HTMLAnchorElement>, tab: CategoryTab) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (modified) return; // let the browser open it in a new tab
    event.preventDefault();
    if (tab.value === shownTab) return;
    startTransition(() => {
      setShownTab(tab.value);
      router.push(tab.href, { scroll: false });
    });
  }

  return (
    <div className="qalb-catalog" data-pending={pending} aria-busy={pending}>
      <nav aria-label="Categories" className="qalb-tabs-wrap" data-indicator={indicator ? "on" : "off"}>
        <ul className="qalb-tabs" ref={listRef}>
          {tabs.map((tab) => {
            const isActive = tab.value === shownTab;
            return (
              <li key={tab.value || "all"}>
                <Link
                  href={tab.href}
                  className="qalb-tab"
                  data-active={isActive}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => onSelect(event, tab)}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
          {indicator ? (
            <li
              aria-hidden="true"
              className="qalb-tab-indicator"
              style={{ width: indicator.width, transform: `translateX(${indicator.x}px)` }}
            />
          ) : null}
        </ul>
      </nav>

      <div className="qalb-catalog-view" key={viewKey}>
        {children}
      </div>
    </div>
  );
}
