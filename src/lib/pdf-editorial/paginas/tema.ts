import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { LADO_PAGINA, type Tratamento } from "../imagens";
import {
  FOLHA,
  FUNDO_DO_CONTEUDO,
  fotoNaCaixa,
  logotipoNaLinha,
  novaPagina,
  rectangulo,
  rodape,
  sobretitulo,
  type CaixaPx,
  type Contexto,
} from "../moldura";
import { composicao } from "../mosaico";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, fio, px } from "../paleta";
import {
  baseDaLinha,
  bloco,
  caber,
  escrever,
  escreverADireita,
  yDoTopo,
  type Estilo,
} from "../texto";
import { DE_BAIXO } from "./fotografia";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DOS TEMAS DE INSPIRAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A parte principal da proposta. Cada tema que ela tem no back office gera a
 * sua página (ou duas, acima de doze fotografias), com TODAS as fotografias,
 * o título, o subtítulo e a nota que ela escreveu. A composição escolhe-se
 * pelo número de fotografias — ver `mosaico.ts`.
 *
 * As páginas de mosaico não têm o rodapé normal: o mosaico de texto leva em
 * baixo o logótipo da Líquen e o número da página.
 */

export interface DadosDoTema {
  /** A vez do tema na proposta: 1, 2, 3… — o número grande do mosaico. */
  numero: number;
  /** «Cerimónia». */
  grupo: string;
  titulo: string;
  subtitulo: string;
  nota: string;
  /** As fotografias DESTA página, pela ordem dela. */
  fotos: readonly Foto[];
  /** O número desta página no documento. */
  pagina: number;
  /**
   * Só para um tema SEM fotografias: uma fotografia de outro tema do capítulo
   * para o painel da esquerda — «nenhuma página é só texto sobre fundo liso».
   */
  painel?: Foto | null;
}

const doisAlgarismos = (n: number) => String(n).padStart(2, "0");

/** O cinzento do número grande: branco a 9% sobre o fundo, já misturado. */
const NUMERO_APAGADO = fio(0.09);

export async function tema(ctx: Contexto, d: DadosDoTema): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const c = composicao(
    d.fotos.map((f) => f.aspecto),
    d.numero % 2 === 0,
  );
  const sobre = `${ctx.te.inspiracao} · ${d.grupo}`;

  if (c.tipo === "texto") {
    const x0 = d.painel ? PAINEL_DO_TEXTO.w + 56 : MARGEM;
    if (d.painel) await fotoNaCaixa(ctx, p, d.painel, PAINEL_DO_TEXTO, {}, LADO_PAGINA);
    paginaDeTexto(ctx, p, d, sobre, x0);
    rodape(ctx, p, d.pagina, x0);
    return p;
  }

  if (c.tipo === "inteira") {
    const t: Tratamento = { degrades: [DE_BAIXO], qualidade: 74 };
    await fotoNaCaixa(ctx, p, d.fotos[0], FOLHA, t, LADO_PAGINA);
    tituloEmBaixo(ctx, p, d, sobre, FOLHA_PX_W - 2 * MARGEM - 120);
    rodape(ctx, p, d.pagina);
    return p;
  }

  await Promise.all(c.celulas.map((caixa, i) => fotoNaCaixa(ctx, p, d.fotos[i] ?? null, caixa)));

  if (c.tipo === "desalinhadas") {
    // O número grande, apagado, em baixo à direita; o título em baixo à esquerda.
    const num: Estilo = {
      letra: ctx.letras.titulo,
      tam: LETRA.mosaicoNumero.tam,
      cor: NUMERO_APAGADO,
    };
    escreverADireita(
      p,
      num,
      doisAlgarismos(d.numero),
      px(FOLHA_PX_W - MARGEM),
      yDoTopo(FUNDO_DO_CONTEUDO),
    );
    tituloEmBaixo(ctx, p, d, sobre, 640);
    rodape(ctx, p, d.pagina);
    return p;
  }

  mosaicoDeTexto(ctx, p, c.mosaico, d, sobre);
  return p;
}

/* ── O mosaico de texto ──────────────────────────────────────────────────── */

