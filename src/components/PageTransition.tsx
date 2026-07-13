"use client";

import { usePublicPathname } from "@/lib/use-public-pathname";
import { useState } from "react";
import { ViewTransition } from "./vt";

/**
 * Route transitions. With React <ViewTransition> available (Next 16 +
 * experimental.viewTransition), navigations animate via the browser's View
 * Transitions API: a soft rise by default, and a DIRECTIONAL slide when the
 * link carries a `nav-forward`/`nav-back` transition type (the Navbar tags its
 * links by menu order, so moving "deeper" in the menu slides left, returning
 * slides right). Without the API, falls back to the original CSS route-fade.
 *
 * Entrances are applied ONLY on client-side navigations — never on the very
 * first paint. Animating the initial page would hold the LCP hero invisible
 * while it fades, hurting Largest Contentful Paint. We capture the entry
 * pathname once: the landing render stays static (matches SSR — no hydration
 * mismatch), every subsequent route animates.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePublicPathname();
  const [entryPath] = useState(pathname);

  // Admin/orçamento run full-screen; don't animate their heavy surfaces.
  if (pathname.startsWith("/orcamento")) return <>{children}</>;

  const isNavigation = pathname !== entryPath;

  if (!ViewTransition) {
    return (
      <div key={pathname} className={isNavigation ? "route-fade" : undefined}>
        {children}
      </div>
    );
  }

  // Keyed by pathname: the old route's tree exits, the new one enters — the
  // enter/exit maps translate the navigation's transition type into the CSS
  // class the ::view-transition-* rules in globals.css animate.
  const typeMap = {
    "nav-forward": "vt-page-fwd",
    "nav-back": "vt-page-bwd",
    default: "vt-page",
  };
  return (
    <ViewTransition key={pathname} enter={typeMap} exit={typeMap} default="none">
      {children}
    </ViewTransition>
  );
}
