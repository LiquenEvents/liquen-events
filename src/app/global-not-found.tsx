import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import CromadoDoSitio from "@/components/CromadoDoSitio";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, pickChromeDict, htmlLang, type Locale } from "@/lib/i18n";
import { CABECALHO_DA_LINGUA } from "@/lib/lingua-do-pedido";
import NotFoundView from "./[lang]/(site)/NotFoundView";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O 404 DO SÍTIO — COM ESTADO 404 E LEGÍVEL SEM JAVASCRIPT (auditoria externa)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os endereços que não existiam respondiam 200. Havia uma rota apanha-tudo em
 * `(site)/[...caminho]` que DESENHAVA o `NotFoundView`, e não podia fazer
 * outra coisa: debaixo do `loading.tsx` do `(site)` a resposta vai em
 * streaming e o estado 200 já seguiu quando a página corre. E `/.env` ou
 * `/backup.zip` (um só segmento, com ponto) nem lá chegavam: passavam pelo
 * `[lang]`, que aceitava qualquer valor, e saía a PÁGINA INICIAL com 200.
 *
 * Medido com `notFound()` num grupo sem `loading.tsx`: o estado passava a 404,
 * mas o corpo vinha vazio (`<div hidden><!--$--><!--/$--></div>`) e o 404 só se
 * desenhava depois de o JavaScript chegar — sem JavaScript, um ecrã em branco.
 *
 * Este ficheiro é a saída que a documentação do Next indica para um layout de
 * raiz num segmento dinâmico (`app/[lang]/layout.tsx`): o Next não renderiza
 * rota nenhuma, devolve esta página pronta com 404. Ligado em next.config.ts
 * (`experimental.globalNotFound`). Recebe tudo o que não casa com rota nenhuma:
 *   · um `[lang]` que não seja `pt` nem `en` (`dynamicParams = false` no
 *     layout de `[lang]`) — `/.env`, `/backup.zip`;
 *   · e qualquer caminho sem página — `/pagina-que-nao-existe`, `/en/x/y`.
 *
 * Como não passa pelo layout, traz o que precisa: a folha global, as duas
 * fontes do primeiro ecrã, e o cromado do sítio (menu e rodapé) à volta do
 * `NotFoundView` de sempre. A língua não vem de parâmetros (não há): vem do
 * cabeçalho que o `proxy` escreve em cada pedido de página
 * (`CABECALHO_DA_LINGUA`) — `/en/…` responde em inglês, o resto em português.
 */

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
  style: ["normal"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
});

async function lingua(): Promise<Locale> {
  return (await headers()).get(CABECALHO_DA_LINGUA) === "en" ? "en" : "pt";
}

/**
 * O título é FIXO, e de propósito sem língua. Lê-lo do cabeçalho (como o corpo)
 * tornava estes metadados dinâmicos, e o Next deixava de os usar como recurso
 * para os 404 pré-gerados de outros ramos — o `/s/portugal` (variante que só
 * existe em inglês) passava a sair com o título da página inicial. «404» lê-se
 * nas duas línguas. Completo à mão: aqui não há o molde `%s | Líquen Events` do
 * layout de raiz, que é o que punha a marca duas vezes no 404 de antes.
 */
export const metadata: Metadata = {
  title: "404 | Líquen Events",
  robots: { index: false, follow: false },
};

export default async function GlobalNotFound() {
  const locale = await lingua();
  const t = getDictionary(locale);
  return (
    <html lang={htmlLang(locale)} className={`${inter.variable} ${playfair.variable}`}>
      <body className="flex flex-col min-h-screen antialiased">
        <LocaleProvider locale={locale} dict={pickChromeDict(t)}>
          <CromadoDoSitio locale={locale} skipLabel={t.skipLink}>
            <NotFoundView />
          </CromadoDoSitio>
        </LocaleProvider>
      </body>
    </html>
  );
}
