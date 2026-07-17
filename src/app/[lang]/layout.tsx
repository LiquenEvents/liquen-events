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
import PageTransition from "@/components/PageTransition";
import { LocaleProvider } from "@/components/LocaleProvider";
import SmoothScroll from "@/components/motion/SmoothScroll";
import { getDictionary, htmlLang, normalizeLocale, LOCALES } from "@/lib/i18n";
import { SITE, SITE_KEYWORDS } from "@/lib/site";

// Prerender both locales at build time. The locale now comes from the route
// segment (`/pt/*`, `/en/*`) instead of a runtime header/cookie, so every page
// under this layout can render statically. The proxy maps the public URLs
// (Portuguese at `/`, English at `/en/*`) onto these internal segments.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
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
    // Favicon/ícones gerados a partir de src/app/icon.png e apple-icon.png (logo Líquen).
    // Add GOOGLE_SITE_VERIFICATION in the environment to verify Search Console.
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

export const viewport: Viewport = {
  themeColor: "#faf8f3",
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
        <LocaleProvider locale={locale} dict={t}>
          <SmoothScroll>
            {imageCdnOrigin && <link rel="preconnect" href={imageCdnOrigin} />}
            <StructuredData locale={locale} />
            <Analytics />
            <a
              href="#conteudo"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-moss focus:text-white focus:rounded-md focus:text-sm"
            >
              {t.skipLink}
            </a>
            <ScrollProgress />
            <StickyCTA />
            <Navbar />
            <main id="conteudo" className="flex-1 pt-24">
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
