import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Archivo } from "next/font/google";
import "../globals.css";
import StructuredData from "@/components/StructuredData";
import Analytics from "@/components/Analytics";
import GoogleTag from "@/components/GoogleTag";
import ConsentBanner from "@/components/ConsentBanner";
import LeadSourceCapture from "@/components/LeadSourceCapture";
import WebVitals from "@/components/WebVitals";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, htmlLang, normalizeLocale, LOCALES, pickChromeDict } from "@/lib/i18n";
import { SITE, SITE_KEYWORDS } from "@/lib/site";

// Prerender both locales at build time. The locale now comes from the route
// segment (`/pt/*`, `/en/*`) instead of a runtime header/cookie, so every page
// under this layout can render statically. The proxy maps the public URLs
// (Portuguese at `/`, English at `/en/*`) onto these internal segments.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// Both faces stay VARIABLE (no `weight`): a single woff2 per family that
// already covers every weight the design uses — Inter 300–700 (font-light
// counters → font-bold) and Playfair 400–700 (400 nav menu / gallery captions /
// faux-italic sign-off, 500 a gallery caption, 700 headings; the site never
// renders any weight above 700 or below 300). Pinning discrete weights would be
// a payload REGRESSION here: next/font emits one static file per weight for a
// variable font, i.e. 5 files for Inter and 3 for Playfair instead of one each.
// next/font already trims to the `wght` axis and, with `subsets: ["latin"]`,
// to the Latin glyphs — which cover the PT/EN diacritics (ã õ ç é …) — so the
// payload is already minimal.
//
// The CLS work is in the fallback wiring: display:"swap" keeps text visible
// immediately (several heroes mask their title reveal, but body copy must never
// be invisible → not "optional"); adjustFontFallback (default true, set
// explicitly so it can't silently regress) size-adjusts the fallback metrics;
// and the metric-near fallback stacks below mean the swap barely reflows the
// large Playfair headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  // The real italic, not the browser's synthetic slant. Playfair's italic is a
  // separate drawing (single-storey a, calligraphic f), and the sign-off, the
  // pull-quote and the warm greeting are all set in it — a faux-oblique of the
  // roman looked mechanical exactly where the page is trying to feel written.
  style: ["normal", "italic"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
});

// Technical "engineered" grotesque (DIN-adjacent) for the back-office's
// SpaceX-style, uppercase interface. Self-hosted by next/font so it's covered
// by the tight CSP (font-src 'self'). Only the admin surface opts into it (see
// .admin-mode in globals.css); the public marketing site keeps Inter/Playfair.
const archivo = Archivo({
  variable: "--font-spacex",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  // Archivo is used ONLY inside .admin-mode (the back office). Its CSS variable
  // is attached to <html> for the whole site, so with the default preload:true
  // next/font emitted a high-priority <link rel="preload"> for it on every
  // PUBLIC page — a font marketing visitors never render, competing with the
  // hero LCP. preload:false fetches it on demand (still display:"swap"); the
  // back office is unaffected. No visual change on either surface.
  preload: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const title = t.meta.homeTitle;
  const description = t.meta.homeDescription;
  // English mirror canonicalises to "/en"; the Portuguese home stays at "/".
  const canonical = locale === "en" ? "/en" : "/";
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: title,
      template: "%s | Líquen Events",
    },
    description,
    applicationName: SITE.name,
    authors: [{ name: SITE.name, url: SITE.url }],
    creator: SITE.name,
    publisher: SITE.name,
    keywords: [...SITE_KEYWORDS],
    category: "Event Planning",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: {
      canonical,
      languages: { "pt-PT": "/", en: "/en", "x-default": "/" },
    },
    openGraph: {
      type: "website",
      locale: t.meta.ogLocale,
      // Tell Facebook/LinkedIn the other language exists (reciprocal signal).
      alternateLocale: t.meta.ogLocale === "pt_PT" ? "en_GB" : "pt_PT",
      siteName: SITE.name,
      url: `${SITE.url}${canonical === "/" ? "" : canonical}`,
      title,
      description,
      images: [
        {
          url: SITE.ogImage,
          width: 1200,
          height: 630,
          alt: "Líquen Events, decoração de eventos no Alentejo",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SITE.ogImage],
    },
    // iOS "Add to Home Screen": a standalone title + status-bar style, so an
    // installed shortcut shows "Líquen" and branded chrome instead of the raw
    // <title> and default bar.
    appleWebApp: {
      capable: true,
      title: "Líquen",
      statusBarStyle: "default",
    },
    // Favicon/ícones gerados a partir de src/app/icon.png e apple-icon.png (logo Líquen).
    // Add GOOGLE_SITE_VERIFICATION in the environment to verify Search Console.
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

export const viewport: Viewport = {
  // Brand cream in light; a deep moss for dark-mode UA chrome, instead of a flat
  // white that reads as unconsidered.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1b2119" },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  // Warm the connection to the image CDN (when enabled) so the LCP image isn't
  // delayed by the TLS handshake. No-op until NEXT_PUBLIC_IMAGE_CDN is set.
  let imageCdnOrigin = "";
  try {
    if (process.env.NEXT_PUBLIC_IMAGE_CDN) {
      imageCdnOrigin = new URL(process.env.NEXT_PUBLIC_IMAGE_CDN).origin;
    }
  } catch {
    /* malformed value — skip the hint */
  }
  return (
    <html
      lang={htmlLang(locale)}
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${playfair.variable} ${archivo.variable}`}
    >
      {/*
        O QUE FICA AQUI E O QUE SAIU DAQUI.

        Este layout é o de RAIZ: é ele que emite <html> e <body>, as
        tipografias, e as peças que TODAS as ramificações precisam —
        identidade estruturada, os dois tags de medição, o consentimento e a
        captura de origem do lead. Nada disto é opcional em lado nenhum.

        A barra de navegação, o rodapé, o CTA fixo, a barra de progresso, as
        transições de página e o aquecimento de capas saíram para
        <CromadoDoSitio>, que só o grupo (site) monta. A razão está escrita
        nesse ficheiro, e é medida: eram a maior fatia dos 207 KB de
        JavaScript que chegavam a uma landing page paga cujo trabalho inteiro
        é mostrar uma fotografia, uma frase e um botão.
      */}
      <body className="flex flex-col min-h-screen antialiased">
        <LocaleProvider locale={locale} dict={pickChromeDict(t)}>
          {imageCdnOrigin && <link rel="preconnect" href={imageCdnOrigin} />}
          <StructuredData locale={locale} />
          <Analytics />
          <GoogleTag />
          <LeadSourceCapture />
          <WebVitals />
          {children}
          <ConsentBanner locale={locale} />
        </LocaleProvider>
      </body>
    </html>
  );
}
