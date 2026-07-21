import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // Self-contained server bundle so the app can run in any container/cloud
  // (Vercel ignores this and uses its own build).
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000,
    // Serve images inline instead of as attachment downloads
    contentDispositionType: "inline",
  },

  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  experimental: {
    // React <ViewTransition> (View Transitions API): página-a-página com
    // deslize direcional e morph thumbnail→lightbox na galeria. Browsers sem
    // suporte navegam normalmente, apenas sem animação.
    viewTransition: true,
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

    // Plausible (optional analytics) is the only third party the BROWSER talks
    // to. Derive its exact origin from the script src so a self-hosted instance
    // is covered too — mirrors Analytics.tsx. Empty when analytics is disabled,
    // so the CSP stays tight by default (no analytics env = no extra surface).
    let plausibleOrigin = "";
    if (process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
      try {
        plausibleOrigin = new URL(
          process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js",
        ).origin;
      } catch {
        plausibleOrigin = "https://plausible.io";
      }
    }
    const plausible = plausibleOrigin ? ` ${plausibleOrigin}` : "";

    // Browser-side connections. Everything third-party runs SERVER-side with
    // non-public env (Supabase service key, Sentry DSN, Slack/Discord webhooks),
    // so the browser never opens those sockets — connect-src doesn't need them.
    // Web Push uses the ServiceWorker/PushManager (not fetch) and posts the
    // subscription same-origin. So production only needs 'self' plus Plausible's
    // event beacon (when enabled); dev keeps ws/https open for HMR.
    const connectSrc = isDev
      ? "connect-src 'self' https: wss: ws:"
      : `connect-src 'self'${plausible}`;

    // Content-Security-Policy. Next's runtime still relies on inline bootstrap
    // scripts and we use inline styles throughout, so script/style keep
    // 'unsafe-inline' (a nonce-based policy would need middleware). The
    // high-value, low-risk directives — object-src, base-uri, frame-ancestors,
    // form-action, and now a tightly-scoped connect-src — are locked down.
    // 'unsafe-eval' is dev-only (React refresh).
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${plausible}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      connectSrc,
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
      // report-to is the modern reporting directive (Reporting API v1); report-uri
      // is kept as the fallback for browsers that don't yet honour report-to. Both
      // point at the same collector endpoint.
      "report-to csp-endpoint",
      "report-uri /api/security/csp-report",
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      // Named endpoint referenced by the CSP `report-to` directive above.
      {
        key: "Reporting-Endpoints",
        value: 'csp-endpoint="/api/security/csp-report"',
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      // Isolate the browsing context and block legacy cross-domain policy files.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/imagens/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/logos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Root-level static assets fetched on effectively every visit/crawl but
        // NOT served through /_next/image (so they miss minimumCacheTTL) and NOT
        // under /imagens or /logos: the PWA manifest icons and the social OG
        // image. With output:standalone (self-hosted, no platform CDN backfill)
        // these otherwise revalidate on every request. Hashless filenames, but
        // they only change on a deploy, so a long immutable TTL is safe.
        source: "/:file(og-liquen.jpg|icon-192.png|icon-512.png|icon-maskable-512.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

// Wrap with the bundle analyzer (run `npm run analyze` to open the report).
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
