/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TRADUÇÃO AUTOMÁTICA — A FRONTEIRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela: «nós fazemos as propostas em português, e depois o próprio
 * sistema faz uma tradução para inglês». As caixas «EN» do estúdio passam a ser
 * o DESTINO dessa tradução em vez de trabalho obrigatório — ela corrige a que
 * quiser, ou não lê nenhuma.
 *
 * ── ESTE FICHEIRO NÃO SABE QUAL É O SERVIÇO ───────────────────────────────
 *
 * E é isso que ele é. Aqui decide-se QUAIS os campos que se mandam traduzir,
 * por que ordem, o que se escreve com a resposta e — o mais importante — o que
 * se faz com uma resposta MÁ. Quem fala com o serviço é outra coisa: hoje o
 * DeepL, em `proposal-traducao-deepl.ts`, do lado do servidor. Trocar de
 * serviço um dia é escrever outro motor; nada disto muda.
 *
 * O que NUNCA se faz é um dicionário de palavras a fazer de conta que é uma
 * tradução. Uma tabela aplicada a «Decor Floral Cerimónia» produz inglês que
 * parece inglês e não é — e a diferença entre isso e uma frase portuguesa é que
 * a frase portuguesa VÊ-SE. Numa proposta de vinte mil euros, meia dúzia de
 * frases traduzidas por tabela passa despercebida a quem revê e não passa
 * despercebida a quem paga.
 *
 * ── A RESPOSTA MÁ É O PERIGO, E NÃO A AUSÊNCIA DE RESPOSTA ────────────────
 *
 * Um motor que devolva menos textos do que recebeu — por corte, por erro, por
 * um pedido que morreu a meio — desalinha o array, e a partir daí a tradução de
 * um campo fica noutro campo. É a mesma família de defeito do `budgetItemsEn` a
 * deslizar uma posição, e tem a mesma consequência: a rubrica errada traduzida
 * no PDF de um cliente que não lê a versão portuguesa e não tem como
 * desconfiar. Por isso uma resposta desalinhada é recusada POR INTEIRO — entre
 * não traduzir nada e traduzir tudo trocado, não traduzir nada é a resposta
 * óbvia.
 */

import type { ProposalDoc } from "./proposal-doc";
import { camposPorTraduzir, escreverEn } from "./proposal-doc-bilingue";

/**
 * ── A FRONTEIRA ───────────────────────────────────────────────────────────
 *
 * Dá-me estes textos portugueses, devolve-me os ingleses, PELA MESMA ORDEM e
 * NO MESMO NÚMERO.
 *
 * Uma lista e não um texto de cada vez: os campos de uma proposta são dezenas,
 * e um pedido por campo é dezenas de idas à rede — mas sobretudo porque o
 * serviço traduz melhor com o contexto todo à frente. Uma lista e não o
 * documento inteiro: quem traduz não tem nada que saber o que é um mood board,
 * e o que este módulo não lhe der não pode ser mal interpretado.
 */
export type MotorDeTraducao = (textos: string[]) => Promise<string[]>;

/**
 * ── A ROTA, E PORQUE É QUE O ESTÚDIO NÃO FALA COM O SERVIÇO ───────────────
 *
 * O motor verdadeiro (hoje o DeepL, ver `proposal-traducao-deepl.ts`) precisa
 * de uma chave, e a chave não pode chegar ao navegador. O estúdio fala com esta
 * rota; a rota fala com o serviço. A fronteira é a mesma dos dois lados — uma
 * lista de textos para dentro, uma lista de textos para fora —, e é por isso que
 * trocar de serviço um dia não toca em nada disto.
 */
export const ROTA_DE_TRADUCAO = "/api/propostas/traduzir";

/**
 * Tectos de um pedido.
 *
 * Uma proposta cheia tem umas dezenas de campos de prosa; 300 é folgado e ainda
 * assim trava um pedido feito à mão a gastar a quota do mês numa carregada. Os
 * caracteres contam porque é assim que o serviço cobra.
 */
