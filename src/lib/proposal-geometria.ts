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

/** A área útil de um mood board, em pontos. É onde todos os layouts cabem. */
function areaDoMoodboard(alturaAnotacao: number) {
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
  return pedacos.slice(0, n).map((p) => ({
    x: a.x + p.cx * passoX,
    // `cy` conta de cima para baixo (é como se lê uma página); o PDF conta de
    // baixo. A conversão é aqui, uma vez, e não em cada layout.
    y: topo - (p.cy + p.ch) * passoY + RESPIRO,
    w: p.cw * passoX - RESPIRO,
    h: p.ch * passoY - RESPIRO,
  }));
}

/**
 * Onde vai cada foto de um mood board, para o layout escolhido.
 *
 * `aspectos` é a forma de cada foto (largura ÷ altura), pela ordem em que ela as
 * pôs. Devolve exactamente uma caixa por foto — quem desenha não tem de contar
 * nada nem de tratar de sobras.
 */
export function caixasDoMoodboard(
  layout: LayoutDeMoodboard,
  aspectos: number[],
  alturaAnotacao = 8,
): CaixaPdf[] {
  const n = aspectos.length;
  if (n <= 0) return [];
  const a = areaDoMoodboard(alturaAnotacao);
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
      const caixas = mosaico(n, alturaAnotacao);
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
      // Devolve-se só a caixa da imagem; quem desenha o texto tem da margem até
      // ao princípio dela.
      const w = a.w * 0.42;
      const asp = aspetoSeguro(aspectos[0]);
      const h = Math.min(a.h, w / asp);
      return [{ x: a.x + a.w - w, y: a.y + a.h - h, w, h }];
    }
    case "destaque":
    default:
      return caixasDoCollage(n, alturaAnotacao);
  }
}

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
