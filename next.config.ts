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

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

    // Content-Security-Policy. Next's runtime still relies on inline bootstrap
    // scripts and we use inline styles throughout, so script/style keep
    // 'unsafe-inline' (a nonce-based policy would need middleware). The
    // high-value, low-risk directives — object-src, base-uri, frame-ancestors,
    // form-action — are locked down. connect-src allows https/wss so Supabase
    // and Web Push keep working. 'unsafe-eval' is dev-only (React refresh).
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
      "report-uri /api/security/csp-report",
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
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
    ];
  },
};

// Wrap with the bundle analyzer (run `npm run analyze` to open the report).
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
