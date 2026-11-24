"use client";

import { createElement, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type RevealTag = "div" | "li" | "section" | "p" | "header";

interface RevealProps {
  as?: RevealTag;
  /** Extra wait in milliseconds before the element animates in, for staggering siblings. */
  delay?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Fades and lifts its content into place the first time it scrolls into view.
 *
 * Progressive by design: the server renders the content fully visible, so nothing is
 * hidden without JavaScript. Only elements that start below the fold are hidden after
 * mount, which means there is no flash for content already on screen. Users who prefer
 * reduced motion never get the hidden state at all.
 */
export function Reveal({ as = "div", delay = 0, className, children }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      delete element.dataset.reveal;
      return;
    }

    // Already on screen (or scrolled past): leave it alone.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) {
      delete element.dataset.reveal;
      return;
    }

    element.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.dataset.reveal = "shown";
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined = delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;
  return createElement(as, { ref, className, style }, children);
}
