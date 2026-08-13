/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GEOMETRIA DA PROPOSTA — onde cada fotografia é desenhada
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas funções não desenham nada: dizem apenas ONDE, e com que tamanho, cada
 * fotografia vai ser posta na página. Vivem num módulo próprio, sem
 * `server-only`, porque há TRÊS sítios que precisam da mesma resposta:
 *
 *   · o gerador do PDF (`proposal-doc-pdf.ts`), que desenha;
 *   · o resolvedor (`proposal-doc-render.ts`), que precisa de saber o tamanho
 *     da caixa ANTES de descarregar seja o que for — é isso que lhe permite
 *     pedir a miniatura de 400 px para uma célula de 266 px em vez do original
 *     de 2200 px e 576 KB;
 *   · e o ESTÚDIO, no browser, que tem de lhe mostrar a foto com a forma que a
 *     foto vai ter no documento.
 *
 * Este terceiro é novo, e é o que obrigou a separar o módulo. O estúdio
 * pré-visualizava as capas em 4:3 e as células dos mood boards em quadrado — e
 * o PDF não desenha nenhuma foto em 4:3 nem nenhuma em quadrado. As capas são
 * tiras altíssimas (0,47:1) e as células do collage mudam de forma consoante o
 * número de fotos do board. Ela escolhia uma foto por aquilo que via, e recebia
 * outra coisa: a mesma fotografia, cortada noutro sítio.
 *
 * Ter a geometria em DOIS sítios seria pior do que não a ter: divergiriam, e o
 * sintoma seria uma fotografia mal cortada numa proposta, meses depois, sem
 * ninguém perceber porquê. Por isso é uma função só, e é esta que os três usam.
 */

// ── A4 ao baixo (paisagem), em pontos PDF ──
export const PAGINA_W = 841.89;
export const PAGINA_H = 595.28;
/** Margem da mancha — espaço editorial generoso, a página a respirar. */
export const PAGINA_M = 68;

