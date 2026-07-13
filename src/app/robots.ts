import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /orcamento/admin is intentionally NOT disallowed here: it carries its
      // own `noindex` meta tag (like /orcamento/confirmacao and /proposta),
      // and disallowing it would block crawlers from ever fetching the page
      // to see that tag — the classic disallow-prevents-noindex-from-working
      // anti-pattern. Login-gated either way, so there's nothing to expose.
      disallow: ["/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    // No `host` directive: it's non-standard (Yandex-only, and expects a bare
    // hostname, not a URL), and Google ignores it.
  };
}
