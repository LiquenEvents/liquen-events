import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Organização de Eventos`,
    short_name: SITE.name,
    description:
      "Empresa de organização de eventos em Évora, Alentejo e Portugal — casamentos, eventos corporativos e celebrações.",
    start_url: "/",
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    lang: "pt-PT",
    icons: [
      { src: "/logo-liquen.png", sizes: "any", type: "image/png" },
    ],
  };
}