/** O enchimento do mosaico: `padding: 34px 30px 22px 34px`. */
const DENTRO = { topo: 34, dir: 30, baixo: 22, esq: 34 };

/**
 * O mosaico de texto, dentro da composição: o número grande apagado no canto,
 * o sobretítulo, o título, o subtítulo, a nota, e em baixo a marca e o número
 * da página.
 *
 * A nota é a parte que ela escreve, e pode ser longa: a letra desce até a nota
 * caber (dos 16,5 px aos 11). Só se nem assim couber é que se corta, com «…»,
 * e o corte vai para o relatório que ela lê antes de enviar.
 */
function mosaicoDeTexto(ctx: Contexto, p: PDFPage, cx: CaixaPx, d: DadosDoTema, sobre: string) {
  rectangulo(p, cx, COR.fundo);
  const x = cx.x + DENTRO.esq;
  const largo = cx.w - DENTRO.esq - DENTRO.dir;
  const num: Estilo = {
    letra: ctx.letras.titulo,
    tam: LETRA.mosaicoNumero.tam,
    cor: NUMERO_APAGADO,
  };
  escreverADireita(
    p,
    num,
    doisAlgarismos(d.numero),
    px(cx.x + cx.w - 20),
    yDoTopo(cx.y + 4) - baseDaLinha(num, 1),
  );

  const topo =
    sobretitulo(ctx, p, sobre, x, cx.y + DENTRO.topo, COR.acento, LETRA.mosaicoSobre.tam) + 12;
  textoDoTema(
    ctx,
    p,
    d,
    x,
    topo,
    largo,
    cx.y + cx.h - DENTRO.baixo - LETRA.mosaicoPe.tam * 1.21 - 14,
  );

  // O pé do mosaico: a marca e o número da página.
  const pe: Estilo = {
    letra: ctx.letras.corpo,
    tam: LETRA.mosaicoPe.tam,
    cor: COR.textoBaixo,
    espaco: LETRA.mosaicoPe.espaco,
  };
  const topoPe = cx.y + cx.h - DENTRO.baixo - pe.tam * 1.21;
  const yPe = yDoTopo(topoPe) - baseDaLinha(pe, 1.21);
  // O logótipo, como no rodapé das outras páginas (o pedido dela).
  if (!logotipoNaLinha(ctx, p, x, yPe, 26)) {
    escrever(p, pe, "LÍQUEN EVENTS", px(x), yPe);
  }
  escreverADireita(p, pe, doisAlgarismos(d.pagina), px(x + largo), yPe);
}

/**
 * O título, o subtítulo e a nota de um tema, a partir de `topo`, sem passar de
 * `fundo`. Devolve onde acabou. É o mesmo texto no mosaico, na página de uma
 * só fotografia e na página sem fotografias.
 */
function textoDoTema(
  ctx: Contexto,
  p: PDFPage,
  d: DadosDoTema,
  x: number,
  topo: number,
  largo: number,
  fundo: number,
  escala = 1,
): number {
  const T = LETRA.mosaicoTitulo;
  const tit = caber(
    { letra: ctx.letras.titulo, tam: T.tam * escala, cor: COR.texto, espaco: -0.01 },
    d.titulo,
    px(largo),
    3,
    22,
  );
  if (tit.cortado) {
    ctx.cortes.push({ where: `Tema «${d.titulo}» · título`, dropped: tit.cortado, unit: "linhas" });
  }
  topo = bloco(p, tit.estilo, tit.linhas, x, topo, T.entrelinha);

  if (d.subtitulo.trim()) {
    const sub: Estilo = {
      letra: ctx.letras.tituloItalico,
      tam: LETRA.mosaicoSub.tam * escala,
      cor: COR.textoSuave,
    };
    const s = caber(sub, d.subtitulo, px(largo), 2, 15);
    topo = bloco(p, s.estilo, s.linhas, x, topo + 6, 1.2);
  }

  const nota = d.nota.trim();
  if (nota) {
    const N = LETRA.mosaicoNota;
    topo += 16;
    const cabem = (tam: number) => Math.max(1, Math.floor((fundo - topo) / (tam * N.entrelinha)));
    let tam = N.tam * escala;
    let r = caber(
      { letra: ctx.letras.tituloItalico, tam, cor: COR.textoSuave },
      nota,
      px(largo),
      cabem(tam),
      tam,
    );
    while (r.cortado && tam > N.minimo) {
      tam -= 0.5;
      r = caber(
        { letra: ctx.letras.tituloItalico, tam, cor: COR.textoSuave },
        nota,
        px(largo),
        cabem(tam),
        tam,
      );
    }
    if (r.cortado) {
      ctx.cortes.push({ where: `Tema «${d.titulo}» · nota`, dropped: r.cortado, unit: "linhas" });
    }
    topo = bloco(p, r.estilo, r.linhas, x, topo, N.entrelinha);
  }
  return topo;
}

