// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Footer from "./Footer";
import { SITE } from "@/lib/site";
import { LOCALES } from "@/lib/i18n/config";

/**
 * O LINKEDIN AO LADO DAS OUTRAS REDES (pedido dela, 16/10: «coloca o LinkedIn
 * no site ao lado das outras redes sociais»). O endereço é o que ela deu e já
 * estava em `SITE.linkedin` (vai nos emails desde então); faltava no sítio.
 */
describe("o LinkedIn no rodapé", () => {
  for (const locale of LOCALES) {
    it(`${locale}: aparece com as outras redes, e abre o perfil dela`, () => {
      const html = renderToStaticMarkup(<Footer locale={locale} />);
      const href = SITE.linkedin.replace(/&/g, "&amp;");
      expect(html).toContain(`href="${href}"`);
      expect(html).toMatch(/aria-label="LinkedIn \(/);
      // Ao lado das outras: Instagram, Facebook, LinkedIn, pela ordem.
      const i = html.indexOf(`href="${SITE.instagram}"`);
      const f = html.indexOf(`href="${SITE.facebook}"`);
      const l = html.indexOf(`href="${href}"`);
      expect(i).toBeGreaterThan(-1);
      expect(f).toBeGreaterThan(i);
      expect(l).toBeGreaterThan(f);
    });
  }
});