export const MAX_TEXTOS_POR_TRADUCAO = 300;
export const MAX_CARACTERES_POR_TRADUCAO = 60_000;

/**
 * O motor do lado do ESTÚDIO: manda os textos à rota e devolve o que ela
 * responder.
 *
 * As mensagens de erro vêm do servidor já escritas em português — é o que o
 * `toast` mostra. Um `501` é o caso em que não há serviço configurado, e
 * distingue-se dos outros: não correu nada mal, falta ligar.
 */
export function motorPelaRota(buscar: typeof fetch = fetch): MotorDeTraducao {
  return async (textos: string[]): Promise<string[]> => {
    if (textos.length === 0) return [];
    const r = await buscar(ROTA_DE_TRADUCAO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textos }),
    });
    const corpo = (await r.json().catch(() => null)) as {
      textos?: unknown;
      error?: unknown;
    } | null;
    if (!r.ok) {
      const erro =
        typeof corpo?.error === "string" ? corpo.error : `o servidor respondeu ${r.status}`;
      throw new Error(erro);
    }
    const saida = corpo?.textos;
    if (!Array.isArray(saida) || saida.some((t) => typeof t !== "string")) {
      throw new Error("a resposta da tradução não veio na forma esperada");
    }
    return saida as string[];
  };
}

/**
 * A tradução automática está ligada NESTE servidor?
 *
 * Pergunta-se, não se adivinha: a chave vive do lado do servidor e o estúdio
 * não tem como a ver — nem deve. Uma falha de rede vale «não está ligada», que
 * é o lado seguro: o botão fica desligado a dizer porquê, em vez de prometer
 * uma tradução que não vai acontecer.
 */
export async function traducaoEstaLigada(buscar: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await buscar(ROTA_DE_TRADUCAO);
    if (!r.ok) return false;
    const corpo = (await r.json().catch(() => null)) as { ligada?: unknown } | null;
    return corpo?.ligada === true;
  } catch {
    return false;
  }
}

/**
 * ── O QUE NUNCA VAI À REDE ────────────────────────────────────────────────
 *
 * Um texto sem uma única PALAVRA não tem tradução nenhuma: «2.530,00 €»,
 * «12/09/2026», «15h30», «23%», «LIQ-2026-014», «a)». Mandá-lo é gastar quota
 * (são 500 000 caracteres por mês) — mas o motivo mais forte não é esse.
 *
 * O motivo mais forte está escrito no cabeçalho do dinheiro de
 * `proposal-doc-textos.ts`: «a vírgula e o ponto trocam de papel entre as duas
 * convenções — um leitor que veja "2.460,00 €" numa linha e "2,460.00 €" noutra
 * não lê duas formatações: lê dois números diferentes». Um tradutor automático
 * localiza números, e a casa já decidiu que em inglês muda o RÓTULO e não o
 * número. Um valor que passe pelo serviço volta com o risco de vir na outra
 * convenção, na mesma página do total que a factura portuguesa vai repetir.
 *
 * ── A REGRA É ESTRUTURAL, E DE PROPÓSITO ──────────────────────────────────
 *
 * «Tem ao menos duas letras seguidas fora de uma referência.» Não há aqui
 * vocabulário nenhum: uma lista de palavras a decidir isto seria a mesma tabela
 * caseira que o cabeçalho deste ficheiro proíbe, e envelhecia à primeira rubrica
 * nova. Uma data POR EXTENSO («12 de setembro de 2026») tem palavras e VAI —
 * bem: em inglês é «12 September 2026», e isso é tradução a sério.
 */
const PALAVRA = /\p{L}{2,}/u;

/**
 * Uma referência interna: maiúsculas, um travessão e algarismos —
 * «LIQ-2026-014», «PO-2026». São chaves de correlação, não são texto.
 */
const REFERENCIA = /^\p{Lu}{2,}[-–—][\p{L}\p{N}\-–—/.]*\p{N}[\p{L}\p{N}\-–—/.]*$/u;

