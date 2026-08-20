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
import { camposPorRever, escreverEn } from "./proposal-doc-bilingue";
import { lerCampo, type CampoDeTexto } from "./proposal-ortografia";

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
 * Os lotes de um pedido, PELA ORDEM.
 *
 * Vive aqui e não em cada motor porque há dois tectos a respeitar no mesmo
 * caminho — o desta rota e o do serviço lá ao fundo (ver
 * `MAX_TEXTOS_POR_PEDIDO` em `proposal-traducao-deepl.ts`) — e dois
 * partidores acabariam por discordar num deles. A regra é a mesma nos dois
 * sítios e escreve-se uma vez.
 *
 * Um texto sozinho maior do que o tecto vai à mesma, sozinho: cortá-lo era
 * devolver meia frase e deixá-lo de fora era devolver menos textos do que os
 * pedidos — o desalinhamento, que é o defeito que toda a gente aqui evita.
 */
export function emLotes(textos: string[], maxTextos: number, maxCaracteres: number): string[][] {
  const lotes: string[][] = [];
  let lote: string[] = [];
  let caracteres = 0;
  for (const texto of textos) {
    const cabe = lote.length < maxTextos && caracteres + texto.length <= maxCaracteres;
    if (lote.length > 0 && !cabe) {
      lotes.push(lote);
      lote = [];
      caracteres = 0;
    }
    lote.push(texto);
    caracteres += texto.length;
  }
  if (lote.length > 0) lotes.push(lote);
  return lotes;
}

/**
 * O motor do lado do ESTÚDIO: manda os textos à rota e devolve o que ela
 * responder.
 *
 * As mensagens de erro vêm do servidor já escritas em português — é o que o
 * `toast` mostra. Um `501` é o caso em que não há serviço configurado, e
 * distingue-se dos outros: não correu nada mal, falta ligar.
 *
 * ── E VAI EM LOTES, PORQUE A ROTA TEM TECTOS ──────────────────────────────
 *
 * A rota recusa (413) um pedido com mais de {@link MAX_TEXTOS_POR_TRADUCAO}
 * textos. O comentário lá diz que «a contagem é a mesma que o estúdio já
 * respeita» — e não respeitava: mandava os campos todos num pedido só.
 *
 * A margem não era teórica. Medida numa proposta pesada mas plausível — 8
 * grupos de 8 rubricas com descrição, 12 mood boards, 40 linhas de orçamento —
 * dá 218 campos para um tecto de 300. O sintoma seria o pior de todos para
 * diagnosticar: dá em todas as propostas dela menos nas maiores, e nessas dá
 * «Não deu para traduzir» sem nada que ligue a causa ao tamanho.
 *
 * Um lote que falhe volta VAZIO nas suas posições, exactamente como no motor
 * do DeepL e pela mesma razão: o que já veio foi PAGO, e deitá-lo fora porque
 * o pedido seguinte apanhou um 429 era pagá-lo outra vez. A fronteira sabe ler
 * uma posição vazia (fica por traduzir) e a contagem `naoVieram` di-lo no ecrã.
 * Se NENHUM lote passar, atira-se — o painel precisa da frase.
 */
export function motorPelaRota(buscar: typeof fetch = fetch): MotorDeTraducao {
  async function pedirUmLote(lote: string[]): Promise<string[]> {
    const r = await buscar(ROTA_DE_TRADUCAO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textos: lote }),
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
    // A trava de sempre, agora por lote: um lote a que faltem textos desalinha
    // tudo o que vem a seguir. Recusá-lo não contamina os outros.
    if (saida.length !== lote.length) {
      throw new Error(
        `a tradução veio desalinhada (${saida.length} textos para ${lote.length} campos)`,
      );
    }
    return saida as string[];
  }

  return async (textos: string[]): Promise<string[]> => {
    if (textos.length === 0) return [];
    const lotes = emLotes(textos, MAX_TEXTOS_POR_TRADUCAO, MAX_CARACTERES_POR_TRADUCAO);
    // O caminho de quase todas as propostas: um lote só, um pedido só, e o erro
    // sobe tal e qual como subia antes de haver lotes nenhuns.
    if (lotes.length === 1) return pedirUmLote(lotes[0]);

    const saida = new Array<string>(textos.length).fill("");
    let posicao = 0;
    let algumPassou = false;
    let primeiroErro: unknown = null;
    for (const lote of lotes) {
      const inicio = posicao;
      posicao += lote.length;
      try {
        const traduzidos = await pedirUmLote(lote);
        for (const [i, t] of traduzidos.entries()) saida[inicio + i] = t;
        algumPassou = true;
      } catch (e) {
        primeiroErro ??= e;
      }
    }
    if (!algumPassou && primeiroErro) throw primeiroErro;
    return saida;
  };
}

