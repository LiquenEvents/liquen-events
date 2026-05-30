import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import StickyCTA from "@/components/StickyCTA";
import ScrollProgress from "@/components/ScrollProgress";
import StructuredData from "@/components/StructuredData";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://liquenevents.pt"),
  title: {
    default: "Liquen Events | Eventos Inesquecíveis",
    template: "%s | Liquen Events",
  },
  description:
    "Organização de eventos corporativos e sociais em Portugal. Transformamos momentos em memórias inesquecíveis.",
  keywords: [
    "organização de eventos",
    "eventos corporativos",
    "casamentos",
    "wedding planner",
    "eventos Évora",
    "eventos Alentejo",
    "Liquen Events",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "Liquen Events",
    title: "Liquen Events | Eventos Inesquecíveis",
    description:
      "Organização de eventos corporativos e sociais em Portugal. Transformamos momentos em memórias inesquecíveis.",
    images: [{ url: "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg", width: 1920, height: 1080, alt: "Líquen Events — eventos inesquecíveis em Portugal" }],
  },
  icons: {
    icon: "/logo-liquen.png",
    shortcut: "/logo-liquen.png",
    apple: "/logo-liquen.png",
  },
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
        <main id="conteudo" className="flex-1 pt-16">{children}</main>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
