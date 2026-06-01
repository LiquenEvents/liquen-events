"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Subtle Pixel-Matters-style route transition: on each navigation the page
 * content fades/rises in, driven by the `key` change + the `.route-fade`
 * class. Pure CSS, GPU-friendly, and respects prefers-reduced-motion.
 *
 * The entrance is applied ONLY on client-side navigations — never on the very
 * first paint. Animating the initial page from opacity:0 would hold the LCP
 * element (the hero image) invisible while it fades, hurting Largest
 * Contentful Paint. We capture the entry pathname once (useState initializer):
 * the landing page renders without the class — matching SSR, so there's no
 * hydration mismatch and the hero paints immediately — while every other route
 * animates. Because each page's div is keyed by pathname, its class is decided
 * once at mount and never toggles mid-life (no flicker, no truncated fade).
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [entryPath] = useState(pathname);

  // Admin/orçamento run full-screen; don't animate their heavy surfaces.
  if (pathname.startsWith("/orcamento")) return <>{children}</>;

  const isNavigation = pathname !== entryPath;

  return (
    <div key={pathname} className={isNavigation ? "route-fade" : undefined}>
      {children}
    </div>
  );
}