/**
 * O que se sabe sobre a tradução automática deste servidor.
 *
 *  · `"ligada"`      — há serviço configurado; o botão trabalha.
 *  · `"desligada"`   — o servidor RESPONDEU e disse que não tem chave.
 *  · `"indisponivel"` — não se conseguiu perguntar: rede em baixo, sessão
 *                       caducada, um 500, uma resposta com outra forma.
 */
export type EstadoDaTraducao = "ligada" | "desligada" | "indisponivel";

/**
 * A tradução automática está ligada NESTE servidor?
 *
 * Pergunta-se, não se adivinha: a chave vive do lado do servidor e o estúdio
 * não tem como a ver — nem deve.
 *
 * ── PORQUE É QUE ISTO NÃO DEVOLVE UM `boolean` ────────────────────────────
 *
 * Devolvia. Uma falha de rede, uma sessão caducada e um 500 valiam todos
 * `false`, que desligava o botão — o lado seguro, e isso continua igual: os
 * três desligam-no na mesma. O que estava errado era a FRASE que ficava por
 * baixo, e que só tem uma versão quando o estado só tem dois valores: «a
 * tradução automática ainda não está ligada neste servidor».
 *
 * Essa frase é uma afirmação sobre a CONFIGURAÇÃO. Quem a lê vai pôr a chave
 * na Vercel, ou desiste e escreve as caixas inglesas à mão. Dita sobre uma
 * sessão que caducou, manda-a resolver um problema que não existe — e o
 * verdadeiro cura-se recarregando a página.
 *
 * Só a resposta EXPLÍCITA do servidor («não tenho chave») vale `"desligada"`.
 * Tudo o resto é `"indisponivel"`: não é um «não», é um «não sei».
 */
