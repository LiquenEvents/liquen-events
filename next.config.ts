import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // Self-contained server bundle so the app can run in any container/cloud
  // (Vercel ignores this and uses its own build).
  output: "standalone",
  // sharp is a NATIVE module used directly in the proposal-PDF route (image
  // cover-crop). Keep it external so it's loaded from node_modules at runtime
  // instead of being bundled — a bundled native binary can fail to load on
  // serverless and throw when the first image is processed.
  serverExternalPackages: ["sharp"],
  images: {
    // WebP only — no AVIF. AVIF compresses a few % smaller but o seu encode
    // on-the-fly é várias vezes mais lento, e um encode a frio de vários
    // segundos por imagem é exactamente o que fazia o optimizador esgotar o
    // tempo sob rajada ("às vezes nem carregam"). Depois de encodadas, ambas
    // ficam em cache imutável durante um ano, por isso a diferença de tamanho
    // só custaria ao primeiro visitante — não compensa.
    //
    // NOTA: as 427 miniaturas da galeria já NÃO passam por aqui. São ficheiros
    // WebP estáticos gerados no build (scripts/pregen-gallery.mjs +
    // src/app/[lang]/galeria/gallery-image-loader.ts), precisamente para não
    // dependerem de encode on-demand nenhum. O que resta neste optimizador é a
    // foto do lightbox e as imagens de conteúdo das outras páginas.
    formats: ["image/webp"],
    // ESTA LISTA TEM DE CONTER TODOS OS `quality={…}` DO SÍTIO. O optimizador
    // rejeita com HTTP 400 (`"q" parameter (quality) of N is not allowed`)
    // qualquer valor que não esteja aqui — ver
    // node_modules/next/dist/server/image-optimizer.js:635-643. Só se avisa em
    // DESENVOLVIMENTO (um warnOnce na consola); em produção a imagem
    // simplesmente nunca carrega, sempre, sistematicamente. Faltavam dois
    // valores que o código usa mesmo: 55 (o logótipo do Navbar, em todas as
    // páginas do sítio) e 70 (a página de confirmação de orçamento).
    //
    // 82 saiu: nenhum `quality={82}` existe no código (os heróis são servidos
    // por ficheiros pré-gerados a 75, ver scripts/pregen-heroes.mjs), e um
    // valor a mais aqui é só mais uma família de chaves de cache que ninguém
    // pede. 65 fica para o caminho de recurso da galeria.
    //
    // Ao mexer nesta lista: `npx tsx`-nada, basta
    // `grep -rho 'quality={[0-9]*}' src/ | sort -u`.
    qualities: [50, 55, 65, 70, 72, 75],
    // Tecto em 1920 — o mesmo que estava em produção.
    //
    // Esteve aqui um 2048 com um comentário a dizer que "baixámos de 2560";
    // 2560 nunca esteve na configuração publicada, por isso na prática o 2048
    // SUBIA o tecto. Medido, fazia o lightbox pedir w=2048 a 250,0 KB por foto
    // (a largura mais cara de toda a matriz) em portáteis 2x, para uma
    // diferença que ninguém vê numa foto em object-contain.
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

    // Google tag (gtag.js) for Google Ads conversion measurement + remarketing
    // (see GoogleTag.tsx / Consent Mode). These are the hosts the browser talks
    // to once the tag is active: the loader (googletagmanager.com), the pixel/
    // beacon endpoints (google-analytics + doubleclick + googleadservices), and
    // the conversion-linker iframe (td.doubleclick.net). Kept as tight as the
    // ad stack allows — no wildcards beyond the analytics beacon regions.
    const gaScript = " https://www.googletagmanager.com";
    const gaImg =
      " https://www.googletagmanager.com https://www.google.com https://www.google.pt https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com";
    const gaConnect =
      " https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com https://pagead2.googlesyndication.com";
    const gaFrame = "https://td.doubleclick.net https://www.googletagmanager.com";

    // Image hosts the BROWSER loads via <img>: proposal cover/mood-board images
    // are served as signed URLs from Supabase Storage, and the (optional) gallery
    // CDN. Without these in img-src the browser blocks them and the thumbnail
    // renders as a broken image. Derive exact origins from env so the policy
    // stays as tight as possible (empty when unconfigured).
    const imgOrigins = Array.from(
      new Set(
        [
          process.env.SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_IMAGE_CDN,
        ]
          .map((v) => {
            if (!v) return "";
            try {
              return new URL(v).origin;
            } catch {
              return "";
            }
          })
          .filter(Boolean),
      ),
    ).join(" ");
    const imgExtra = imgOrigins ? ` ${imgOrigins}` : "";

    // Browser-side connections. Everything third-party runs SERVER-side with
    // non-public env (Supabase service key, Sentry DSN, Slack/Discord webhooks),
    // so the browser never opens those sockets — connect-src doesn't need them.
    // Web Push uses the ServiceWorker/PushManager (not fetch) and posts the
    // subscription same-origin. So production only needs 'self' plus Plausible's
    // event beacon (when enabled); dev keeps ws/https open for HMR.
    const connectSrc = isDev
      ? "connect-src 'self' https: wss: ws:"
      : `connect-src 'self'${plausible}${gaConnect}`;

    // Content-Security-Policy. Next's runtime still relies on inline bootstrap
    // scripts and we use inline styles throughout, so script/style keep
    // 'unsafe-inline' (a nonce-based policy would need middleware). The
    // high-value, low-risk directives — object-src, base-uri, frame-ancestors,
    // form-action, and now a tightly-scoped connect-src — are locked down.
    // 'unsafe-eval' is dev-only (React refresh).
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${plausible}${gaScript}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${imgExtra}${gaImg}`,
      "font-src 'self' data:",
      connectSrc,
      "worker-src 'self'",
      "manifest-src 'self'",
      `frame-src 'self' ${gaFrame}`,
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

  async redirects() {
    // Legacy URLs from the previous (Wix) site that Google still has indexed →
    // the equivalent page on the rebuilt site, so old search results and
    // bookmarks land on real content instead of a 404, and Google transfers the
    // old pages' ranking onto the new URLs. permanent → 308 (Google treats it
    // like a 301). Both the decoded and %-encoded forms of the accented paths
    // are listed because the incoming pathname can arrive either way.
    const APEX = "https://liquen-events.com";
    return [
      { source: "/eventos", destination: `${APEX}/servicos`, permanent: true },
      { source: "/serviços", destination: `${APEX}/servicos`, permanent: true },
      { source: "/servi%C3%A7os", destination: `${APEX}/servicos`, permanent: true },
      { source: "/contactos", destination: `${APEX}/contacto`, permanent: true },
      { source: "/portfólio-de-eventos", destination: `${APEX}/galeria`, permanent: true },
      { source: "/portf%C3%B3lio-de-eventos", destination: `${APEX}/galeria`, permanent: true },
      // Safety net: once www.liquen-events.com's DNS points here, forward every
      // remaining www request to the same path on the canonical apex host (the
      // one the whole site treats as canonical, SITE.url). Vercel's own domain
      // redirect normally covers this too — this just guarantees it in code.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.liquen-events.com" }],
        destination: `${APEX}/:path*`,
        permanent: true,
      },
    ];
  },
};

// Bundle analyzer.
//
// ATENÇÃO: `npm run analyze` NÃO produz relatório nenhum neste projecto. O
// @next/bundle-analyzer é um plugin de webpack e o `next build` do Next 16 usa
// Turbopack; o próprio build avisa "The Next Bundle Analyzer is not compatible
// with Turbopack builds, no report will be generated" — mas sai com código 0, o
// que faz o comando parecer bem-sucedido.
//
// Para ver o peso dos chunks a sério, uma destas duas:
//   • `npx next experimental-analyze` — o analisador do Turbopack (verificado:
//     corre e serve o relatório em http://127.0.0.1:4000);
//   • `next build --webpack`, que reactiva este plugin (build mais lento e não
//     é o que a produção usa, por isso os números afastam-se um pouco).
//
// O wrapper fica: é inerte quando ANALYZE não está definido e volta a funcionar
// se algum dia se voltar ao webpack.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