/** Vale a pena mandar este texto ao serviço de tradução? */
export function precisaDeTraducao(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo) return false;
  for (const pedaco of limpo.split(/\s+/)) {
    if (REFERENCIA.test(pedaco)) continue;
    if (PALAVRA.test(pedaco)) return true;
  }
  return false;
}

/** O que aconteceu a uma tentativa de traduzir. */
export interface ResultadoDaTraducao {
  /** O documento com as traduções escritas — o MESMO objecto quando nada foi
   *  escrito, para não sujar as comparações por referência do estúdio. */
  doc: ProposalDoc;
  /** Quantas caixas inglesas ficaram preenchidas. */
  escritos: number;
  /** Porque é que não deu, quando não deu. Vazio quando correu bem. */
  porqueFalhou?: string;
}

/**
 * Traduz para inglês os campos que ainda não têm versão inglesa.
 *
 * O que NÃO vai ao motor, e é de propósito: os campos que já têm inglês
 * escrito. Uma tradução automática por cima de uma frase que ela reviu é
 * trabalho dela deitado fora — e o botão «Ficar em português», que escreve o
 * português na caixa inglesa, seria desfeito à primeira carregada seguinte.
 *
 * Nunca lança. Um serviço em baixo é o caso normal de uma rede, e o documento
 * tem de ficar exactamente como estava.
 */
export async function traduzirParaIngles(
  doc: ProposalDoc,
  motor: MotorDeTraducao,
): Promise<ResultadoDaTraducao> {
  const campos = camposPorTraduzir(doc);
  if (campos.length === 0) return { doc, escritos: 0 };

  // Os que vão mesmo ao serviço. Os outros — números, valores, datas, horas,
  // referências — ficam de fora (ver {@link precisaDeTraducao}) e são escritos
  // aqui abaixo tal e qual. Um documento inteiro de rubricas numéricas não gasta
  // uma única ida à rede.
  const aPedir: number[] = [];
  for (const [i, campo] of campos.entries()) if (precisaDeTraducao(campo.texto)) aPedir.push(i);

  let respostas: string[] = [];
  if (aPedir.length > 0) {
    try {
      respostas = await motor(aPedir.map((i) => campos[i].texto));
    } catch (e) {
      return {
        doc,
        escritos: 0,
        porqueFalhou: e instanceof Error ? e.message : "o serviço de tradução não respondeu",
      };
    }
  }

  // A trava. Um comprimento diferente quer dizer que não se sabe QUAL texto
  // corresponde a QUAL campo — e escrever à mesma era pôr a tradução de um
  // campo noutro, em silêncio. A conta é contra o que foi PEDIDO, que é o que o
  // motor viu.
  if (!Array.isArray(respostas) || respostas.length !== aPedir.length) {
    return {
      doc,
      escritos: 0,
      porqueFalhou: `a tradução veio desalinhada (${
        Array.isArray(respostas) ? respostas.length : 0
      } textos para ${aPedir.length} campos)`,
    };
  }

  let saida = doc;
  let escritos = 0;
  let proximo = 0;
  for (const [i, campo] of campos.entries()) {
    let texto: string;
    if (aPedir[proximo] === i) {
      texto = typeof respostas[proximo] === "string" ? respostas[proximo].trim() : "";
      proximo++;
    } else {
      // Não foi pedido porque não há nada a traduzir. Escrever o português na
      // caixa inglesa é exactamente o que o botão «Ficar em português» faz, e
      // deixa o campo DECIDIDO em vez de por traduzir para sempre — um aviso
      // sempre aceso é um aviso que se aprende a ignorar.
      texto = campo.texto;
    }
    // Uma posição vazia fica por traduzir. Não é um buraco: no papel esse campo
    // cai para o português, e no ecrã continua a contar como falta — que é
    // exactamente o que é.
    if (!texto) continue;
    saida = escreverEn(saida, campo.campo, texto);
    escritos++;
  }
  return { doc: saida, escritos };
}
