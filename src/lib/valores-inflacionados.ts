import "server-only";
import type { ProposalDoc } from "./proposal-doc";
import { resolveProposalMoney } from "./proposal-doc";
import { round2 } from "./money";
import { somaDosServicos, somaDosExtrasSemIva } from "./proposal-budget";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUAIS DAS PROPOSTAS EM BASE FICARAM COM O VALOR INCHADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «o valor total muda sozinho entre visitas». Numa proposta
 * observada: 3.000 → 3.140 → 3.280 → 3.420, com uma deslocação de 140 €.
 *
 * A causa está fechada (ver `baseDoPedidoParaOEcra`, no estúdio): o «Preço
 * final» do pedido já traz os adicionais lá dentro, e era posto tal e qual no
 * campo do estúdio, que é só os SERVIÇOS. A gravação seguinte voltava a
 * somar-lhes a deslocação. Uma soma por visita.
 *
 * Falta a outra metade, e é esta: **algumas dessas propostas já foram enviadas
 * a clientes com o número errado.** Este módulo procura-as. Não corrige nada e
 * não escreve nada — a lista é para ela ver primeiro.
 *
 * ── COMO É QUE SE RECONHECE UMA, MESES DEPOIS ─────────────────────────────
 *
 * Não se reconhece pelo `quotedPrice`. Cada visita subia os DOIS números ao
 * mesmo tempo — o total escrito e o preço do pedido — e a relação entre eles
 * ficava sempre certa (`preço = escrito + adicionais`). Um retrato de hoje não
 * traz memória nenhuma dessa escalada.
 *
 * Reconhece-se pelas LINHAS. O quadro de serviços não foi tocado por nada
 * disto: continua a somar o que ela escreveu, linha a linha. Numa proposta sã,
 * o total escrito e a soma das linhas batem certo (é o que o aviso de
 * desalinhamento do estúdio já verifica). Numa proposta inchada, a diferença
 * entre os dois é **um múltiplo exacto da soma dos adicionais** — 140, 280,
 * 420 —, que é a assinatura desta avaria e de mais nada.
 *
 * ── PORQUE É QUE O MÚLTIPLO EXACTO É QUE MANDA ────────────────────────────
 *
 * Porque um total diferente da soma das linhas é uma coisa legítima e comum:
 * um desconto, um arredondamento para um número redondo, um acerto combinado
 * ao telefone. O que não é comum é essa diferença calhar, ao cêntimo, num
 * múltiplo inteiro da deslocação. Exigir o múltiplo é o que separa esta avaria
 * de uma decisão dela — e é por isso que a lista sai curta e não com metade da
 * base lá dentro.
 *
 * Mesmo assim, decide ela: cada linha mostra o que está escrito, o que a soma
 * das linhas diz, quantas somas a mais parecem lá estar, e em que número isso
 * daria. Nada aqui carrega em nada.
 */

/** Um cêntimo de folga: as somas são feitas em vírgula flutuante. */
const FOLGA = 0.011;

export interface ValorSuspeito {
  /** O id do PEDIDO — é por ele que ela abre a proposta. */
  quoteId: string;
  /** Os noivos, ou quem escreveu. Para ela reconhecer de quem se trata. */
  nome: string;
  estado: string;
  /** A proposta chegou a seguir para o cliente? Muda o que se faz a seguir. */
  enviada: boolean;
  quando: string;
  /** A soma dos adicionais sem IVA — o degrau de cada soma a mais. */
  degrau: number;
  /** O que está escrito no «Preço final» do estúdio (só serviços). */
  escrito: number;
  /** O que as linhas de serviço somam. */
  somaDasLinhas: number;
  /** Quantos degraus de diferença: 1, 2, 3… */
  somasAMais: number;
  /** O total escrito, sem elas. */
  escritoCorrigido: number;
  /** O «Preço final (sem IVA)» gravado no pedido, hoje. */
  noPedido: number | null;
  /** E o que passaria a ser. */
  noPedidoCorrigido: number;
  /** O que o cliente viu, com IVA — só faz sentido se a proposta seguiu. */
  comIva: number;
  comIvaCorrigido: number;
}

interface Entrada {
  quoteId: string;
  nome: string;
  estado: string;
  enviada: boolean;
  quando: string;
  quotedPrice: number | null;
  doc: ProposalDoc;
}

