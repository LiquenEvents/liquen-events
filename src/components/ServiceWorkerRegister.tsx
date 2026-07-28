"use client";

import { useEffect } from "react";
import { onIdle } from "@/lib/onIdle";

/**
 * Registers the site-wide service worker (public/sw.js), which provides the
 * offline cache for the marketing site (and doubles as the push worker the
 * back office already used). Registration is deferred to idle so it never
 * competes with the current page's LCP, and only runs in production — a caching
 * SW would interfere with dev HMR.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    return onIdle(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort; the site works fine without it */
      });
    });
  }, []);

  return null;
}
