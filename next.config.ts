import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Imagens: servir AVIF/WebP modernos e em cache longo ──
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000, // 1 ano
  },

  // ── Higiene de produção ──
  poweredByHeader: false,        // não expõe "X-Powered-By: Next.js"
  reactStrictMode: true,

  // Mantém o build a passar mesmo com avisos de lint (deploy resiliente)
  eslint: { ignoreDuringBuilds: true },

  // ── Cabeçalhos: segurança + cache agressivo dos estáticos ──
  async headers() {
    const securityHeaders = [
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
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Fotografias e logótipos: imutáveis, cache de 1 ano
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

export default nextConfig;
