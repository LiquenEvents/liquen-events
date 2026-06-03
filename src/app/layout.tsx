import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import StickyCTA from "@/components/StickyCTA";
import ScrollProgress from "@/components/ScrollProgress";
import StructuredData from "@/components/StructuredData";
import PageTransition from "@/components/PageTransition";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary, htmlLang } from "@/lib/i18n";
import { SITE, SITE_KEYWORDS } from "@/lib/site";

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

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  const title = t.meta.homeTitle;
  const description = t.meta.homeDescription;
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
      canonical: "/",
      languages: { "pt-PT": "/" },
    },
    openGraph: {
      type: "website",
      locale: t.meta.ogLocale,
      siteName: SITE.name,
      url: SITE.url,
      title,
      description,
      images: [
        {
          url: SITE.ogImage,
          width: 2048,
          height: 1152,
          alt: "Líquen Events — organização de eventos em Portugal",
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <html
      lang={htmlLang(locale)}
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body className="flex flex-col min-h-screen antialiased">
        <LocaleProvider locale={locale}>
          <StructuredData />
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-moss focus:text-cream focus:rounded-md focus:text-sm"
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
        </LocaleProvider>
      </body>
    </html>
  );
}
