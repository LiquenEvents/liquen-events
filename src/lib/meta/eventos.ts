/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS EVENTOS DA META, E A DEDUPLICAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cada acção que interessa é enviada DUAS VEZES: uma pelo pixel, no browser,
 * outra pela Conversions API, do servidor. Não é redundância desperdiçada — é
 * a única forma de a medição sobreviver ao iOS, aos bloqueadores e à perda de
 * cookies. O envio do servidor não passa por nenhum deles.
 *
 * ── A DEDUPLICAÇÃO, QUE É ONDE ISTO SE ESTRAGA ─────────────────────────────
 * Se os dois envios não forem reconhecidos como o MESMO acontecimento, todas
 * as conversões passam a contar a dobrar. Uma conta que conta a dobrar liga
 * mal: o custo por resultado aparece a metade, o algoritmo pensa que a
 * campanha rende o dobro do que rende, e o orçamento vai para onde não deve.
 *
 * A Meta faz a deduplicação por **`event_name` + `event_id`, e mais nada**. O
 * email, o telefone, o `fbp` e o `fbc` NÃO entram nesta conta — servem para
 * ligar o acontecimento a uma pessoa, que é outro problema.
 *
 * Portanto a regra, e é simples:
 *
 *     O `event_id` é gerado UMA VEZ, no browser, no instante da acção,
 *     e o MESMO valor vai no pixel e no pedido ao nosso servidor.
 *
 * O servidor NUNCA inventa um `event_id` para um evento que também é do
 * browser. Se o inventasse, os dois nunca se encontrariam. A única excepção
 * são os eventos que só existem no servidor (o casamento que fecha), e esses
 * não têm par nenhum para duplicar.
 *
 * A janela de deduplicação da Meta é de 48 horas a contar do primeiro dos dois
 * eventos. O nosso servidor responde em segundos, portanto nunca é apertado —
 * excepto no evento de fecho, que é gerado só do lado do servidor e por isso
 * não depende disto.
 */

/**
 * Os eventos que esta operação envia. São nomes PADRÃO da Meta (à excepção
 * dos que estão assinalados): usar os padrão é o que permite optimizar
 * campanhas para eles sem configuração extra na conta.
 */
export const EVENTOS = {
  /** Abriu a página. */
  pageView: "PageView",
  /** Chegou a ver o portefólio — sinal de interesse a sério, não de ressalto. */
  viewContent: "ViewContent",
  /** Tocou no formulário (começou a preencher). */
  initiateCheckout: "InitiateCheckout",
  /** Submeteu o pedido de orçamento. É a conversão de optimização. */
  lead: "Lead",
  /** Tocou no WhatsApp ou no telefone. */
  contact: "Contact",
  /**
   * O casamento fechou. Enviado SÓ do servidor, com o valor real do contrato.
   * É o equivalente das conversões offline do Google e é o que faz a Meta
   * licitar para casamentos fechados em vez de para formulários preenchidos.
   */
  purchase: "Purchase",
} as const;

export type NomeEvento = (typeof EVENTOS)[keyof typeof EVENTOS];

/** Todos os nomes, para validação de entrada na rota da API. */
export const NOMES_VALIDOS: readonly string[] = Object.values(EVENTOS);

/**
 * Um identificador de acontecimento novo.
 *
 * `crypto.randomUUID` quando existe (todos os browsers correntes e o Node do
 * servidor); caso contrário, 16 bytes aleatórios em hexadecimal. Nunca
 * `Math.random` sozinho: dois visitantes com o mesmo `event_id` no mesmo
 * evento fariam a Meta descartar um deles como duplicado, e a conversão
 * desaparecia sem deixar rasto.
 */
export function novoEventId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  // Sem `crypto` de todo. Só acontece em ambientes muito antigos; vale mais um
  // identificador fraco do que evento nenhum, e a colisão continua improvável.
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** O `event_id` tem de ser uma cadeia curta e imprimível. */
export const EVENT_ID_VALIDO = /^[A-Za-z0-9_-]{8,64}$/;
