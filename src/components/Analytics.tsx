import Script from "next/script";

/**
 * Privacy-friendly analytics (Plausible) — cookieless, no consent banner needed,
 * and host-agnostic (works on Vercel or a self-hosted container alike).
 *
 * Inert until `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set: with no env var it renders
 * nothing, so there's no external request and no extra CSP surface until you
 * opt in.
 *
 * To enable:
 *   1. Create a site at https://plausible.io (or self-host) for your domain.
 *   2. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN=liquen-events.com
 *   3. (Self-hosting only) point the script at your instance with
 *      NEXT_PUBLIC_PLAUSIBLE_SRC=https://plausible.example.com/js/script.js
 *      and add that host to the CSP `script-src` in next.config.ts.
 */
export default function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js";
  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />;
}
