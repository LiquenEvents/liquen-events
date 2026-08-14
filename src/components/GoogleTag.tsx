"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { TOKEN_PATH_PATTERN, TOKEN_PLACEHOLDER, isTokenRoute } from "@/lib/safe-path";

// Google tag IDs for Líquen Events. PUBLIC identifiers — they ship in the page
// source by design, so hard-coding them here is fine (no secret). We configure
// BOTH concrete destinations explicitly (rather than the GT- container, which
// wasn't actually feeding this GA4 property): Google Ads for conversions +
// remarketing, and GA4 for analytics + the `generate_lead` key event that gets
// imported into Ads as the "Pedido de orçamento" conversion.
export const GOOGLE_ADS_ID = "AW-16724349653";
export const GA4_ID = "G-29CZZ76H6F";

// Consent Mode v2 bootstrap. Emitted as a PLAIN inline <script> (not
// next/script beforeInteractive) so it executes synchronously in document
// order — before the async gtag.js below — which is exactly what Consent Mode
// requires: the `default` (everything denied) must be queued before the
// library processes anything. Everything here just pushes onto dataLayer; the
// library flushes that queue in order once it loads.
//
// `page_location` é SANITIZADO antes de ir para a Google. Por omissão o gtag
// reporta `document.location.href` inteiro, e em /portal/<token> ou
// /proposta/<token> isso é o segredo do cliente (o token do portal vale 365
// dias; o da proposta autoriza ACEITAR a proposta, o que cria contrato e
// o sinal a receber). Quem tenha acesso à propriedade GA4 ou Ads — uma agência,
// um prestador, alguém que já saiu — leria tokens vivos na dimensão do caminho
// de página. Nas rotas normais o valor é rigorosamente o mesmo href de sempre,
// por isso a medição não muda em nada.
const CONSENT_BOOTSTRAP = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var g = 'denied';
try { if (localStorage.getItem('liquen-consent') === 'granted') g = 'granted'; } catch (e) {}
gtag('consent', 'default', {
  ad_storage: g,
  ad_user_data: g,
  ad_personalization: g,
  analytics_storage: g,
  wait_for_update: 500
});
var liquenLoc = location.href;
try { liquenLoc = location.href.replace(new RegExp(${JSON.stringify(TOKEN_PATH_PATTERN)}, 'g'), '/$1/${TOKEN_PLACEHOLDER}'); } catch (e) {}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}', { page_location: liquenLoc });
gtag('config', '${GA4_ID}', { page_location: liquenLoc });
`;

/** Caminho sanitizado do URL actual, para o `page_location`. */
export function safeLocationHref(href: string): string {
  return href.replace(new RegExp(TOKEN_PATH_PATTERN, "g"), `/$1/${TOKEN_PLACEHOLDER}`);
}

/**
 * Equivalente em código do CONSENT_BOOTSTRAP acima, para o caso em que o
 * script inline não chegou a correr (montagem por navegação no cliente). Tem de
 * ser código a sério e não `new Function`: em produção o `script-src` da CSP
 * não traz `'unsafe-eval'`, por isso avaliar uma string seria bloqueado.
 * Idempotente — se o `gtag` já existe, não faz nada.
 */
export function bootstrapGtag(): void {
  const w = window as unknown as {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  if (typeof w.gtag === "function") return;

  const dataLayer = (w.dataLayer = w.dataLayer || []);
  // Cópia fiel do snippet canónico: o gtag.js espera encontrar no dataLayer
  // objectos `arguments`, não arrays. Empurrar um array mudaria a forma do que
  // a biblioteca lê ao esvaziar a fila.
  function gtagImpl(this: unknown) {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }
  const gtag = gtagImpl as unknown as (...args: unknown[]) => void;
  w.gtag = gtag;

  let granted = "denied";
  try {
    if (localStorage.getItem("liquen-consent") === "granted") granted = "granted";
  } catch {
    /* armazenamento bloqueado — fica negado, que é o lado seguro */
  }
  gtag("consent", "default", {
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: granted,
    analytics_storage: granted,
    wait_for_update: 500,
  });

  const pageLocation = safeLocationHref(location.href);
  gtag("js", new Date());
  gtag("config", GOOGLE_ADS_ID, { page_location: pageLocation });
  gtag("config", GA4_ID, { page_location: pageLocation });
}

/**
 * Google tag (gtag.js) with Consent Mode v2, wired for RGPD/GDPR.
 *
 * Everything is DENIED by default (no ad/analytics cookies) until the visitor
 * explicitly accepts via <ConsentBanner>. If they accepted on a previous visit
 * the choice is restored from localStorage before the tag loads, so consent
 * persists. Under "denied", gtag still sends cookieless pings so Google can
 * model conversions — but sets no cookies, which keeps us compliant without
 * re-asking on every page. The library loads `afterInteractive` so it never
 * competes with first paint.
 *
 * NÃO é montado nas rotas com token (/portal/<token>, /proposta/<token>). E a
 * razão é precisamente aquela em que o banner de consentimento NÃO ajuda: com
 * o consentimento negado o gtag continua a mandar pings sem cookies, ou seja o
 * token sairia à mesma para a Google. A única defesa que funciona nessas rotas
 * é o tag não existir lá. As rotas com token não têm qualquer valor analítico
 * (não têm campanhas nem conversões), por isso não se perde medição nenhuma.
 */
export default function GoogleTag() {
  const pathname = usePathname();
  // O `usePathname` é imune à reescrita do proxy (/portal/x → /pt/portal/x):
  // ambas as formas contêm o segmento, logo servidor e cliente decidem o mesmo
  // e não há divergência de hidratação.
  const suppressed = isTokenRoute(pathname);

  // Um <script> inline colocado pelo React DEPOIS do carregamento inicial não é
  // executado pelo browser. Sem isto, um cliente que abrisse o seu portal e
  // depois navegasse (pelo menu, que vive no mesmo layout) para a galeria
  // ficava sem medição no resto da sessão: o tag montava mas o bootstrap nunca
  // corria. Aqui o bootstrap é reposto por código quando falta — no
  // carregamento normal o script inline já correu e isto não faz nada.
  useEffect(() => {
    if (suppressed) return;
    bootstrapGtag();
  }, [suppressed, pathname]);

  if (suppressed) return null;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP }} />
      {/* afterInteractive — the standard, reliable strategy for an analytics
          tag: loads right after the page is interactive so hits actually send.
          lazyOnload could stall on image-heavy pages and never flush the queued
          page_view / conversion (GA4 showed no data). The Consent Mode default
          above is set inline, synchronously, so consent ordering is unaffected. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
        strategy="afterInteractive"
      />
    </>
  );
}
