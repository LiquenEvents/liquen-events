import type { Proposal, Quote } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O VALOR DO PEDIDO TEM DE SER O QUE SAIU NO PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso apareça propostas onde os valores não são iguais ao que
 * enviamos, quero que automaticamente se coloque no valor que foi enviado na
 * proposta».
 *
 * ── ONDE ESTÁ «O VALOR QUE FOI ENVIADO», E PORQUE É QUE NÃO SE ADIVINHA ───
 *
 * Está gravado. No momento do envio, a rota `/api/orcamento/[id]/proposta`
 * calcula o `subtotal` a partir das linhas do documento, grava-o NO REGISTO DA
 * PROPOSTA (com o `vat` e o `total`), e escreve o MESMO número no pedido:
 * `quotedPrice: subtotal`. Está lá o comentário a explicar porquê o subtotal e
 * não o total — o pedido guarda sempre sem IVA.
 *
 * Ou seja: `Proposal.subtotal` é a fotografia do que o casal recebeu, na mesma
 * base do `Quote.quotedPrice`. Não é uma reconstituição nem uma estimativa — é
 * o número que foi escrito no PDF, guardado no momento em que saiu.
 *
 * É por isso que esta comparação é segura e a do painel do lado não é: aquele
 * tem de DEDUZIR qual seria o valor certo a partir da forma da avaria; este
 * limita-se a ler dois números que deviam ser o mesmo.
 *
 * ── SÓ PROPOSTAS QUE SAÍRAM ───────────────────────────────────────────────
 *
 * Um rascunho nunca foi enviado, portanto não tem «valor enviado» nenhum, e
 * pôr o pedido a valer o de um rascunho seria inventar um envio que não houve.
 * A marca é o `sentAt` — o carimbo do envio — e não o `status`, que se pode
 * mudar à mão. É a mesma distinção que o painel dos valores inflacionados já
 * faz, e pela mesma razão.
 *
 * ── E QUANDO HÁ MAIS DO QUE UMA ──────────────────────────────────────────
 *
 * Rever e reenviar é o funcionamento normal: duas propostas para o mesmo casal.
 * Vale a ÚLTIMA que saiu, porque é a que o casal tem à frente. Desempata pelo
 * `sentAt`, e a seguir pelo `id`, para a resposta não dançar entre leituras.
 */

/** Um cêntimo de folga: dois números de dinheiro iguais podem diferir no bit. */
const FOLGA = 0.005;

export interface ValorDivergente {
  quoteId: string;
  /** Como ela reconhece o pedido. */
  nome: string;
  /** O que está no pedido agora. `null` quando o pedido não tem valor nenhum. */
  noPedido: number | null;
  /** O que saiu no PDF, sem IVA. É este que passa a valer. */
  enviado: number;
  /** Quando é que saiu. */
  quando: string;
  /** O identificador da proposta de onde vem o valor. */
  propostaId: string;
}

/** O nome dos noivos, ou de quem escreveu — a mesma composição do outro painel. */
function nomeDoPedido(q: Quote | undefined, alternativa: string): string {
  const noivos = [q?.partnerA, q?.partnerB].map((n) => (n ?? "").trim()).filter(Boolean);
  if (noivos.length === 2) return `${noivos[0]} e ${noivos[1]}`;
  return noivos[0] || (q?.name ?? "").trim() || alternativa;
}

/** A última proposta ENVIADA de cada pedido. */
export function ultimaEnviadaPorPedido(
  propostas: readonly Pick<Proposal, "id" | "quoteId" | "subtotal" | "sentAt">[],
): Map<string, Pick<Proposal, "id" | "quoteId" | "subtotal" | "sentAt">> {
  const porPedido = new Map<string, (typeof propostas)[number]>();
  for (const p of propostas) {
    if (!p.sentAt) continue;
    const atual = porPedido.get(p.quoteId);
    if (
      !atual ||
      (p.sentAt ?? "") > (atual.sentAt ?? "") ||
      ((p.sentAt ?? "") === (atual.sentAt ?? "") && p.id > atual.id)
    ) {
      porPedido.set(p.quoteId, p);
    }
  }
  return porPedido;
}

/**
 * Os pedidos cujo valor não é o que saiu no PDF.
 *
 * Devolve só os que DIVERGEM: um pedido que já concorda com a sua proposta não
 * é caso nenhum, e mostrá-lo enchia a lista de linhas onde não há nada a fazer.
 */
export function valoresDiferentesDoEnviado(
  pedidos: readonly Quote[],
  propostas: readonly Pick<Proposal, "id" | "quoteId" | "subtotal" | "sentAt" | "clientName">[],
): ValorDivergente[] {
  const porPedido = new Map(pedidos.map((q) => [q.id, q]));
  const ultimas = ultimaEnviadaPorPedido(propostas);

  const fora: ValorDivergente[] = [];
  for (const [quoteId, p] of ultimas) {
    const q = porPedido.get(quoteId);
    // Uma proposta de um pedido que já não existe não tem onde escrever.
    if (!q) continue;
    const enviado = typeof p.subtotal === "number" ? p.subtotal : null;
    // Sem valor gravado no envio não há com que comparar — e escrever zero num
    // pedido por causa de um campo em falta seria apagar dinheiro.
    if (enviado === null || !(enviado > 0)) continue;

    const noPedido = typeof q.quotedPrice === "number" ? q.quotedPrice : null;
    if (noPedido !== null && Math.abs(noPedido - enviado) <= FOLGA) continue;

    fora.push({
      quoteId,
      nome: nomeDoPedido(q, quoteId),
      noPedido,
      enviado,
      quando: p.sentAt!,
      propostaId: p.id,
    });
  }

  // O maior desvio primeiro: é por onde ela quer começar a olhar.
  return fora.sort(
    (a, b) =>
      Math.abs((b.noPedido ?? 0) - b.enviado) - Math.abs((a.noPedido ?? 0) - a.enviado) ||
      a.quoteId.localeCompare(b.quoteId),
  );
}
