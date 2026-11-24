"use client";

import { useEffect, useRef } from "react";

interface ParallaxImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * An image that drifts slightly slower than the page as it scrolls past.
 * The image is scaled up a little inside a clipped frame so the drift never reveals an edge.
 * Users who prefer reduced motion get a still image.
 */
export function ParallaxImage({ src, alt, width, height, className }: ParallaxImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const MAX_SHIFT = 22; // px, either direction
    let raf = 0;

    const update = () => {
      raf = 0;
      const rect = frame.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (rect.bottom < 0 || rect.top > viewport) return;
      // +1 when the frame is just entering at the bottom of the window, -1 when it has just left at the top.
      const progress = (rect.top + rect.height / 2 - viewport / 2) / (viewport / 2 + rect.height / 2);
      const clamped = Math.max(-1, Math.min(1, progress));
      image.style.transform = `translate3d(0, ${(-clamped * MAX_SHIFT).toFixed(1)}px, 0) scale(1.12)`;
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={frameRef} className={`overflow-hidden ${className ?? ""}`}>
      <img ref={imageRef} src={src} alt={alt} width={width} height={height} loading="lazy" className="h-full w-full object-cover will-change-transform" />
    </div>
  );
}