/**
 * As propostas cujo total tem a assinatura da acumulação.
 *
 * Puro: recebe o que já foi lido e não vai à base. É o que permite pô-lo à
 * prova com casos escritos à mão — incluindo os que NÃO podem aparecer na
 * lista, que é a metade que interessa.
 */
export function valoresSuspeitos(entradas: readonly Entrada[]): ValorSuspeito[] {
  const suspeitas: ValorSuspeito[] = [];

  for (const e of entradas) {
    const doc = e.doc;
    // A avaria só existe com «Somam ao valor»: é ela que faz o preço do pedido
    // e o campo do estúdio serem números diferentes. Com «Já incluídos» são o
    // mesmo número e não há nada que se possa somar duas vezes.
    if (!doc.budgetExtrasSomam) continue;

    const { mode, vatRate } = resolveProposalMoney(doc);
    const degrau = round2(somaDosExtrasSemIva(doc.budgetExtras, { mode, vatRate }));
    if (degrau <= 0) continue;

    const soma = somaDosServicos(doc);
    // Sem uma única linha com preço não há com que comparar. Dizer «suspeita»
    // sobre um documento onde não se consegue somar nada era inventar.
    if (soma === null) continue;

    const escrito = resolveProposalMoney(doc).base;
    const diferenca = round2(escrito - soma);
    if (diferenca <= FOLGA) continue;

    const passos = diferenca / degrau;
    const inteiro = Math.round(passos);
    if (inteiro < 1) continue;
    if (Math.abs(diferenca - inteiro * degrau) > FOLGA) continue;

    const escritoCorrigido = round2(escrito - inteiro * degrau);
    // Um total que ficaria em zero ou negativo não é uma correcção, é um sinal
    // de que a leitura está errada — e mais vale não a dizer do que dizê-la.
    if (escritoCorrigido <= 0) continue;

    const noPedidoCorrigido = round2(escritoCorrigido + degrau);
    suspeitas.push({
      quoteId: e.quoteId,
      nome: e.nome,
      estado: e.estado,
      enviada: e.enviada,
      quando: e.quando,
      degrau,
      escrito,
      somaDasLinhas: soma,
      somasAMais: inteiro,
      escritoCorrigido,
      noPedido: e.quotedPrice,
      noPedidoCorrigido,
      comIva: round2(round2(escrito + degrau) * (1 + vatRate)),
      comIvaCorrigido: round2(noPedidoCorrigido * (1 + vatRate)),
    });
  }

  // As enviadas primeiro, e dentro delas as que mais cresceram: é essa a ordem
  // por que se telefona a alguém.
  return suspeitas.sort(
    (a, b) =>
      Number(b.enviada) - Number(a.enviada) || b.somasAMais - a.somasAMais || b.escrito - a.escrito,
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O DETECTOR NÃO VIA — E ERA ONDE O DINHEIRO ESTAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma auditoria ao back office em produção foi ver os 15 pedidos um a um e
 * encontrou duas propostas com o preço errado. O detector devolveu «Nenhuma das
 * 7 propostas tem a assinatura desta avaria». Um falso negativo, e o pior tipo:
 * dá uma sensação de segurança sobre dinheiro que já saiu num PDF.
 *
 * Três razões, e as três estão fechadas aqui:
 *
 *  1. **`if (!doc.budgetExtrasSomam) continue`** saltava exactamente os
 *     documentos avariados. A marca EM FALTA é a avaria — ver abaixo.
 *  2. O reconhecimento só olhava para DENTRO do documento (o escrito contra a
 *     soma das linhas). O resíduo ficou noutro sítio: no `quotedPrice` do
 *     pedido, que é uma tabela diferente.
 *  3. Só examinava propostas ENVIADAS. O valor inchado vive no rascunho.
 *
 * ── A MARCA EM FALTA, QUE É A AVARIA DOS DOIS CASOS REAIS ─────────────────
 *
 * `budgetExtrasSomam` decide se a deslocação entra ou não no preço. Quando o
 * campo está ausente, o código lê-o de duas maneiras OPOSTAS:
 *
 *   · `somaDosExtrasSemIva` e o dinheiro da proposta fazem
 *     `if (!doc.budgetExtrasSomam) return 0` → ausente = **não soma**;
 *   · quem semeia o documento a partir do pedido escreve
 *     `budgetExtrasSomam ??= true` → ausente = **soma**.
 *
 * Basta a proposta passar uma vez pelo segundo caminho para a marca virar
 * `true`, e a partir daí os adicionais contam — enquanto o `quotedPrice` foi
 * gravado quando ainda não contavam.
 *
 * Medido nos dados de produção: a Mónica Teófilo tem 70,00 € de deslocação e a
 * Tara e Marty 75,00 €, as duas com a marca ausente. O que a Líquen fatura e o
 * que a cliente leu no PDF diferem em 86,10 € e 92,25 € com IVA.
 *
 * Não se escolhe por ela qual das leituras vale: mostram-se as duas, com a
 * diferença em euros, e a decisão é dela — como em todo o resto do dinheiro
 * desta casa.
 */
export interface ContaQueNaoFecha {
  quoteId: string;
  nome: string;
  estado: string;
  enviada: boolean;
  quando: string;
  /**
   * `marca-em-falta` — há adicionais escritos e o documento não diz se contam.
   * `desalinhado` — a marca é explícita, e mesmo assim o «Preço final» do
   *   pedido não é igual à base do documento mais os adicionais.
   */
  tipo: "marca-em-falta" | "desalinhado";
  /** A base do documento: só os serviços, sem IVA. */
  base: number;
  /** Os adicionais sem IVA — o que está em jogo. */
  adicionais: number;
  /** O «Preço final (sem IVA)» gravado no pedido, hoje. */
  noPedido: number | null;
  /** O que o pedido diria se os adicionais contassem. */
  seSomam: number;
  /** E se não contassem. */
  seNaoSomam: number;
  /** A diferença entre as duas leituras, com IVA — é o número que dói. */
  emJogoComIva: number;
}

/**
 * As contas que não fecham entre o DOCUMENTO e o PEDIDO.
 *
 * Pura, como a de cima, e pela mesma razão: é o que permite pô-la à prova com
 * casos escritos à mão — incluindo os que NÃO podem aparecer na lista.
 */
export function contasQueNaoFecham(entradas: readonly Entrada[]): ContaQueNaoFecha[] {
  const fora: ContaQueNaoFecha[] = [];

  for (const e of entradas) {
    const doc = e.doc;
    const { base, mode, vatRate } = resolveProposalMoney(doc);
    // Os adicionais TAL COMO ESTÃO ESCRITOS, sem perguntar à marca se contam —
    // é precisamente a marca que está em causa.
    const adicionais = round2(somaDosExtrasSemIva(doc.budgetExtras, { mode, vatRate }));
    if (adicionais <= 0) continue;
    if (!(base > 0)) continue;

    const seSomam = round2(base + adicionais);
    const seNaoSomam = round2(base);
    const emJogoComIva = round2(adicionais * (1 + vatRate));

    const comum = {
      quoteId: e.quoteId,
      nome: e.nome,
      estado: e.estado,
      enviada: e.enviada,
      quando: e.quando,
      base,
      adicionais,
      noPedido: e.quotedPrice,
      seSomam,
      seNaoSomam,
      emJogoComIva,
    };

    // 1) A marca não está escrita. É a avaria, haja ou não divergência hoje:
    //    o número vai depender de qual dos caminhos tocar no documento a
    //    seguir, e isso não é uma coisa que se deixe ao acaso com dinheiro.
    if (doc.budgetExtrasSomam === undefined) {
      fora.push({ ...comum, tipo: "marca-em-falta" });
      continue;
    }

    // 2) A marca é explícita — então o pedido TEM de bater certo com ela.
    if (e.quotedPrice == null) continue;
    const devia = doc.budgetExtrasSomam ? seSomam : seNaoSomam;
    if (Math.abs(round2(e.quotedPrice - devia)) <= FOLGA) continue;
    fora.push({ ...comum, tipo: "desalinhado" });
  }

  // As enviadas primeiro, e dentro delas as que têm mais dinheiro em jogo: é
  // essa a ordem por que se telefona a alguém.
  return fora.sort(
    (a, b) => Number(b.enviada) - Number(a.enviada) || b.emJogoComIva - a.emJogoComIva,
  );
}

export type { Entrada as EntradaParaAuditoria };
