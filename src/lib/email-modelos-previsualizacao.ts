import "server-only";
import { ASSINATURA_NOME } from "./email-assinatura";
import { construirValores, type EntradaDosValores } from "./email-template-vars";
import { SINAL_POR_OMISSAO } from "./money";
import { getProposalByQuote } from "./proposals-store";
import { enderecoDaProposta } from "./proposta-link-curto";
import { getQuote, listQuotes } from "./quotes-store";
import type { IdiomaDoModelo } from "./email-templates-store";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PRÉ-VISUALIZAÇÃO COM DADOS A SÉRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã dos modelos mostrava sempre a mesma «Maria Silva» de exemplo. Serve
 * para ver a forma; não serve para ver o QUE ELE VAI DIZER — e é aí que os
 * modelos falham: um `{{#se evento_data}}` só se percebe com um pedido que não
 * tem data, e um «Olá ,» só aparece com o pedido em que ele aparece.
 *
 * Daqui sai o mesmo mapa de valores que o envio usa, a partir de um pedido
 * verdadeiro. É o `construirValores` — o mesmo, não um parecido: uma segunda
 * cópia divergia e o ecrã passava a mentir.
 *
 * ── QUEM ASSINA VEM DAQUI, E NÃO DO PEDIDO ────────────────────────────────
 *
 * O `remetente` é preenchido com a assinatura da casa (`ASSINATURA_NOME`), que
 * é uma constante do servidor e não tem nada que ver com o pedido que se está
 * a ver. Repare-se em como esta função lê o `quote`: em lado nenhum o nome de
 * quem pediu chega ao compartimento de quem assina.
 */

export interface PedidoParaPreVisualizar {
  id: string;
  etiqueta: string;
  idioma: IdiomaDoModelo;
  /** O que falta neste pedido — para ela escolher justamente o que quer ver. */
  semData: boolean;
}

/** Os pedidos mais recentes, para o menu da pré-visualização. */
export async function pedidosParaPreVisualizar(limite = 30): Promise<PedidoParaPreVisualizar[]> {
  const pedidos = await listQuotes();
  return pedidos
    .filter((q) => !q.archived)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    .slice(0, limite)
    .map((q) => ({
      id: q.id,
      etiqueta: [String(q.name ?? "").trim() || "(sem nome)", String(q.date ?? "").trim()]
        .filter(Boolean)
        .join(" · "),
      idioma: String(q.locale ?? "").startsWith("en") ? "en" : "pt",
      semData: !String(q.date ?? "").trim(),
    }));
}

/** Os valores REAIS de um pedido, na forma que o interpretador espera. */
export async function valoresDoPedidoReal(
  quoteId: string,
  idioma?: IdiomaDoModelo,
): Promise<{
  valores: Record<string, string>;
  idioma: IdiomaDoModelo;
  /** O endereço do CLIENTE. Devolvido só para o envio de teste o poder
   *  RECUSAR — ver a rota `email-templates/teste`. Nunca para lá escrever. */
  emailDoCliente: string;
} | null> {
  const quote = await getQuote(quoteId);
  if (!quote) return null;
  const proposta = await getProposalByQuote(quoteId).catch(() => null);
  const lingua: IdiomaDoModelo =
    idioma ?? (String(quote.locale ?? "").startsWith("en") ? "en" : "pt");

  const entrada: EntradaDosValores = {
    destinatario: {
      nomeCompleto: String(quote.name ?? ""),
      email: String(quote.email ?? ""),
    },
    evento: {
      tipo: quote.eventType ?? undefined,
      dataIso: String(quote.date ?? ""),
      local: String(quote.location ?? ""),
    },
    proposta: {
      // O total COM IVA: é o número que o cliente vê no fim da folha. O
      // `quotedPrice` (o que ela escreveu à mão) ganha ao calculado, porque é
      // o que ela decidiu cobrar.
      totalComIva: proposta?.total ?? quote.quotedPrice ?? quote.priceBreakdown?.total,
      moeda: proposta?.currency || "EUR",
      validadeIso: proposta?.validUntil ?? "",
      sinalPercentagem: SINAL_POR_OMISSAO,
      // O MESMO endereço que sairia no email a sério — curto. Mostrar aqui um
      // token de duzentos caracteres e enviar outra coisa fazia da
      // pré-visualização uma mentira precisamente sobre a linha que ela veio
      // ver.
      link: proposta ? await enderecoDaProposta(proposta.id, quoteId) : "",
      // A mensagem pessoal é escrita no momento do envio, não vive no pedido.
      // Na pré-visualização fica vazia de propósito: é assim que ela vê o que
      // o modelo faz quando não há mensagem nenhuma.
      mensagemPessoal: "",
    },
    // Quem assina. A casa, sempre — nunca `quote.name`.
    remetente: { nome: ASSINATURA_NOME },
    idioma: lingua,
  };
  return {
    valores: construirValores(entrada),
    idioma: lingua,
    emailDoCliente: String(quote.email ?? "").trim(),
  };
}