export async function estadoDaTraducao(buscar: typeof fetch = fetch): Promise<EstadoDaTraducao> {
  try {
    const r = await buscar(ROTA_DE_TRADUCAO);
    if (!r.ok) return "indisponivel";
    const corpo = (await r.json().catch(() => null)) as { ligada?: unknown } | null;
    if (corpo?.ligada === true) return "ligada";
    if (corpo?.ligada === false) return "desligada";
    // Nem `true` nem `false`: um apanha-tudo de API, um portal cativo, um
    // corpo que não é o nosso. Não se lê como um «não».
    return "indisponivel";
  } catch {
    return "indisponivel";
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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GLOSSÁRIO DA CASA — as palavras que têm uma tradução e uma só
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «termos fixos com tradução única e verificada: "Seating Plan",
 * "Mood board", nomes de serviço recorrentes».
 *
 * ── PORQUE É QUE ISTO EXISTE E NÃO SE DEIXA AO MOTOR ────────────────────
 *
 * Porque um motor de tradução é bom a frases e é imprevisível a RÓTULOS. Estas
 * são duas ou três palavras sem verbo, e a mesma entrada traduzida em duas
 * propostas diferentes pode voltar diferente — «Decoração Cerimónia» tanto dá
 * «Ceremony Decoration» como «Ceremony Decor», e a segunda proposta parece
 * escrita por outra pessoa. Pior: «Seating Plan» já É inglês, e mandá-lo
 * traduzir devolve-o traduzido.
 *
 * ── E É UMA IGUALDADE, NÃO UMA SUBSTITUIÇÃO DENTRO DA FRASE ─────────────
 *
 * O campo INTEIRO tem de ser o termo. Trocar palavras dentro de uma frase era
 * fazer tradução automática à mão, com os erros que ela tem e sem nenhuma das
 * defesas dela: «a decoração da cerimónia decorre no jardim» não se resolve
 * palavra a palavra. Rótulos são campos inteiros — é assim que a Líquen os
 * escreve —, e é esse o caso que isto cobre.
 *
 * ── E PORQUE É QUE ESTA LISTA É PARA ELA CORRIGIR ───────────────────────
 *
 * Porque a tradução «verificada» de um serviço é uma decisão do negócio e não
 * do dicionário. Estão aqui as que se leem nas propostas da casa; se alguma
 * não for a palavra que ela usa com os clientes ingleses, o sítio de a mudar é
 * este, e muda em todas as propostas de uma vez.
 */
const GLOSSARIO: ReadonlyArray<readonly [pt: string, en: string]> = [
  // Os que já são ingleses, e que o motor devolvia traduzidos.
  ["seating plan", "Seating Plan"],
  ["mood board", "Mood board"],
  ["welcome drink", "Welcome Drink"],
  ["save the date", "Save the Date"],
  ["cocktail", "Cocktail"],
  // As rubricas que se repetem proposta após proposta.
  ["cerimónia", "Ceremony"],
  ["jantar", "Dinner"],
  ["corredor", "Aisle"],
  ["plano de mesas", "Seating Plan"],
  ["decoração cerimónia", "Ceremony Decoration"],
  ["decoração jantar", "Dinner Decoration"],
  ["decoração cocktail", "Cocktail Decoration"],
  ["arco floral", "Floral Arch"],
  ["ramo de noiva", "Bridal Bouquet"],
  ["lapelas", "Boutonnières"],
  ["complementos dos noivos", "Couple's Details"],
  ["mesa dos noivos", "Couple's Table"],
  ["mesa do bolo", "Cake Table"],
  ["centros de mesa", "Centrepieces"],
  ["montagem e desmontagem", "Set-up and Take-down"],
];

/** Sem acentos, sem maiúsculas, sem espaços a mais — a chave de comparação. */
const chaveDoTermo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const POR_TERMO: ReadonlyMap<string, string> = new Map(
  GLOSSARIO.map(([pt, en]) => [chaveDoTermo(pt), en]),
);

/**
 * A tradução da casa para este campo, quando ele é EXACTAMENTE um termo do
 * glossário. Nada, quando não é — e aí segue o caminho normal.
 */
export function doGlossario(texto: string): string | undefined {
  return POR_TERMO.get(chaveDoTermo(texto));
}

export function precisaDeTraducao(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo) return false;
  for (const pedaco of limpo.split(/\s+/)) {
    if (REFERENCIA.test(pedaco)) continue;
    if (PALAVRA.test(pedaco)) return true;
  }
  return false;
}

/**
 * ── UMA TRADUÇÃO À ESPERA DE SER ESCRITA ──────────────────────────────────
 *
 * Uma caixa inglesa a preencher: QUAL campo, o que se lá escreve, e — o que
 * interessa — o PORTUGUÊS a partir do qual ela foi traduzida.
 *
 * O português viaja junto porque o campo é POSICIONAL (`boardTitulo:0`,
 * `itemRotulo:1:2`) e a tradução é uma ida à rede que demora segundos. Nesses
 * segundos ela continua a trabalhar: arrasta um mood board, apaga um grupo,
 * acrescenta uma linha. Quando a resposta volta, `boardTitulo:0` pode já ser
 * OUTRO board — e escrever ali a tradução do primeiro era pôr a frase inglesa
 * na página errada, em silêncio, num documento a caminho de um cliente.
 *
 * É o mesmo perigo que o cabeçalho dos campos `…En` de `proposal-doc.ts`
 * descreve para um mapa lateral com chaves posicionais. A diferença é que aqui
 * a chave só existe durante a ida à rede — e o português é a prova de que ela
 * ainda aponta ao mesmo sítio quando se volta.
 */
export interface TraducaoEscrita {
  /** Qual o campo. Posicional, e por isso acompanhado do {@link pt}. */
  campo: CampoDeTexto;
  /** O texto português que foi mandado traduzir, sem espaços à volta. */
  pt: string;
  /** O inglês a escrever na caixa «EN» deste campo. */
  en: string;
}

/** O que aconteceu a uma tentativa de traduzir. */
export interface ResultadoDaTraducao {
  /**
   * O documento com as traduções escritas — o MESMO objecto quando nada foi
   * escrito, para não sujar as comparações por referência do estúdio.
   *
   * ATENÇÃO a quem o consome depois de um `await`: este documento nasceu do que
   * existia no instante em que a tradução foi PEDIDA. Pô-lo de volta no estado
   * deita fora tudo o que tiver acontecido entretanto — que é exactamente o que
   * fazia desaparecer as fotos de quem continuava a montar o mood board
   * enquanto traduzia. Quem tem um documento vivo à mão usa {@link escritas} e
   * {@link aplicarTraducao}, não isto.
   */
  doc: ProposalDoc;
  /** Quantas caixas inglesas ficaram preenchidas. */
  escritos: number;
  /**
   * As traduções, uma a uma, para poderem ser aplicadas ao documento COMO ELE
   * ESTIVER na altura de as escrever. Ver {@link aplicarTraducao}.
   */
  escritas: TraducaoEscrita[];
  /**
   * ── OS QUE FORAM PEDIDOS AO SERVIÇO E NÃO VOLTARAM ──────────────────────
   *
   * Não é `porqueFalhou` (esse é «não deu NADA»), nem são os campos que ela
   * decidiu deixar em português (esses foram escritos). É uma terceira coisa, e
   * a mais fácil de calar: o motor manda os textos em LOTES, e um lote que
   * falhe volta VAZIO nas suas posições em vez de deitar fora os que já vieram.
   * Só atira quando NENHUM lote passa.
   *
   * Consequência, sem este número: numa proposta grande, um 429 ou uma quota
   * que acaba no segundo lote devolvia os primeiros 50 campos traduzidos e os
   * outros 70 vazios, com o ecrã a dizer «50 campos traduzidos», a verde. Do
   * lado dela lê-se como «não está a dar» — dá numa proposta pequena e não dá
   * numa grande, e o número que aparece está certo: o que falta é a outra
   * metade da frase.
   */
  naoVieram: number;
  /** Porque é que não deu, quando não deu. Vazio quando correu bem. */
  porqueFalhou?: string;
}

/** O que aconteceu ao escrever as traduções num documento. */
export interface AplicacaoDaTraducao<T> {
  /** O documento com as traduções escritas — o MESMO objecto quando nenhuma o
   *  foi, pela mesma razão de sempre. */
  doc: T;
  /** Quantas foram mesmo escritas. */
  escritos: number;
  /** As que NÃO foram, porque o campo já não é o que era. Não é um erro: é o
   *  campo a continuar por traduzir, que é o que ele passou a ser. */
  ignorados: TraducaoEscrita[];
}

/**
 * Escreve as traduções no documento COMO ELE ESTÁ AGORA.
 *
 * Campo a campo, e só quando o português ainda é O MESMO que foi mandado
 * traduzir. Um campo que tenha mudado de sítio (um board arrastado, um grupo
 * apagado) ou de texto durante a ida à rede não recebe nada — fica por
 * traduzir, e é isso que o contador e o painel «Por traduzir» já dizem.
 *
 * ── PORQUE É QUE NÃO SE VERIFICA E PRONTO, ESCREVENDO O DOCUMENTO INTEIRO ──
 *
 * Porque o documento tem mais coisas do que prosa. Tem as fotografias dos mood
 * boards, e as fotografias mexem-se enquanto se espera: ela carrega quatro
 * fotos, tira uma, arruma a grelha por cor. Repor o documento de há dez
 * segundos apaga tudo isso e a gravação automática grava logo a seguir a
 * versão amputada — no `localStorage` e no servidor. Uma foto trocada numa
 * proposta de casamento é pior do que uma frase mal traduzida.
 *
 * É a mesma disciplina que a cópia de fotos de um modelo parcial já segue no
 * estúdio, escrita lá: «a troca é feita no documento INTEIRO e por caminho: se
 * ela já tiver mexido no bloco entretanto (arrastado, removido uma foto), a
 * troca acompanha na mesma em vez de escrever por cima do que ela fez».
 */
export function aplicarTraducao<T extends Partial<ProposalDoc>>(
  doc: T,
  escritas: readonly TraducaoEscrita[],
): AplicacaoDaTraducao<T> {
  let saida = doc;
  let escritos = 0;
  const ignorados: TraducaoEscrita[] = [];
  for (const e of escritas) {
    // A prova. Não é o índice que identifica o campo — é o texto que lá está.
    if ((lerCampo(saida, e.campo) ?? "").trim() !== e.pt) {
      ignorados.push(e);
      continue;
    }
    saida = escreverEn(saida, e.campo, e.en);
    escritos++;
  }
  return { doc: saida, escritos, ignorados };
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
  /**
   * Os vazios E os que ficaram para trás.
   *
   * Palavras dela: «o botão de traduzir deve preencher apenas os campos vazios
   * ou desatualizados, sem reescrever o que já foi revisto à mão». É
   * exactamente o que isto faz — e o «sem reescrever o que já foi revisto» é
   * uma consequência e não uma segunda regra: um campo que ela reviu deixa de
   * estar desactualizado no instante em que carrega em «já está bem assim»
   * (ver `confirmarTraducao`), e a partir daí não volta a esta lista.
   *
   * O que este ficheiro dizia antes — «o que NÃO vai ao motor são os campos que
   * já têm inglês escrito» — passou a ser demasiado largo: um inglês escrito
   * contra um português que ENTRETANTO MUDOU não é trabalho dela a proteger, é
   * o defeito que ela apanhou («Reunião Inicial» com «Ceremony Decor»).
   */
  const campos = camposPorRever(doc);
  if (campos.length === 0) return { doc, escritos: 0, escritas: [], naoVieram: 0 };

  // Os que vão mesmo ao serviço. Os outros — números, valores, datas, horas,
  // referências — ficam de fora (ver {@link precisaDeTraducao}) e são escritos
  // aqui abaixo tal e qual. Um documento inteiro de rubricas numéricas não gasta
  // uma única ida à rede.
  const aPedir: number[] = [];
  for (const [i, campo] of campos.entries()) {
    // O glossário primeiro: o que ele sabe não vai ao serviço, e volta sempre
    // igual. Ver `doGlossario` para a razão longa.
    if (doGlossario(campo.texto)) continue;
    if (precisaDeTraducao(campo.texto)) aPedir.push(i);
  }

  let respostas: string[] = [];
  if (aPedir.length > 0) {
    try {
      respostas = await motor(aPedir.map((i) => campos[i].texto));
    } catch (e) {
      return {
        doc,
        escritos: 0,
        escritas: [],
        naoVieram: 0,
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
      escritas: [],
      naoVieram: 0,
      porqueFalhou: `a tradução veio desalinhada (${
        Array.isArray(respostas) ? respostas.length : 0
      } textos para ${aPedir.length} campos)`,
    };
  }

  let saida = doc;
  const escritas: TraducaoEscrita[] = [];
  let proximo = 0;
  // Pedidos ao serviço que voltaram em branco. Ver {@link ResultadoDaTraducao}
  // para o que isto vale, e porque é que não pode ficar por dizer.
  let naoVieram = 0;
  for (const [i, campo] of campos.entries()) {
    let texto: string;
    let foiPedido = false;
    if (aPedir[proximo] === i) {
      texto = typeof respostas[proximo] === "string" ? respostas[proximo].trim() : "";
      proximo++;
      foiPedido = true;
    } else {
      // O glossário sabe este, e o que ele diz vale mais do que o motor: é a
      // tradução da casa, escrita à mão e igual em todas as propostas.
      //
      // Não foi pedido, e não foi por não haver nada a traduzir: foi por já se
      // saber a resposta.
      texto =
        doGlossario(campo.texto) ??
        // Não foi pedido porque não há nada a traduzir. Escrever o português na
        // caixa inglesa é exactamente o que o botão «Ficar em português» faz, e
        // deixa o campo DECIDIDO em vez de por traduzir para sempre — um aviso
        // sempre aceso é um aviso que se aprende a ignorar.
        campo.texto;
    }
    // Uma posição vazia fica por traduzir. Não é um buraco: no papel esse campo
    // cai para o português, e no ecrã continua a contar como falta — que é
    // exactamente o que é.
    if (!texto) {
      if (foiPedido) naoVieram++;
      continue;
    }
    // O par (campo, português) fica guardado ao lado da tradução: é com ele que
    // quem tem um documento VIVO à mão a consegue escrever sem deitar fora o
    // que se fez entretanto. Ver {@link aplicarTraducao}.
    escritas.push({ campo: campo.campo, pt: campo.texto, en: texto });
    saida = escreverEn(saida, campo.campo, texto);
  }
  return { doc: saida, escritos: escritas.length, escritas, naoVieram };
}
