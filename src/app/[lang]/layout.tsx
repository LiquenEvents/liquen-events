import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "../globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import StickyCTA from "@/components/StickyCTA";
import ScrollProgress from "@/components/ScrollProgress";
import StructuredData from "@/components/StructuredData";
import Analytics from "@/components/Analytics";
import LeadSourceCapture from "@/components/LeadSourceCapture";
import PageTransition from "@/components/PageTransition";
import { LocaleProvider } from "@/components/LocaleProvider";
import SmoothScroll from "@/components/motion/SmoothScroll";
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
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
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
          alt: "Líquen Events — decoração de eventos no Alentejo",
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
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body className="flex flex-col min-h-screen antialiased">
        <LocaleProvider locale={locale} dict={pickChromeDict(t)}>
          <SmoothScroll>
            {imageCdnOrigin && <link rel="preconnect" href={imageCdnOrigin} />}
            <StructuredData locale={locale} />
            <Analytics />
            <LeadSourceCapture />
            <a
              href="#conteudo"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-moss focus:text-white focus:rounded-md focus:text-sm"
            >
              {t.skipLink}
            </a>
            <ScrollProgress />
            <StickyCTA />
            <Navbar />
            {/* tabIndex=-1 so the skip link actually MOVES keyboard focus into
                the content (an <a href="#conteudo"> only scrolls to a non-
                focusable target — focus would stay on the skip link). */}
            <main id="conteudo" tabIndex={-1} className="flex-1 pt-24 outline-none">
              <PageTransition>{children}</PageTransition>
            </main>
            <Footer locale={locale} />
            <WhatsAppButton />
          </SmoothScroll>
        </LocaleProvider>
      </body>
    </html>
  );
}