/** O título em baixo à esquerda (uma fotografia, ou as cinco desalinhadas). */
function tituloEmBaixo(ctx: Contexto, p: PDFPage, d: DadosDoTema, sobre: string, largo: number) {
  // Mede-se primeiro: o texto assenta por cima do rodapé, e só se sabe a
  // altura depois de partir as linhas.
  const fundo = FUNDO_DO_CONTEUDO - 20;
  const altura = alturaDoTexto(ctx, d, largo, 1.3);
  const topo = Math.max(420, fundo - altura);
  const t = sobretitulo(ctx, p, sobre, MARGEM, topo) + 10;
  textoDoTema(ctx, p, d, MARGEM, t, largo, fundo, 1.3);
}

/** A altura que o texto de um tema vai ocupar (sobretítulo incluído), sem desenhar. */
function alturaDoTexto(ctx: Contexto, d: DadosDoTema, largo: number, escala: number): number {
  const T = LETRA.mosaicoTitulo;
  const tit = caber(
    { letra: ctx.letras.titulo, tam: T.tam * escala, cor: COR.texto },
    d.titulo,
    px(largo),
    3,
    22,
  );
  let h = LETRA.sobretitulo.tam * 1.21 + 10 + tit.linhas.length * tit.estilo.tam * T.entrelinha;
  if (d.subtitulo.trim()) h += 6 + LETRA.mosaicoSub.tam * escala * 1.2;
  if (d.nota.trim()) {
    const N = LETRA.mosaicoNota;
    const n = caber(
      { letra: ctx.letras.tituloItalico, tam: N.tam * escala, cor: COR.textoSuave },
      d.nota.trim(),
      px(largo),
      4,
      N.tam * escala,
    );
    h += 16 + n.linhas.length * n.estilo.tam * N.entrelinha;
  }
  return h;
}

/**
 * Um tema sem fotografias: o texto, sem caixas vazias — e, à esquerda, um
 * painel de fotografia nítida de outro tema do capítulo, como o índice. A
 * regra dela: nenhuma página é só texto sobre fundo liso. Sem fotografia
 * nenhuma na proposta, o texto fica sozinho na página.
 */
const PAINEL_DO_TEXTO = { x: 0, y: 0, w: 440, h: FOLHA_PX_H };

function paginaDeTexto(ctx: Contexto, p: PDFPage, d: DadosDoTema, sobre: string, x0: number) {
  const largo = Math.min(640, FOLHA_PX_W - MARGEM - x0);
  const num: Estilo = {
    letra: ctx.letras.titulo,
    tam: LETRA.mosaicoNumero.tam * 2,
    cor: NUMERO_APAGADO,
  };
  escreverADireita(
    p,
    num,
    doisAlgarismos(d.numero),
    px(FOLHA_PX_W - MARGEM),
    yDoTopo(FUNDO_DO_CONTEUDO),
  );
  const altura = alturaDoTexto(ctx, d, largo, 1.4);
  const topo = Math.max(60, (FUNDO_DO_CONTEUDO - altura) / 2);
  const t = sobretitulo(ctx, p, sobre, x0, topo) + 10;
  textoDoTema(ctx, p, d, x0, t, largo, FUNDO_DO_CONTEUDO - 20, 1.4);
}