/** Uma caixa na página, em pontos PDF. `y` é a base (o PDF conta de baixo). */
export interface CaixaPdf {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * As duas caixas da capa: duas fotos a toda a altura, a ladear o painel
 * escuro central. É a mesma geometria na capa e na contracapa, de propósito —
 * uma faz de eco da outra.
 */
export function caixasDaCapa(): CaixaPdf[] {
  const panelW = PAGINA_W * 0.34;
  const sideW = (PAGINA_W - panelW) / 2;
  return [
    { x: 0, y: 0, w: sideW, h: PAGINA_H },
    { x: sideW + panelW, y: 0, w: sideW, h: PAGINA_H },
  ];
}

/**
 * Onde é desenhada cada uma das `n` fotos de um mood board, pela ordem em que
 * aparecem no documento.
 *
 * `alturaAnotacao` é o espaço reservado em baixo para a descrição. Quem desenha
 * sabe-o ao certo (mediu as linhas); quem vai buscar as fotos não tem fontes
 * para o medir e passa o mínimo — o que dá as caixas MAIORES e, portanto, um
 * pedido de resolução por excesso. Errar para o lado de descarregar um ficheiro
 * grande de mais é invisível; errar para o outro é uma foto desfocada no PDF.
 */
export function caixasDoCollage(n: number, alturaAnotacao = 8): CaixaPdf[] {
  if (n <= 0) return [];
  const top = PAGINA_H - PAGINA_M - 112;
  const bottom = PAGINA_M + alturaAnotacao;
  const areaW = PAGINA_W - 2 * PAGINA_M;
  const areaH = top - bottom;
  const gap = 8;

  if (n === 1) return [{ x: PAGINA_M, y: bottom, w: areaW, h: areaH }];
  if (n === 2) {
    const cw = (areaW - gap) / 2;
    return [
      { x: PAGINA_M, y: bottom, w: cw, h: areaH },
      { x: PAGINA_M + cw + gap, y: bottom, w: cw, h: areaH },
    ];
  }
  // Disposição em destaque: uma foto grande à esquerda + as restantes numa
  // grelha à direita.
  const featW = areaW * 0.56;
  const caixas: CaixaPdf[] = [{ x: PAGINA_M, y: bottom, w: featW, h: areaH }];
  const restantes = n - 1;
  const rx = PAGINA_M + featW + gap;
  const rW = areaW - featW - gap;
  const rCols = restantes <= 2 ? 1 : 2;
  const rRows = Math.ceil(restantes / rCols);
  const cw = (rW - gap * (rCols - 1)) / rCols;
  const ch = (areaH - gap * (rRows - 1)) / rRows;
  for (let i = 0; i < restantes; i++) {
    const r = Math.floor(i / rCols);
    const c = i % rCols;
    caixas.push({ x: rx + c * (cw + gap), y: top - r * (ch + gap) - ch, w: cw, h: ch });
  }
  return caixas;
}

/**
 * O aspeto (largura ÷ altura) de uma caixa, arredondado ao milésimo — a forma
 * de o dar ao CSS (`aspect-ratio`) sem lhe passar as medidas em pontos.
 */
export function aspetoDaCaixa(c: CaixaPdf | undefined): number {
  if (!c || c.h <= 0) return 1;
  return Math.round((c.w / c.h) * 1000) / 1000;
}

/** O aspeto de uma tira da capa. Uma tira ALTA: ≈ 0,467, quase 1:2. */
export function aspetoDaCapa(): number {
  return aspetoDaCaixa(caixasDaCapa()[0]);
}

/**
 * O aspeto da célula `i` de um mood board com `n` fotos.
 *
 * Muda com `n` — a foto em destaque é larga, as da grelha da direita são
 * pequenas e mudam de forma quando se acrescenta mais uma. É por isso que a
 * pré-visualização tem de perguntar em vez de assumir.
 */
export function aspetoDoCollage(n: number, i: number): number {
  return aspetoDaCaixa(caixasDoCollage(n)[i]);
}

// ── Os layouts de mood board ───────────────────────────────────────────────
/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS MANTÊM A FORMA QUE TÊM — É ISSO QUE FAZ AS PÁGINAS ANTIGAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O gerador tinha um só arranjo — uma foto grande à esquerda e as restantes
 * numa grelha à direita ({@link caixasDoCollage}) — com um tecto de seis fotos e
 * células de tamanho fixo. As propostas que a Líquen fazia à mão não são assim,
 * e a diferença não é o número de fotos: é que **cada foto conserva as suas
 * proporções**.
 *
 * Está à vista na proposta da Mariana e do João. Na página das mesas de jantar
 * há dez fotos em duas filas; dentro de cada fila TODAS têm a mesma altura e
 * larguras diferentes — a segunda é larga, a terceira é estreita, e é isso que
 * dá o ritmo. Uma grelha de células iguais recortava as dez ao mesmo formato e
 * era exactamente o aspecto de relatório que ela não quer.
 *
 * ── COMO SE CONSEGUE ORGÂNICO E ALINHADO AO MESMO TEMPO ───────────────────
 *
 * É o mesmo princípio das galerias de fotografia: fixa-se a ALTURA de cada fila
 * e deixam-se as larguras seguir o aspecto de cada foto. A fila fica cheia de
 * margem a margem porque a altura é escolhida em função da soma dos aspectos —
 * não há espaço a sobrar nem foto a transbordar. As linhas horizontais ficam
 * rigorosas; as verticais variam de fila para fila, que é o que se vê nas
 * páginas antigas e que dá o efeito de composição em vez de tabela.
 *
 * Por isso estas funções pedem os ASPECTOS das fotos. É informação que quem
 * chama tem — o estúdio já a tem no browser, e o gerador lê-a do ficheiro antes
 * de desenhar. Sem ela, só se consegue a grelha rígida.
 */
export type LayoutDeMoodboard = "filas" | "fila-unica" | "mosaico" | "destaque" | "texto-e-imagem";

/** A mancha onde um mood board é composto. É uma caixa como as outras — tem o
 *  nome próprio só para se distinguir, à leitura, de uma caixa de fotografia. */
type Area = CaixaPdf;

/** A área útil de um mood board, em pontos. É onde todos os layouts cabem. */
function areaDoMoodboard(alturaAnotacao: number): Area {
  const top = PAGINA_H - PAGINA_M - 112;
  const bottom = PAGINA_M + alturaAnotacao;
  return { x: PAGINA_M, y: bottom, w: PAGINA_W - 2 * PAGINA_M, h: top - bottom };
}

/** O respiro entre fotos. Uniforme de propósito: o que varia são as FORMAS. */
const RESPIRO = 8;

/**
 * O aspecto de uma foto que não se conseguiu medir: 3:2 deitado, o formato mais
 * comum numa máquina fotográfica.
 *
 * Vive aqui, exportado, porque quem não consegue medir são DOIS: o gerador do
 * PDF, quando o ficheiro não abre, e o estúdio, quando a miniatura ainda não
 * carregou (é `loading="lazy"`, e uma célula fora do ecrã não tem medidas). Se
 * cada um escolhesse o seu, o diagrama que ela vê e a página que sai partiam de
 * pressupostos diferentes — que é precisamente o defeito que este módulo existe
 * para não haver.
 */
export const ASPETO_POR_OMISSAO = 1.5;

/** Aspecto utilizável: sem informação, assume-se {@link ASPETO_POR_OMISSAO}. Um
 *  valor absurdo é ignorado — uma foto não pode ser mil vezes mais larga do que
 *  alta, e deixar passar isso fazia a fila inteira encolher para uma tira. */
function aspetoSeguro(a: number | undefined): number {
  if (typeof a !== "number" || !Number.isFinite(a) || a <= 0) return ASPETO_POR_OMISSAO;
  return Math.min(4, Math.max(0.35, a));
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO DA PÁGINA DE MOOD BOARD — TAMBÉM EM PONTOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As caixas das fotos já vinham daqui; o título, o subtítulo e a legenda
 * estavam escritos à mão dentro do gerador do PDF, e outra vez, com outros
 * números, dentro da pré-visualização do estúdio. O resultado era o previsível:
 * a miniatura mostrava o título 34 pontos acima de onde ele sai e a legenda
 * colada ao fundo da folha, e não havia como descobri-lo sem pôr as duas coisas
 * lado a lado.
 *
 * Uma pré-visualização que não é fiel é pior do que não existir — mostra uma
 * página que ninguém vai receber. Por isso estas medidas passam a estar no
 * mesmo sítio que as das fotografias, e os dois lados leem-nas daqui.
 *
 * `base` é a LINHA DE BASE do texto em coordenadas de PDF (medida a partir do
 * fundo da página), que é como o `drawText` a recebe.
 */
export const TEXTO_DO_MOODBOARD = {
  /** «INSPIRAÇÃO», em maiúsculas espaçadas, por cima do título. */
  sobretitulo: {
    texto: "Inspiração",
    base: PAGINA_H - PAGINA_M - 48,
    tamanho: 7.5,
    /** O espaço acrescentado a cada letra — o desenho é letra a letra. */
    espacamento: 2,
  },
  titulo: { base: PAGINA_H - PAGINA_M - 76, tamanho: 24 },
  subtitulo: { base: PAGINA_H - PAGINA_M - 96, tamanho: 13 },
  legenda: {
    tamanho: 11,
    entrelinha: 15,
    /** O que passa disto é anotado como cortado, não desaparece calado. */
    maxLinhas: 5,
    /** O ar entre a última linha e a margem de baixo. */
    folga: 12,
    /** Sem legenda continua a reservar-se um fio, para as fotos não colarem. */
    reservaSemLegenda: 8,
  },
} as const;

/**
 * A altura que a legenda reserva por baixo das fotografias, em pontos.
 *
 * É o `alturaAnotacao` que {@link caixasDoMoodboard} recebe: dá-lhe as fotos
 * mais baixas quando a descrição é comprida, que é exactamente o que acontece
 * na página. Uma legenda de cinco linhas come 87 pontos — 15% da altura da
 * folha —, e a miniatura que assumisse uma linha mostrava as fotos maiores do
 * que vão sair.
 */
export function alturaDaLegenda(linhas: number): number {
  const L = TEXTO_DO_MOODBOARD.legenda;
  return linhas > 0 ? linhas * L.entrelinha + L.folga : L.reservaSemLegenda;
}

/**
 * Quantas linhas ocupa uma legenda — POR ESTIMATIVA, para quem não tem a fonte.
 *
 * O gerador do PDF mede com a Carlito e parte por palavras (ver `wrap`). O
 * browser não tem essa fonte carregada e medir com outra daria um número
 * diferente com ar de exacto. Aqui parte-se pelas mesmas palavras, com uma
 * largura média de caractere: erra uma linha num texto que caia mesmo em cima
 * do limite, e acerta no resto — que é o que separa «as fotos estão à altura
 * certa» de «a legenda vai empurrá-las e a miniatura não avisou».
 *
 * Vem com o mesmo tecto do desenho: mais do que {@link TEXTO_DO_MOODBOARD}
 * `.legenda.maxLinhas` não é impresso.
 *
 * ── A LINHA EM BRANCO TAMBÉM É UMA LINHA ──────────────────────────────────
 * Isto começava por `texto.trim()`, e o desenho não faz nada disso: o gerador
 * decide pelo texto CRU (`mb.annotation ? wrap(…) : []`) e o `wrap` dá uma
 * linha a cada parágrafo, incluindo os vazios. Uma descrição escrita numa
 * caixa de texto acaba muitas vezes com um Enter a mais — «Tons azuis\n\n» são
 * TRÊS linhas na folha (57 pt reservados) e eram UMA na estimativa (27 pt). A
 * miniatura do estúdio compunha a página com 30 pontos de mancha que a folha
 * não tem: medido, as fotos saíam até 22% maiores do que são impressas e o
 * aviso «esta foto perde X%» diferia do recorte verdadeiro em quase dez pontos
 * percentuais. É o mesmo defeito que a altura da legenda existe para não haver.
 */
export function linhasDaLegendaAprox(texto: string | undefined): number {
  const L = TEXTO_DO_MOODBOARD.legenda;
  // Sem texto nenhum não há legenda — é a única porta que o gerador fecha, e é
  // a mesma que se fecha aqui.
  if (!texto) return 0;
  // 0,5 em por caractere: a média de um texto em caixa mista na Carlito, que é
  // uma fonte de largura Calibri. Não se finge mais precisão do que esta.
  const porLinha = Math.max(1, Math.floor((PAGINA_W - 2 * PAGINA_M) / (L.tamanho * 0.5)));
  let linhas = 0;
  for (const paragrafo of texto.split("\n")) {
    let atual = 0;
    linhas += 1;
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const teste = atual === 0 ? palavra.length : atual + 1 + palavra.length;
      if (teste > porLinha && atual > 0) {
        linhas += 1;
        atual = palavra.length;
      } else {
        atual = teste;
      }
    }
  }
  return Math.min(L.maxLinhas, linhas);
}

/**
 * Reparte `n` fotos por `filas`, o mais equilibrado possível e SEM trocar a
 * ordem — a ordem é a que ela escolheu no estúdio, e uma foto que salta de sítio
 * ao acrescentar outra é a maneira certa de perder a confiança na
 * pré-visualização. As filas de cima ficam com as fotos a mais.
 */
function repartir(n: number, filas: number): number[] {
  const base = Math.floor(n / filas);
  const sobra = n % filas;
  return Array.from({ length: filas }, (_, i) => base + (i < sobra ? 1 : 0));
}

/**
 * Filas justificadas: cada fila cheia de margem a margem, cada foto com a sua
 * forma.
 *
 * A altura de uma fila sai da conta que a torna exactamente da largura da
 * mancha: `altura = (largura útil − respiros) ÷ (soma dos aspectos)`. Depois as
 * alturas das várias filas são escaladas em conjunto para o bloco todo caber na
 * página — o que mantém a proporção entre elas (uma fila de fotos verticais fica
 * naturalmente mais alta do que uma de panorâmicas, e é assim que deve ser).
 */
function filasJustificadas(aspectos: number[], filas: number, alturaAnotacao: number): CaixaPdf[] {
  const a = areaDoMoodboard(alturaAnotacao);
  const grupos: number[][] = [];
  let i = 0;
  for (const quantas of repartir(aspectos.length, filas)) {
    grupos.push(aspectos.slice(i, i + quantas).map(aspetoSeguro));
    i += quantas;
  }

  // A altura que cada fila TEM de ter para encher a largura da mancha. É esta
  // conta que faz a justificação, e é ela que manda.
  const naturais = grupos.map((g) => {
    const soma = g.reduce((s, x) => s + x, 0);
    return (a.w - RESPIRO * (g.length - 1)) / soma;
  });
  const totalNatural = naturais.reduce((s, x) => s + x, 0) + RESPIRO * (filas - 1);

  /**
   * ── A LARGURA MANDA; A ALTURA É O QUE SAIR ────────────────────────────────
   *
   * A primeira versão disto esticava as alturas para o bloco encher a página. É
   * errado, e os testes apanharam-no: a largura de cada foto é `aspecto ×
   * altura`, portanto esticar a altura estica também a largura — e as filas
   * passavam a mancha em 267 pontos, para fora da página.
   *
   * O que se faz é o contrário: as filas enchem SEMPRE a largura, e a altura do
   * bloco é a que resultar. Se sobrar espaço em baixo, sobra — é o que acontece
   * na página das mesas de jantar da proposta antiga, que tem branco por baixo
   * das duas filas e fica melhor assim do que esticada.
   *
   * Só quando o bloco não cabe é que se encolhe TUDO pelo mesmo factor —
   * larguras e alturas juntas, para nenhuma foto mudar de forma — e aí a mancha
   * fica mais estreita do que a página e centra-se, em vez de ficar encostada a
   * uma margem com um vazio do outro lado.
   */
  const encolher = totalNatural > a.h ? a.h / totalNatural : 1;
  const larguraDoBloco = a.w * encolher;
  const margemExtra = (a.w - larguraDoBloco) / 2;

  const caixas: CaixaPdf[] = [];
  let topo = a.y + a.h;
  grupos.forEach((g, r) => {
    const h = naturais[r] * encolher;
    let x = a.x + margemExtra;
    g.forEach((asp) => {
      const w = asp * h;
      caixas.push({ x, y: topo - h, w, h });
      x += w + RESPIRO * encolher;
    });
    topo -= h + RESPIRO * encolher;
  });
  return caixas;
}

/**
 * ── O MOSAICO ORGÂNICO, E PORQUE É QUE NÃO É SORTEADO ─────────────────────
 *
 * É a página do «Decor Mesa Buffet»: cinco fotos de tamanhos muito diferentes,
 * em posições que não formam filas, com branco desigual à volta. O efeito que se
 * quer é esse — mas quem sorteia posições obtém desalinhamento, e nota-se logo:
 * uma página com cinco fotos QUASE alinhadas lê-se como um erro, não como uma
 * composição.
 *
 * Aqui as caixas saem de CORTES SUCESSIVOS de um rectângulo só. Parte-se sempre
 * o maior pedaço que ainda existe, pelo lado mais comprido, numa fronteira de
 * uma grelha fina de 12 × 6 células, numa proporção tirada de uma lista fixa.
 * Isso garante três coisas ao mesmo tempo:
 *
 *   · os tamanhos são todos diferentes;
 *   · as arestas caem sempre em fronteiras da MESMA grelha, portanto tudo alinha
 *     com tudo, mesmo quando não parece;
 *   · não há sobreposições nem buracos — uma partição por cortes é, por
 *     construção, uma partição.
 *
 * E é determinístico: o mesmo número de fotos dá sempre a mesma página. Um
 * mosaico que mudasse a cada geração fazia a pré-visualização mentir.
 */
const PROPORCOES = [0.58, 0.45, 0.62, 0.5, 0.4, 0.55, 0.48, 0.6, 0.42, 0.52];
const CELULAS_X = 12;
const CELULAS_Y = 6;

function mosaico(n: number, alturaAnotacao: number): CaixaPdf[] {
  const a = areaDoMoodboard(alturaAnotacao);
  // Trabalha-se em CÉLULAS inteiras e converte-se no fim: é isso que faz as
  // arestas coincidirem ao ponto, sem depender de arredondamentos.
  let pedacos = [{ cx: 0, cy: 0, cw: CELULAS_X, ch: CELULAS_Y }];
  let corte = 0;
  while (pedacos.length < n) {
    let iMaior = 0;
    for (let k = 1; k < pedacos.length; k++) {
      if (pedacos[k].cw * pedacos[k].ch > pedacos[iMaior].cw * pedacos[iMaior].ch) iMaior = k;
    }
    const p = pedacos[iMaior];
    const naVertical = p.cw >= p.ch;
    const total = naVertical ? p.cw : p.ch;
    // Não há como partir mais sem produzir tiras: fica-se com menos caixas do
    // que fotos, e quem chama trata disso (ver `caixasDoMoodboard`).
    if (total < 2) break;
    const razao = PROPORCOES[corte % PROPORCOES.length];
    corte++;
    const primeiro = Math.min(total - 1, Math.max(1, Math.round(total * razao)));
    const a1 = naVertical
      ? { cx: p.cx, cy: p.cy, cw: primeiro, ch: p.ch }
      : { cx: p.cx, cy: p.cy, cw: p.cw, ch: primeiro };
    const a2 = naVertical
      ? { cx: p.cx + primeiro, cy: p.cy, cw: p.cw - primeiro, ch: p.ch }
      : { cx: p.cx, cy: p.cy + primeiro, cw: p.cw, ch: p.ch - primeiro };
    pedacos = [...pedacos.slice(0, iMaior), a1, a2, ...pedacos.slice(iMaior + 1)];
  }

  const passoX = (a.w + RESPIRO) / CELULAS_X;
  const passoY = (a.h + RESPIRO) / CELULAS_Y;
  const topo = a.y + a.h;
  const caixas = pedacos.slice(0, n).map((p) => ({
    x: a.x + p.cx * passoX,
    // `cy` conta de cima para baixo (é como se lê uma página); o PDF conta de
    // baixo. A conversão é aqui, uma vez, e não em cada layout.
    y: topo - (p.cy + p.ch) * passoY + RESPIRO,
    w: p.cw * passoX - RESPIRO,
    h: p.ch * passoY - RESPIRO,
  }));
  return comAMaiorPrimeiro(caixas);
}

/**
 * A CAIXA GRANDE É A DA PRIMEIRA FOTO — e no mosaico não era.
 *
 * O mosaico é uma das duas disposições onde marcar a «foto principal» quer
 * dizer alguma coisa (ver `temLugarDeDestaque`, em `proposal-moodboard.ts`), e
 * o que a marca faz é pôr essa foto na primeira posição. A promessa escrita ao
 * lado era que «a primeira célula é a maior do arranjo». Não era: os cortes
 * partem sempre o MAIOR pedaço que ainda existe, e o primeiro pedaço é o que
 * mais vezes é partido. Medido com três fotos, na mancha de uma página com
 * legenda de uma linha: a primeira célula ficava com 57.838 pt² e a terceira
 * com 98.206 — a foto que ela marcou como principal saía 41% mais pequena do
 * que a que não marcou.
 *
 * A correcção é uma TROCA e não uma ordenação: a maior célula passa para a
 * frente e a que lá estava fica no lugar dela. Ordenar por área desfazia a
 * leitura do mosaico (as células deixavam de aparecer pela ordem por que se
 * lêem na página); trocar duas mexe no mínimo indispensável para a marca
 * deixar de mentir.
 */
function comAMaiorPrimeiro(caixas: CaixaPdf[]): CaixaPdf[] {
  if (caixas.length < 2) return caixas;
  const area = (c: CaixaPdf) => c.w * c.h;
  let iMaior = 0;
  for (let k = 1; k < caixas.length; k++) if (area(caixas[k]) > area(caixas[iMaior])) iMaior = k;
  if (iMaior === 0) return caixas;
  const trocadas = [...caixas];
  trocadas[0] = caixas[iMaior];
  trocadas[iMaior] = caixas[0];
  return trocadas;
}

// ── Composições sem recorte ────────────────────────────────────────────────
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAIXA TOMA A FORMA DA FOTO — E NÃO O CONTRÁRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido, antes disto: no arranjo em «destaque» uma fotografia ao alto perdia
 * **68% da área** no recorte, e a média das cinco formas mais comuns andava nos
 * 30–50%. No mosaico era o mesmo. Uma foto de um portão coberto de flores
 * entrava na página com dois terços do portão de fora — e a página existe para
 * mostrar o portão.
 *
 * A saída não é escolher entre «cortar» e «deixar tarjas brancas». É dar a cada
 * fotografia uma caixa com a FORMA dela. Nas filas isso já acontecia (a
 * justificação por aspectos deixa a perda a zero); no destaque, no mosaico e no
 * «texto e imagem» não acontecia de todo, porque as caixas eram desenhadas
 * primeiro e as fotos metidas lá dentro à força.
 *
 * ── COMO É QUE ISTO CONTINUA ALINHADO ─────────────────────────────────────
 *
 * Uma composição é uma árvore de duas operações: fotos LADO A LADO (todas com a
 * mesma altura) e blocos EMPILHADOS (todos com a mesma largura). Uma página
 * feita só destas duas operações não pode desalinhar — cada aresta é partilhada
 * por construção, tal como acontece nas filas justificadas, que são o caso
 * particular «empilhado de lado-a-lados».
 *
 * O truque que faz as contas fecharem é que a ALTURA de qualquer composição é
 * uma função AFIM da largura que se lhe der:
 *
 *     altura(largura) = alfa × largura + beta
 *
 * · uma foto:      alfa = 1/aspecto, beta = 0;
 * · um empilhado:  as alturas somam-se, e somam-se os respiros;
 * · um lado-a-lado: as larguras é que somam — e a inversão dá outra afim.
 *
 * Com isso, dar a uma composição a largura da mancha e perguntar-lhe a altura é
 * uma conta directa; e se ela não couber, resolve-se a MESMA equação ao
 * contrário para descobrir a largura que a faz caber ao milímetro. Em nenhum
 * dos dois casos se toca no aspecto de nenhuma foto: o que muda é a escala do
 * conjunto. É por isso que não há tarjas — não há caixa nenhuma maior do que a
 * fotografia que lá está dentro.
 *
 * O espaço que sobra fica FORA das fotos (à volta do bloco, como já ficava por
 * baixo das duas filas da página das mesas de jantar), e o bloco centra-se em
 * vez de encostar a uma margem com um vazio do outro lado.
 */
type Composicao =
  | { tipo: "foto"; aspecto: number }
  | { tipo: "lado-a-lado"; partes: Composicao[] }
  | { tipo: "empilhado"; partes: Composicao[] };

/** `altura = alfa × largura + beta`. Ver o bloco acima: é afim, e é isso que
 *  permite resolver para a largura quando o bloco não cabe em altura. */
interface Medida {
  alfa: number;
  beta: number;
}

/** As composições são imutáveis e medidas muitas vezes (o `pousar` volta a
 *  perguntar em cada nível, e o mosaico compara centenas de árvores). Guardar a
 *  medida no próprio nó tira isso do caminho sem complicar as fórmulas. */
const medidas = new WeakMap<object, Medida>();

function medir(c: Composicao): Medida {
  const guardada = medidas.get(c);
  if (guardada) return guardada;
  const m = calcular(c);
  medidas.set(c, m);
  return m;
}

function calcular(c: Composicao): Medida {
  if (c.tipo === "foto") return { alfa: 1 / c.aspecto, beta: 0 };
  const ms = c.partes.map(medir);
  const respiros = RESPIRO * (ms.length - 1);
  if (c.tipo === "empilhado") {
    return {
      alfa: ms.reduce((s, m) => s + m.alfa, 0),
      beta: ms.reduce((s, m) => s + m.beta, 0) + respiros,
    };
  }
  // Lado a lado: todas as partes com a MESMA altura h. Cada uma pede
  // `largura_i = (h − beta_i) / alfa_i`, e as larguras mais os respiros têm de
  // dar a largura total — resolver em ordem a h dá outra vez uma afim.
  const alfa = 1 / ms.reduce((s, m) => s + 1 / m.alfa, 0);
  return { alfa, beta: alfa * (ms.reduce((s, m) => s + m.beta / m.alfa, 0) - respiros) };
}

/** Escreve as caixas das folhas, pela ordem das fotos, dada a largura do nó. */
function pousar(c: Composicao, x: number, topo: number, largura: number, saida: CaixaPdf[]): void {
  const { alfa, beta } = medir(c);
  const altura = alfa * largura + beta;
  if (c.tipo === "foto") {
    saida.push({ x, y: topo - altura, w: largura, h: altura });
    return;
  }
  if (c.tipo === "empilhado") {
    let t = topo;
    for (const p of c.partes) {
      const m = medir(p);
      pousar(p, x, t, largura, saida);
      t -= m.alfa * largura + m.beta + RESPIRO;
    }
    return;
  }
  let cx = x;
  for (const p of c.partes) {
    const m = medir(p);
    // A altura é comum; a largura de cada parte é a que essa altura lhe pede.
    const w = (altura - m.beta) / m.alfa;
    pousar(p, cx, topo, w, saida);
    cx += w + RESPIRO;
  }
}

/**
 * Põe a composição na área: enche a largura e, se ficar alta de mais, encolhe
 * até caber — resolvendo `altura(largura) = altura disponível`, que preserva os
 * aspectos exactos E mantém os respiros do mesmo tamanho em toda a página (uma
 * escala global encolhia também os respiros, e o ritmo mudava de página para
 * página consoante o número de fotos).
 */
function dispor(c: Composicao, a: Area, encostar: "centro" | "direita" = "centro"): CaixaPdf[] {
  const { alfa, beta } = medir(c);
  let largura = a.w;
  if (alfa * largura + beta > a.h) largura = (a.h - beta) / alfa;
  largura = Math.min(a.w, largura);
  // Composição impossível de encaixar (fotos a mais para a altura que há). Não
  // se devolve lixo: quem chama trata disso com as filas, que sabem encolher.
  if (!Number.isFinite(largura) || largura <= 1) return [];
  const saida: CaixaPdf[] = [];
  const x = encostar === "direita" ? a.x + a.w - largura : a.x + (a.w - largura) / 2;
  pousar(c, x, a.y + a.h, largura, saida);
  return saida;
}

const foto = (aspecto: number): Composicao => ({ tipo: "foto", aspecto: aspetoSeguro(aspecto) });

/** Uma fila de fotos, ou a própria foto quando é só uma — um `lado-a-lado` de
 *  um elemento seria um nó a mais a fazer contas para nada. */
function fila(aspectos: number[]): Composicao {
  return aspectos.length === 1
    ? foto(aspectos[0])
    : { tipo: "lado-a-lado", partes: aspectos.map(foto) };
}

/**
 * O «destaque» sem recorte: a primeira foto grande à esquerda, com a forma que
 * tem, e as restantes em filas justificadas à direita — as duas colunas a
 * acabarem exactamente na mesma linha, porque são os dois ramos de um mesmo
 * `lado-a-lado` e este dá-lhes a mesma altura por construção.
 *
 * O número de filas da direita não é fixo: experimentam-se todas e fica a que
 * deixa a foto em destaque mais perto dos 56% da largura da mancha — a
 * proporção que o arranjo antigo tinha fixa. Assim o desenho continua a ler-se
 * como «uma grande e umas pequenas» com quaisquer formas, em vez de o destaque
 * encolher para uma tira só porque calhou ser uma foto ao alto.
 */
function destaqueSemRecorte(aspectos: number[], a: Area): CaixaPdf[] {
  const resto = aspectos.slice(1);
  if (resto.length === 0) return dispor(foto(aspectos[0]), a);

  let melhor: { caixas: CaixaPdf[]; menor: number; destaqueMaior: boolean } | null = null;
  for (let filas = 1; filas <= resto.length; filas++) {
    const grupos: Composicao[] = [];
    let i = 0;
    for (const quantas of repartir(resto.length, filas)) {
      grupos.push(fila(resto.slice(i, i + quantas)));
      i += quantas;
    }
    const caixas = dispor(
      {
        tipo: "lado-a-lado",
        partes: [
          foto(aspectos[0]),
          grupos.length === 1 ? grupos[0] : { tipo: "empilhado", partes: grupos },
        ],
      },
      a,
    );
    if (caixas.length !== aspectos.length) continue;
    /**
     * ── O CRITÉRIO É O TAMANHO, NÃO UMA PROPORÇÃO FIXA ────────────────────
     *
     * A primeira versão exigia que a foto em destaque ficasse à volta dos 56%
     * da largura, que era a proporção que o arranjo antigo tinha em pedra. Vi o
     * PDF: com uma foto em destaque ao alto, essa exigência escolhia um arranjo
     * que ocupava METADE da largura da página e deixava uma ilha de fotografias
     * pequenas no meio de branco. Manter a proporção era manter a forma de uma
     * página que já não existe — as caixas agora vêm das fotos.
     *
     * Fica então o arranjo que deixa a MENOR fotografia o maior possível. É o
     * mesmo critério do mosaico e leva à mesma resposta pela mesma razão: um
     * bloco que enche a mancha tem, forçosamente, fotografias maiores do que um
     * bloco encolhido ao meio da página.
     *
     * Mas primeiro do que isso, a primeira foto tem de ser mesmo a MAIOR de
     * todas. Sem essa condição, três fotos em que a segunda é uma panorâmica
     * davam uma fila de três — o arranjo que deixa a menor foto maior, e que
     * não é um destaque nenhum. Quem escolheu «destaque» escolheu ver uma foto
     * grande. Só se nenhum arranjo conseguir isso é que ela cede.
     */
    const menor = Math.min(...caixas.map((c) => c.w * c.h));
    const destaqueMaior = caixas.every((c) => c.w * c.h <= caixas[0].w * caixas[0].h + 0.01);
    const candidato = { caixas, menor, destaqueMaior };
    if (!melhor) melhor = candidato;
    else if (destaqueMaior !== melhor.destaqueMaior) melhor = destaqueMaior ? candidato : melhor;
    else if (menor > melhor.menor) melhor = candidato;
  }
  return melhor ? melhor.caixas : [];
}

/**
 * ── O MOSAICO SEM RECORTE ─────────────────────────────────────────────────
 *
 * Os cortes sucessivos são os mesmos de sempre — parte-se em dois, numa
 * proporção tirada da lista fixa, e outra vez, e outra vez — mas o que se parte
 * é a LISTA DE FOTOS e não o rectângulo. Depois é a composição que dá a cada
 * pedaço o tamanho que a forma das fotos que lá estão pede. Continua a ser uma
 * guilhotina, portanto continua a alinhar tudo com tudo; o que desaparece é o
 * recorte.
 *
 * Falta escolher, em cada corte, se as duas metades ficam LADO A LADO ou UMA
 * SOBRE A OUTRA. Alternar por profundidade (que foi a primeira versão) deixava
 * fotografias de 37 pt — um selo de 1,3 cm numa página A4, para uma foto que ela
 * escolheu mostrar. Como os cortes são no máximo nove, experimentam-se TODAS as
 * combinações (512 no pior caso, décimos de milissegundo) e fica a que deixa a
 * MENOR fotografia o maior possível.
 *
 * Não é o mesmo que uniformizar: os pontos de corte continuam a vir das
 * proporções desiguais, portanto os tamanhos continuam todos diferentes — o que
 * este critério exclui são as árvores degeneradas, a fila única de dez e a
 * coluna de dez, que também não cortam nada mas fazem miniaturas.
 *
 * E é determinístico: as mesmas fotos dão sempre a mesma página, senão a
 * pré-visualização mentia.
 */
interface Ramo {
  de: number;
  ate: number;
  filhos?: [Ramo, Ramo];
}

function ramificar(n: number): Ramo {
  let corte = 0;
  const partir = (de: number, ate: number): Ramo => {
    const quantas = ate - de;
    if (quantas === 1) return { de, ate };
    const razao = PROPORCOES[corte % PROPORCOES.length];
    corte++;
    const primeiro = Math.min(quantas - 1, Math.max(1, Math.round(quantas * razao)));
    return { de, ate, filhos: [partir(de, de + primeiro), partir(de + primeiro, ate)] };
  };
  return partir(0, n);
}

function mosaicoSemRecorte(aspectos: number[], a: Area): CaixaPdf[] {
  const n = aspectos.length;
  const raiz = ramificar(n);
  /** Índice de cada corte na máscara, e os cortes que caem DENTRO de cada
   *  ramo — é este segundo que permite reaproveitar sub-árvores entre
   *  combinações (ver `montar`). */
  const indice = new Map<Ramo, number>();
  const dentro = new Map<Ramo, number>();
  (function numerar(r: Ramo): number {
    if (!r.filhos) return 0;
    const i = indice.size;
    indice.set(r, i);
    const bits = (1 << i) | numerar(r.filhos[0]) | numerar(r.filhos[1]);
    dentro.set(r, bits);
    return bits;
  })(raiz);

  /**
   * A mesma sub-árvore, com os mesmos cortes, dá a MESMA composição em centenas
   * de combinações diferentes — metade das combinações só mexe no outro lado da
   * página. Devolver o mesmo objecto faz a medida ser calculada uma vez em vez
   * de quinhentas (ver a cache em {@link medir}), e é a diferença entre 7 ms e
   * meio milissegundo por mood board. Sete milissegundos não se sentem no
   * servidor; sentem-se no estúdio, que redesenha os diagramas das cinco
   * disposições a cada tecla.
   */
  const feitos = new Map<number, Composicao>();
  const folhas = aspectos.map(foto);
  const montar = (r: Ramo, mascara: number): Composicao => {
    if (!r.filhos) return folhas[r.de];
    const chave = indice.get(r)! * 1024 + (mascara & dentro.get(r)!);
    const jaFeito = feitos.get(chave);
    if (jaFeito) return jaFeito;
    const partes = [montar(r.filhos[0], mascara), montar(r.filhos[1], mascara)];
    const ladoALado = ((mascara >> indice.get(r)!) & 1) === 0;
    const c: Composicao = ladoALado
      ? { tipo: "lado-a-lado", partes }
      : { tipo: "empilhado", partes };
    feitos.set(chave, c);
    return c;
  };

  // Acima de dez cortes a busca deixaria de ser barata (e a chave da cache
  // deixaria de caber nos 1024). Não acontece — o mood board tem lotação de dez
  // fotos, logo nove cortes — mas se um dia acontecer, alterna-se por
  // profundidade em vez de bloquear a página.
  if (indice.size > 9) {
    let mascara = 0;
    (function alternar(r: Ramo, profundidade: number) {
      if (!r.filhos) return;
      if (profundidade % 2 === 1) mascara |= 1 << indice.get(r)!;
      r.filhos.forEach((f) => alternar(f, profundidade + 1));
    })(raiz, 0);
    return dispor(montar(raiz, mascara), a);
  }

  let melhor: {
    caixas: CaixaPdf[];
    menor: number;
    semSelos: boolean;
    primeiraMaior: boolean;
  } | null = null;
  for (let mascara = 0; mascara < 1 << indice.size; mascara++) {
    const caixas = dispor(montar(raiz, mascara), a);
    if (caixas.length !== n) continue;
    let menor = Infinity;
    let menorLado = Infinity;
    for (const c of caixas) {
      menor = Math.min(menor, c.w * c.h);
      menorLado = Math.min(menorLado, c.w, c.h);
    }
    /**
     * ── E A PRIMEIRA FOTO É A GRANDE ──────────────────────────────────────
     *
     * O mesmo critério do «destaque» (ver `destaqueSemRecorte`), e pela mesma
     * razão: o mosaico é uma das duas disposições onde a marca de «principal»
     * promete uma caixa maior, e aqui as caixas não se podem trocar entre si —
     * cada uma tem a forma da fotografia que lá está. Ou a árvore dá a maior
     * área à primeira foto, ou a promessa não se cumpre.
     *
     * Medido com três panorâmicas 12:5: a árvore escolhida só pelo tamanho da
     * menor dava 28.680 pt² à primeira e 118.244 à terceira — a foto marcada
     * saía QUATRO vezes mais pequena do que a que lhe ficava ao lado.
     *
     * Vem antes do tamanho da menor, e cede quando nenhuma árvore consegue
     * (duas fotos lado a lado com a mesma altura: a mais larga é sempre a
     * maior, e não há arranjo que o desfaça).
     *
     * O que NÃO cede é a trava dos selos ({@link LADO_MINIMO_DA_FOTO}): um
     * destaque comprado com uma fotografia de 1,1 cm é o defeito de origem
     * outra vez, e ela nem chegou a pedir o destaque nessa foto.
     */
    const semSelos = menorLado > LADO_MINIMO_DA_FOTO;
    const primeiraMaior = caixas.every((c) => c.w * c.h <= caixas[0].w * caixas[0].h + 0.01);
    const candidato = { caixas, menor, semSelos, primeiraMaior };
    if (!melhor) melhor = candidato;
    else if (semSelos !== melhor.semSelos) melhor = semSelos ? candidato : melhor;
    else if (primeiraMaior !== melhor.primeiraMaior) melhor = primeiraMaior ? candidato : melhor;
    else if (menor > melhor.menor) melhor = candidato;
  }
  return melhor ? melhor.caixas : [];
}

// ── A distribuição do espaço na página ─────────────────────────────────────
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BLOCO NO MEIO DA FOLHA, E O CHÃO DOS 40%
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para a proposta da Tara e do Marty: a página das
 * «Lapelas Noivo» tem «cinco fotos pequenas no terço superior e dois terços de
 * folha vazios». Medido nessa página, antes disto: o bloco ocupava **31,8%** da
 * mancha e deixava **226 pontos** de branco por baixo — oito centímetros de
 * folha em branco entre a última foto e o rodapé. A do «Decor Mesa Buffet», com
 * as mesmas cinco fotos numa fila, ficava em 30,4%.
 *
 * A regra que ela quer, e que estas duas funções cumprem:
 *
 *   «o bloco de imagens ocupa a ÁREA CENTRAL da página, com margens
 *    equilibradas em cima e em baixo. Uma página com menos de 40% de ocupação
 *    deve AUMENTAR as imagens ou fundir-se com outra.»
 *
 * ── PORQUE É QUE ISTO NÃO É ESTICAR ────────────────────────────────────────
 *
 * Aumentar uma foto é multiplicá-la; esticá-la é mudar-lhe a forma, e há aqui
 * uma frente inteira (ver as composições sem recorte, mais acima) que existe
 * precisamente para nenhuma fotografia ser recortada nem deformada. Nada disto
 * toca num aspecto: o que muda é o número de FILAS por que as fotos se
 * repartem. Uma fila só de cinco fotos enche a largura e a altura é o que
 * sobrar — quanto mais fotos na fila, mais baixa a fila. Repartidas por duas
 * filas, cada fila tem menos fotos, portanto é mais alta, e o bloco cresce até
 * encher a mancha. Nas «Lapelas Noivo» isso leva a página dos 31,8% aos 68,3%,
 * e cada fotografia fica 2,1 vezes maior em área, com a forma que tinha.
 *
 * ── E PORQUE É QUE SÓ ABAIXO DE 40% ────────────────────────────────────────
 *
 * Porque acima disso a escolha é dela. Uma página em «fila única» com 59% é uma
 * página composta, e recompô-la seria trocar-lhe a disposição pelas costas. O
 * chão dos 40% é o número que ela escreveu, e é a fronteira entre «uma
 * composição arejada» e «uma folha por preencher».
 *
 * A outra saída que ela dá — «fundir-se com outra» — não se faz aqui: juntar
 * dois mood boards numa página é uma decisão editorial (que título fica, que
 * fotos saem) e pertence ao estúdio, não à geometria.
 */
export const OCUPACAO_MINIMA = 0.4;

/**
 * O lado mais curto que uma fotografia pode ter na página, em pontos.
 *
 * 36 pontos são 1,3 cm numa A4: abaixo disso a decoração deixa de se ver, que é
 * o defeito de origem outra vez (ver o mosaico, que experimenta todas as
 * árvores precisamente para não fazer selos).
 *
 * Aqui é uma TRAVA à regra dos 40%, e é indispensável: encher a folha, por si
 * só, é um objectivo que se satisfaz mal. Medido com nove panorâmicas 12:5 —
 * uma fila de oito fotos (33,8 pt de altura cada) por baixo de uma foto enorme
 * enche 95,8% da mancha, e é uma página com uma fotografia e uma tira de selos.
 * Com a trava, o mesmo caso sai em três filas com 90,2% e nenhuma foto abaixo
 * de 71 pontos.
 */
export const LADO_MINIMO_DA_FOTO = 36;

/**
 * Quanto da mancha do mood board é FOTOGRAFIA — de 0 a 1.
 *
 * É a medida da regra dela e é a mesma que os testes usam. Conta a área das
 * caixas, não a envolvente do bloco: um bloco alto cheio de buracos não é uma
 * página cheia.
 */
export function ocupacaoDoMoodboard(caixas: readonly CaixaPdf[], alturaAnotacao = 8): number {
  const a = areaDoMoodboard(alturaAnotacao);
  if (a.w <= 0 || a.h <= 0) return 0;
  const coberto = caixas.reduce((s, c) => s + Math.max(0, c.w) * Math.max(0, c.h), 0);
  return coberto / (a.w * a.h);
}

/**
 * Põe o bloco no meio da mancha: o que sobra fica metade em cima e metade em
 * baixo, em vez de ir todo para o fim da folha.
 *
 * Não mexe em tamanhos nenhuns — é uma translação, e por isso não pode cortar,
 * deformar nem desalinhar seja o que for. Quando o bloco já enche a altura (o
 * mosaico, ou qualquer composição que tenha encolhido para caber) o
 * deslocamento é zero e isto não faz nada.
 */
function centrarNaVertical(caixas: CaixaPdf[], a: Area): CaixaPdf[] {
  if (caixas.length === 0) return caixas;
  const topo = Math.max(...caixas.map((c) => c.y + c.h));
  const base = Math.min(...caixas.map((c) => c.y));
  const sobra = a.h - (topo - base);
  if (!Number.isFinite(sobra) || sobra <= 0.01) return caixas;
  const desloca = a.y + sobra / 2 - base;
  return caixas.map((c) => ({ ...c, y: c.y + desloca }));
}

/**
 * A página que não chega aos 40%: reparte as mesmas fotos por outro número de
 * filas e fica com o arranjo que enche mais.
 *
 * As filas são o único arranjo que CRESCE sem cortar — cada fila enche a
 * largura da mancha e a altura sai dos aspectos —, por isso é para elas que se
 * recompõe, venha a página de onde vier. Se nenhuma repartição melhorar (é o
 * caso de uma foto só, que já está no tamanho máximo que a folha lhe dá), fica
 * exactamente o que estava: isto nunca pode piorar uma página.
 *
 * As filas montam-se aqui como COMPOSIÇÃO (`empilhado` de `lado-a-lado`) e não
 * com {@link filasJustificadas}: é a mesma ideia e os mesmos aspectos, mas o
 * `dispor` mantém o respiro de 8 pontos igual em toda a página quando o bloco
 * encolhe, em vez de o encolher também — senão a mesma folha tinha duas medidas
 * de ar entre fotografias, consoante o bloco tivesse ou não cabido.
 *
 * ── PORQUE É QUE SE EXPERIMENTAM TODOS OS CORTES ──────────────────────────
 *
 * A repartição equilibrada ({@link repartir}, que é a que as «filas» usam) não
 * é a que enche mais quando as formas são desiguais. Medido nas «Lapelas
 * Noivo» — três deitadas e duas ao alto: três-e-duas dá 50,7% (a fila das duas
 * verticais fica altíssima e obriga o bloco todo a encolher para caber),
 * duas-e-três dá 68,3% com as mesmas fotos, pela mesma ordem e com as mesmas
 * formas. Como os cortes são contíguos, a ORDEM que ela escolheu nunca muda —
 * só muda onde a fila parte. São no máximo 130 arranjos (dez fotos, até quatro
 * filas) e o resultado é determinístico: a mesma página sai sempre igual.
 *
 * O «texto e imagem» está de fora de propósito: nesse arranjo a metade vazia da
 * folha é onde o texto vai, e enchê-la de fotografias era desfazer a escolha.
 */
function crescerAteAoChao(
  caixas: CaixaPdf[],
  layout: LayoutDeMoodboard,
  aspectos: number[],
  alturaAnotacao: number,
  a: Area,
): CaixaPdf[] {
  const n = aspectos.length;
  if (layout === "texto-e-imagem" || n <= 1) return caixas;
  let melhor = caixas;
  let melhorOcupacao = ocupacaoDoMoodboard(caixas, alturaAnotacao);
  if (melhorOcupacao >= OCUPACAO_MINIMA) return caixas;
  // As folhas nascem UMA vez e servem as 130 árvores: a medida de cada
  // fotografia fica na cache do `medir` em vez de ser recalculada em cada corte
  // (a mesma razão do mosaico, que reaproveita sub-árvores). Medido com dez
  // fotos: 2,5 ms → 0,93 ms por página, abaixo do que o mosaico já custa.
  const folhas = aspectos.map(foto);
  // Até quatro filas: acima disso as fotos de uma página cheia já são selos, e
  // o próprio critério da ocupação as recusaria (mais filas ⇒ bloco mais alto
  // do que a folha ⇒ encolhe tudo ⇒ ocupa menos).
  for (const corte of reparticoesContiguas(n, Math.min(4, n))) {
    const grupos: Composicao[] = [];
    let i = 0;
    for (const quantas of corte) {
      const partes = folhas.slice(i, i + quantas);
      grupos.push(partes.length === 1 ? partes[0] : { tipo: "lado-a-lado", partes });
      i += quantas;
    }
    const alternativa = dispor(
      grupos.length === 1 ? grupos[0] : { tipo: "empilhado", partes: grupos },
      a,
    );
    if (alternativa.length !== n) continue;
    // A trava dos selos: ver {@link LADO_MINIMO_DA_FOTO}. Uma página cheia à
    // custa de uma tira de miniaturas não é uma página cheia.
    const menorLado = Math.min(...alternativa.map((c) => Math.min(c.w, c.h)));
    if (menorLado <= LADO_MINIMO_DA_FOTO) continue;
    const ocupacao = ocupacaoDoMoodboard(alternativa, alturaAnotacao);
    if (ocupacao > melhorOcupacao + 0.001) {
      melhor = alternativa;
      melhorOcupacao = ocupacao;
    }
  }
  return melhor;
}

/** Todas as maneiras de cortar `n` fotos em 1..`maxFilas` filas CONTÍGUAS —
 *  cada uma com pelo menos uma foto. Contíguas é o que garante que a ordem
 *  dela sobrevive: uma fila é sempre um pedaço seguido da lista. */
function reparticoesContiguas(n: number, maxFilas: number): number[][] {
  const saida: number[][] = [];
  const seguir = (restam: number, filas: number, atual: number[]) => {
    if (filas === 1) {
      saida.push([...atual, restam]);
      return;
    }
    for (let k = 1; k <= restam - (filas - 1); k++) seguir(restam - k, filas - 1, [...atual, k]);
  };
  for (let filas = 1; filas <= maxFilas; filas++) seguir(n, filas, []);
  return saida;
}

/**
 * Onde vai cada foto de um mood board, para o layout escolhido.
 *
 * `aspectos` é a forma de cada foto (largura ÷ altura), pela ordem em que ela as
 * pôs. Devolve exactamente uma caixa por foto — quem desenha não tem de contar
 * nada nem de tratar de sobras.
 *
 * `semRecorte` é a escolha nova: as caixas tomam a forma das fotografias em vez
 * de as recortarem (ver o bloco das composições). Vem do documento
 * (`MoodBoard.enquadramento`) e por omissão é FALSO — não porque seja pior, mas
 * porque uma proposta que já seguiu para um casal é regenerada a cada vez que
 * eles abrem o PDF, e não pode mudar de aspecto por baixo deles.
 *
 * O arranjo sai daqui já com a distribuição do espaço resolvida: a página que
 * não chega ao chão dos 40% é recomposta em filas e o bloco fica no meio da
 * folha (ver {@link OCUPACAO_MINIMA}).
 */
export function caixasDoMoodboard(
  layout: LayoutDeMoodboard,
  aspectos: number[],
  alturaAnotacao = 8,
  semRecorte = false,
): CaixaPdf[] {
  const n = aspectos.length;
  if (n <= 0) return [];
  const a = areaDoMoodboard(alturaAnotacao);
  const arranjo = arranjoDoMoodboard(layout, aspectos, alturaAnotacao, semRecorte, a);
  return centrarNaVertical(crescerAteAoChao(arranjo, layout, aspectos, alturaAnotacao, a), a);
}

/** O arranjo cru de cada disposição, antes de se olhar para a ocupação da
 *  folha. Separado de {@link caixasDoMoodboard} para a distribuição do espaço
 *  ser UMA regra aplicada a todas as disposições, e não cinco cópias dela. */
function arranjoDoMoodboard(
  layout: LayoutDeMoodboard,
  aspectos: number[],
  alturaAnotacao: number,
  semRecorte: boolean,
  a: Area,
): CaixaPdf[] {
  const n = aspectos.length;
  switch (layout) {
    case "filas": {
      // Duas filas até dez fotos, como a página das mesas de jantar; três acima
      // disso, para nenhuma foto ficar menor do que um selo.
      const filas = n <= 3 ? 1 : n <= 10 ? 2 : 3;
      return filasJustificadas(aspectos, Math.min(filas, n), alturaAnotacao);
    }
    case "fila-unica":
      return filasJustificadas(aspectos, 1, alturaAnotacao);
    case "mosaico": {
      const caixas = semRecorte ? mosaicoSemRecorte(aspectos, a) : mosaico(n, alturaAnotacao);
      // O mosaico pode não conseguir partir-se em `n` pedaços decentes. Nesse
      // caso as que sobram vão para filas, em vez de desaparecerem — uma foto
      // que ela escolheu não pode sumir-se do documento sem uma palavra.
      return caixas.length === n
        ? caixas
        : filasJustificadas(aspectos, n <= 10 ? 2 : 3, alturaAnotacao);
    }
    case "texto-e-imagem": {
      // O texto ocupa a esquerda e a imagem de apoio a direita — é a página dos
      // «Tons Azuis», onde a nota explica o arranjo ao lado da foto que o mostra.
      // Quem desenha o texto tem da margem até ao princípio da coluna da direita.
      //
      // ── E SÃO N CAIXAS, NÃO UMA ─────────────────────────────────────────
      // Devolvia UMA caixa fosse qual fosse o número de fotos, e o gerador
      // saltava as que não tinham caixa — em silêncio. Escolher este arranjo
      // com três fotos escolhidas dava uma página com uma foto e duas
      // desaparecidas, sem aviso nenhum no estúdio nem no PDF. As que vêm a
      // seguir empilham-se por baixo da primeira, na mesma coluna.
      const larguraAlvo = a.w * 0.42;
      const coluna: Area = { ...a, x: a.x + a.w - larguraAlvo, w: larguraAlvo };
      if (semRecorte) {
        const c: Composicao =
          n === 1 ? foto(aspectos[0]) : { tipo: "empilhado", partes: aspectos.map(foto) };
        const caixas = dispor(c, coluna, "direita");
        if (caixas.length === n) return caixas;
      }
      // Sem a escolha nova, o comportamento de sempre: a caixa tem a largura da
      // coluna e a altura que a foto pede, e só encolhe (nunca cresce) quando a
      // foto é ao alto de mais para o espaço que há — aí é que há recorte.
      const alturaCelula = (a.h - RESPIRO * (n - 1)) / n;
      return aspectos.map((asp, i) => {
        const h = Math.min(alturaCelula, larguraAlvo / aspetoSeguro(asp));
        const topo = coluna.y + coluna.h - i * (alturaCelula + RESPIRO);
        return { x: coluna.x, y: topo - h, w: larguraAlvo, h };
      });
    }
    case "destaque":
    default: {
      if (semRecorte) {
        const caixas = destaqueSemRecorte(aspectos, a);
        if (caixas.length === n) return caixas;
      }
      return caixasDoCollage(n, alturaAnotacao);
    }
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO É QUE SE PERDE — para ela poder saber, em vez de descobrir
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A fracção da ÁREA da fotografia que fica de fora quando ela é recortada para
 * encher uma caixa com outra forma. Sai directa dos dois aspectos: o recorte
 * mantém o lado que falta e corta o outro, portanto o que sobra é a razão entre
 * o menor e o maior.
 *
 * Existe porque há um sítio onde o recorte NÃO pode desaparecer: as duas tiras
 * da capa correm de topo a fundo da página e têm aspecto 0,47:1 — quase 1:2.
 * Nenhuma fotografia normal tem essa forma, e encolher a tira deixaria uma
 * barra de fundo entre a foto e a aresta da folha, que é pior. O que se pode
 * fazer é DIZER: uma foto deitada perde ali 69% e uma panorâmica 81%, contra
 * 30% de uma ao alto. Com o número à frente, escolher uma vertical para a capa
 * deixa de ser sorte.
 *
 * ── AQUI A FORMA DA FOTO É A VERDADEIRA, NÃO A APERTADA ────────────────────
 *
 * Isto media com `aspetoSeguro`, que aperta o aspecto ao intervalo [0,35; 4]
 * antes de o usar. Para COMPOR está certo — uma panorâmica de 10:1 esmagava a
 * fila inteira numa tira, e é para isso que o aperto existe. Para MEDIR O QUE
 * SE PERDE está exactamente ao contrário: a caixa que a composição lhe deu tem
 * aspecto 4, a fotografia tem 10, e o desenho recorta-a (`drawCoverImage`,
 * em `proposal-doc-pdf.ts`) — 60% da panorâmica fica de fora da folha. Medido
 * nos dois lados do aperto, o aviso do estúdio dizia **0%** nesse caso, que é
 * o único número que não podia dizer: a perda maior de todas era a única que
 * ficava calada.
 *
 * O que não se consegue ler (nem número, nem positivo) continua a valer
 * {@link ASPETO_POR_OMISSAO} — sem forma não há perda que se possa afirmar.
 */
export function perdaNoRecorte(aspetoDaFoto: number, aspetoDaCaixa: number): number {
  const f =
    typeof aspetoDaFoto === "number" && Number.isFinite(aspetoDaFoto) && aspetoDaFoto > 0
      ? aspetoDaFoto
      : ASPETO_POR_OMISSAO;
  const c = aspetoDaCaixa > 0 && Number.isFinite(aspetoDaCaixa) ? aspetoDaCaixa : f;
  return 1 - Math.min(f, c) / Math.max(f, c);
}

/** A perda de cada foto de um mood board, pela ordem em que ela as pôs. Zero em
 *  toda a linha é o que se espera dos arranjos sem recorte. */
export function perdasDoMoodboard(
  layout: LayoutDeMoodboard,
  aspectos: number[],
  alturaAnotacao = 8,
  semRecorte = false,
): number[] {
  const caixas = caixasDoMoodboard(layout, aspectos, alturaAnotacao, semRecorte);
  return aspectos.map((asp, i) => (caixas[i] ? perdaNoRecorte(asp, caixas[i].w / caixas[i].h) : 0));
}

/** O que se perde ao pôr esta fotografia numa das tiras da capa. */
export function perdaNaCapa(aspetoDaFoto: number): number {
  return perdaNoRecorte(aspetoDaFoto, aspetoDaCapa());
}

/**
 * A partir de quanto é que vale a pena avisar.
 *
 * Abaixo disto o corte é o que qualquer enquadramento faria e dizê-lo só
 * ensinaria a ignorar avisos; a partir daqui já é uma parte da decoração que
 * fica de fora da folha. Um oitavo da fotografia é a fasquia — a diferença
 * entre um 4:3 e um 3:2, que ninguém dá por ela.
 */
export const PERDA_QUE_SE_AVISA = 0.125;

/**
 * O layout que melhor serve estas fotos, para o estúdio propor sem obrigar.
 *
 * É uma sugestão e não uma regra. O que evita é o caso em que escolher fotos e
 * escolher disposição são duas decisões separadas: nove fotos numa disposição
 * feita para quatro sai apertada, e ninguém tem de descobrir isso ao gerar o PDF.
 */
export function layoutSugerido(n: number): LayoutDeMoodboard {
  if (n <= 1) return "texto-e-imagem";
  if (n <= 3) return "destaque";
  if (n === 5) return "fila-unica";
  if (n === 4 || n === 6) return "mosaico";
  return "filas";
}
