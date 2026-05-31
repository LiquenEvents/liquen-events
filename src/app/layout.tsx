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

const TITLE = "Líquen Events — Organização de Eventos em Évora, Alentejo e Portugal";
const DESCRIPTION =
  "Empresa de organização de eventos em Évora. Casamentos, eventos corporativos e celebrações em todo o Alentejo, Lisboa e Portugal. Soluções à medida — peça orçamento.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: TITLE,
    template: "%s | Líquen Events",
  },
  description: DESCRIPTION,
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
    locale: SITE.locale,
    siteName: SITE.name,
    url: SITE.url,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: SITE.ogImage,
        width: 1920,
        height: 1080,
        alt: "Líquen Events — organização de eventos em Évora e Portugal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.ogImage],
  },
  // Favicon/ícones gerados a partir de src/app/icon.png e apple-icon.png (logo Líquen).
  // Add GOOGLE_SITE_VERIFICATION in the environment to verify Search Console.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#080808",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" data-scroll-behavior="smooth" className={`${inter.variable} ${playfair.variable}`}>
      <body className="flex flex-col min-h-screen antialiased">
        <StructuredData />
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-moss focus:text-cream focus:rounded-md focus:text-sm"
        >
          Saltar para o conteúdo
        </a>
        <ScrollProgress />
        <StickyCTA />
        <Navbar />
        <main id="conteudo" className="flex-1 pt-16">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
