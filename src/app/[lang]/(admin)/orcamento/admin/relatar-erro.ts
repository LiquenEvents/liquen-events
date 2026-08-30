/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONTAR UM ERRO DO BROWSER A QUEM O POSSA LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã de erro do back office já existe e já diz à equipa o que fazer. O que
 * faltava era a outra metade: **eu ficar a saber**. O `log.error` do lado do
 * browser morre na consola do telemóvel, porque o transporte para fora está
 * preso a uma variável de ambiente sem `NEXT_PUBLIC_`.
 *
 * Isto manda o erro para uma rota nossa, que o escreve no registo da casa
 * passando pela redacção do RGPD que já existe. Ver
 * `api/admin/erro-do-cliente/route.ts` para o porquê de não ser um serviço
 * externo.
 *
 * ── O QUE ESTA FUNÇÃO NUNCA FAZ ───────────────────────────────────────────
 *
 * NÃO LANÇA. É chamada de dentro de um ecrã que já está a tratar de um erro; um
 * erro aqui seria o segundo, em cima do primeiro, e sem ninguém para o apanhar.
 *
 * NÃO ESPERA. Quem a chama não tem nada a fazer com a resposta, e prender o
 * desenho do ecrã de erro a uma ida à rede seria fazer a pessoa esperar por uma
 * coisa que é para MIM, não para ela.
 *
 * NÃO LEVA O ESTADO DA PÁGINA. Um formulário de proposta a meio tem lá dentro o
 * nome e o email de um casal. Vai a mensagem, o rasto, a marca e o endereço —
 * e mais nada.
 */

/** Onde o relato aterra. */
const ROTA = "/api/admin/erro-do-cliente";

/** Tectos deste lado também: cortar aqui poupa a viagem, e a rota volta a cortar. */
const MAX_MENSAGEM = 300;
const MAX_RASTO = 2000;

export function relatarErro(erro: unknown, marca?: string): void {
  try {
    const e = erro as { message?: unknown; stack?: unknown } | null;
    const mensagem =
      typeof e?.message === "string" && e.message.trim()
        ? e.message.slice(0, MAX_MENSAGEM)
        : String(erro).slice(0, MAX_MENSAGEM);
    const rasto = typeof e?.stack === "string" ? e.stack.slice(0, MAX_RASTO) : undefined;

    const corpo = JSON.stringify({
      mensagem,
      rasto,
      marca,
      // O caminho, sem a query: um `?token=…` num endereço do back office não
      // tem que viajar, e o `logger` redigi-lo-ia à chegada de qualquer forma.
      onde: typeof location !== "undefined" ? location.pathname : undefined,
      aparelho: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });

    /**
     * `sendBeacon` primeiro, e é o que faz isto valer a pena: um erro que deita
     * a página abaixo costuma ser seguido de um recarregamento, e um `fetch`
     * normal morre com a página. O beacon é entregue pelo browser depois de a
     * página se ir embora — que é exactamente o caso que se quer apanhar.
     *
     * O `fetch` fica como alternativa para quando não há beacon, com
     * `keepalive` pela mesma razão.
     */
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const enviou = navigator.sendBeacon(ROTA, new Blob([corpo], { type: "application/json" }));
      if (enviou) return;
    }
    void fetch(ROTA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => {
      /* sem rede: o erro perde-se, e perder o RELATO é melhor do que rebentar
         em cima de quem já está a ver um ecrã de erro */
    });
  } catch {
    /* Ver o cabeçalho: isto nunca pode ser o segundo erro. */
  }
}
