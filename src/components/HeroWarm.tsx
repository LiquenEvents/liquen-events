"use client";

import { useEffect } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { onIdle } from "@/lib/onIdle";

/**
 * Warms the OTHER marketing pages' hero images in the background so navigating
 * to them shows the sharp photo immediately — no "blurred placeholder, then it
 * opens" gap.
 *
 * Why this works: the router prefetches a route's DATA, but not its hero image
 * binary, so on arrival the hero still had to fetch + (cold-)encode, and the
 * blur placeholder covered that gap. Here, once the current page is idle, we
 * fetch each other hero at the EXACT `/_next/image` URL that page's
 * `<Image sizes="100vw">` will request on THIS device — same src, same width
 * (the candidate the browser would pick for a full-bleed image at this
 * viewport×DPR, capped at the 2048 deviceSizes max), same quality — so it lands
 * in the browser cache and the later request is an instant cache hit.
 *
 * Deferred to idle (after the current page's LCP) and skipped on Save-Data /
 * 2g-3g so it never competes with the visitor's actual page.
 */

// Public route → its hero image source (kept in sync with each page's hero).
const HERO_BY_ROUTE: Record<string, string> = {
  "/": "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
  "/sobre": "/imagens/hd-edited.jpg",
  "/servicos": "/imagens/EW1_1330.jpg",
  "/galeria": "/imagens/DaniGui_Preview20.jpg",
  "/contacto": "/imagens/EW1_1332.jpg",
  "/clientes": "/imagens/EW1_1393.jpg",
};

// Mirror next.config.ts images.deviceSizes (max 2048 after the hero cap).
const DEVICE_SIZES = [360, 480, 640, 768, 1024, 1280, 1536, 1920, 2048];

export default function HeroWarm() {
  const pathname = usePublicPathname();

  useEffect(() => {
    // Don't warm on the back office / quote flow, or the current page.
    if (pathname.startsWith("/orcamento")) return;
    // Respect data-saver / slow connections.
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (conn?.saveData || (conn?.effectiveType && /(^|-)(2g|3g)$/.test(conn.effectiveType))) return;

    return onIdle(() => {
      const dpr = window.devicePixelRatio || 1;
      const target = window.innerWidth * dpr;
      // The candidate next/image picks for a 100vw image on this device.
      const w = DEVICE_SIZES.find((s) => s >= target) ?? DEVICE_SIZES[DEVICE_SIZES.length - 1];
      for (const [route, src] of Object.entries(HERO_BY_ROUTE)) {
        if (route === pathname) continue; // this page's hero is already loading
        const img = new Image();
        img.decoding = "async";
        // Match the hero <Image sizes="100vw" quality={75}> request exactly.
        img.src = `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;
      }
    });
  }, [pathname]);

  return null;
}
