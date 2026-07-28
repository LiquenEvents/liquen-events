"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

/**
 * Loads the Plausible tracker, but only once the page is actually being viewed
 * — never while it's a Speculation-Rules PRERENDER (a hidden, background render
 * the visitor may never activate). Without this guard, prerendering a page
 * would fire a phantom pageview. On a normal load `document.prerendering` is
 * falsy, so it behaves exactly as before (lazy, non-blocking).
 */
export default function PlausibleTracker({ src, domain }: { src: string; domain: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const doc = document as Document & { prerendering?: boolean };
    if (!doc.prerendering) {
      // Activate on the normal (non-prerender) path. Done in the effect rather
      // than as the initial state so SSR (renders nothing) and the first client
      // render match — avoiding a hydration mismatch on the <Script>.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(true);
      return;
    }
    const onActivate = () => setActive(true);
    doc.addEventListener("prerenderingchange", onActivate, { once: true });
    return () => doc.removeEventListener("prerenderingchange", onActivate);
  }, []);

  if (!active) return null;
  return <Script defer data-domain={domain} src={src} strategy="lazyOnload" />;
}
