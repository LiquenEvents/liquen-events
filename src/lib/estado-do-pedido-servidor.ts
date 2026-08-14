import "server-only";
import type { QuoteStatus } from "@/lib/orcamento/types";
import { transicaoDoPedido, type AcontecimentoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { updateQuoteWith } from "@/lib/quotes-store";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LEVAR A TRANSIÇÃO AO PEDIDO — SEM NUNCA PODER DERRUBAR QUEM CHAMOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A decisão vive em `@/lib/orcamento/estado-do-pedido` e é pura. Isto é o
 * braço que a executa: lê o pedido, aplica a regra, grava o estado novo e a
 * linha do histórico.
 *
 * ── PORQUE É QUE ISTO NUNCA ATIRA ─────────────────────────────────────────
 *
 * Quem chama já fez a coisa a sério: a proposta seguiu por email, o pagamento
 * ficou registado, o contrato está guardado. Deixar um erro subir daqui
 * transformava um trabalho FEITO numa mensagem de falha — e quem a lê tenta
 * outra vez, e a segunda tentativa bate nas guardas de duplicação. Ficava com o
 * ecrã a dizer ao mesmo tempo que falhou e que já existe, quando o que falhou
 * foi só a cor de uma coluna.
 *
 * Por isso: melhor esforço, tudo apanhado, e um registo de erro para não se
 * perder em silêncio. O estado errado corrige-se com um arrasto no quadro; um
 * email enviado que a aplicação diz não ter enviado, não.
 *
 * ── PORQUE É QUE É `updateQuoteWith` E NÃO `updateQuote` ──────────────────
 *
 * A decisão depende do estado ACTUAL, e estas rotas são lentas — a do envio da
 * proposta desenha um PDF de uma dúzia de páginas e manda um email pelo meio.
 * Entre o `getQuote` do princípio e este momento, o pedido pode ter mudado (ela
 * arrastou-o no quadro noutro separador). Ler aqui dentro, sobre o registo
 * fresco e com a repetição optimista do repositório, é o que garante que a
 * regra do não-recuo é avaliada contra o que está gravado — e que a linha nova
 * do histórico não apaga a que outra ferramenta escreveu entretanto.
 */

/** O mesmo tecto que o PATCH do pedido aplica ao histórico. */
const MAX_HISTORICO = 5000;

/**
 * Regista um acontecimento no pedido e sobe-lhe o estado, se for caso disso.
 *
 * Devolve o estado NOVO quando houve mudança, e `null` quando não houve —
 * porque a regra não a justificava (o pedido já estava lá ou mais à frente,
 * ou está `rejeitado`), ou porque a gravação falhou. Quem chama não é obrigado
 * a olhar para o valor: a acção principal não depende dele.
 */
export async function registarAcontecimento(
  quoteId: string | undefined | null,
  acontecimento: AcontecimentoDoPedido,
  detalhe?: string,
): Promise<QuoteStatus | null> {
  // Há acontecimentos sem pedido associado. Não há coluna nenhuma para mexer —
  // e não é um erro.
  if (!quoteId) return null;

  const resultado: { estado: QuoteStatus | null } = { estado: null };
  try {
    await updateQuoteWith(quoteId, (quote) => {
      const transicao = transicaoDoPedido({
        acontecimento,
        estadoActual: quote.status,
        detalhe,
      });
      // Devolver o pedido INTACTO é o caminho normal e tem de ser barato: a
      // maioria dos acontecimentos cai num pedido que já está à frente deles.
      if (!transicao) return quote;
      resultado.estado = transicao.status;
      return {
        ...quote,
        status: transicao.status,
        activityLog: [...(quote.activityLog ?? []), transicao.entrada].slice(-MAX_HISTORICO),
      };
    });
  } catch (e) {
    log.error("estado do pedido: transição automática falhou", e, { id: quoteId, acontecimento });
    return null;
  }
  return resultado.estado;
}
