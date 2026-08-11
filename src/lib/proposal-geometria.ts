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

  let melhor: { caixas: CaixaPdf[]; menor: number } | null = null;
  for (let mascara = 0; mascara < 1 << indice.size; mascara++) {
    const caixas = dispor(montar(raiz, mascara), a);
    if (caixas.length !== n) continue;
    let menor = Infinity;
    for (const c of caixas) menor = Math.min(menor, c.w * c.h);
    if (!melhor || menor > melhor.menor) melhor = { caixas, menor };
  }
  return melhor ? melhor.caixas : [];
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
 */
export function perdaNoRecorte(aspetoDaFoto: number, aspetoDaCaixa: number): number {
  const f = aspetoSeguro(aspetoDaFoto);
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
