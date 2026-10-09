import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { LADO_PAGINA } from "../imagens";
import {
  FOLHA,
  FUNDO_DO_CONTEUDO,
  cabecalho,
  fotoNaCaixa,
  linha,
  novaPagina,
  rodape,
  sobretitulo,
  type Contexto,
} from "../moldura";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import {
  baseDaLinha,
  bloco,
  caber,
  escrever,
  escreverADireita,
  largura,
  quebrar,
  yDoTopo,
  type Estilo,
} from "../texto";
import { ESCURO_A_ESQUERDA } from "./texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O INVESTIMENTO — o quadro dos serviços e a página do total
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os números são os que o gerador antigo já calcula (`totaisDaProposta`) e
 * escreve (`eurDocumento` + `montanteNaLingua`). Esta página só os arruma:
 * nenhum valor é calculado aqui.
 */

/* ── O quadro ────────────────────────────────────────────────────────────── */

export interface LinhaDoOrcamento {
  nome: string;
  /** «extra», numa linha opcional. */
  marca?: string;
  /** O preço escrito, no modelo de Organização. */
  preco?: string;
}

export interface DadosDoOrcamento {
  titulo: string;
  subtitulo: string;
  linhas: readonly LinhaDoOrcamento[];
  /** O número da primeira linha desta página. */
  primeiro: number;
  painel: Foto | null;
  pagina: number;
}

/** O painel da direita: 400 px; o texto acaba a 456 da borda. */
const PAINEL = 400;
const FIM = FOLHA_PX_W - (PAINEL + 56);
const LARGO = FIM - MARGEM;
const NUMERO = 26 + 18;
const ENCHIMENTO = 15;

const estiloLinha = (ctx: Contexto): Estilo => ({
  letra: ctx.letras.corpo,
  tam: LETRA.linhaOrcamento.tam,
  cor: COR.texto,
});

/** As linhas de um item, partidas à largura que lhe sobra depois do número e da marca. */
function linhasDe(ctx: Contexto, l: LinhaDoOrcamento): string[] {
  const e = estiloLinha(ctx);
  const direita = l.preco || l.marca ? largura(e, l.preco || l.marca || "") + px(16) : 0;
  return quebrar(e, l.nome, px(LARGO - NUMERO) - direita);
}

const alturaDaLinha = (ctx: Contexto, l: LinhaDoOrcamento) =>
  2 * ENCHIMENTO + linhasDe(ctx, l).length * LETRA.linhaOrcamento.tam * 1.21 + 1;

const alturaDoCabecalho = (subtitulo: boolean) =>
  LETRA.sobretitulo.tam * 1.21 +
  10 +
  LETRA.tituloConteudo.tam * LETRA.tituloConteudo.entrelinha +
  (subtitulo ? 4 + LETRA.subtitulo.tam * 1.25 : 0) +
  26;

/** Reparte as linhas pelas páginas — um quadro comprido continua na seguinte. */
export function repartirLinhas(
  ctx: Contexto,
  linhas: readonly LinhaDoOrcamento[],
): LinhaDoOrcamento[][] {
  const cabe = FUNDO_DO_CONTEUDO - 48 - alturaDoCabecalho(true);
  const paginas: LinhaDoOrcamento[][] = [[]];
  let usado = 0;
  for (const l of linhas) {
    const h = alturaDaLinha(ctx, l);
    if (paginas[paginas.length - 1].length && usado + h > cabe) {
      paginas.push([]);
      usado = 0;
    }
    paginas[paginas.length - 1].push(l);
    usado += h;
  }
  return paginas;
}

export async function orcamento(ctx: Contexto, d: DadosDoOrcamento): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(
    ctx,
    p,
    d.painel,
    { x: FOLHA_PX_W - PAINEL, y: 0, w: PAINEL, h: FOLHA_PX_H },
    {},
    LADO_PAGINA,
  );

  const e = estiloLinha(ctx);
  const num: Estilo = {
    letra: ctx.letras.corpoForte,
    tam: LETRA.numeroOrcamento.tam,
    cor: COR.acento,
  };
  const marca: Estilo = { letra: ctx.letras.corpo, tam: 12, cor: COR.textoBaixo };
  const altura =
    alturaDoCabecalho(Boolean(d.subtitulo)) +
    d.linhas.reduce((s, l) => s + alturaDaLinha(ctx, l), 0);
  // Centrado como o `.mid` do exemplo, quando cabe; senão, do topo.
  let topo = Math.max(48, (FUNDO_DO_CONTEUDO - altura) / 2);
  topo =
    cabecalho(ctx, p, {
      sobretitulo: ctx.t.sobretituloOrcamento,
      titulo: d.titulo,
      subtitulo: d.subtitulo || undefined,
      x: MARGEM,
      topo,
      largura: LARGO,
    }) + 26;

  for (const [i, l] of d.linhas.entries()) {
    const linhas = linhasDe(ctx, l);
    const y0 = topo + ENCHIMENTO;
    const base = yDoTopo(y0) - baseDaLinha(e, 1.21);
    // O número, um pouco mais baixo, como o `padding-top: 2px` do exemplo.
    escrever(p, num, String(d.primeiro + i).padStart(2, "0"), px(MARGEM), base - px(1));
    linhas.forEach((ln, k) => {
      escrever(p, e, ln, px(MARGEM + NUMERO), base - px(k * e.tam * 1.21));
    });
    if (l.preco) escreverADireita(p, e, l.preco, px(FIM), base);
    else if (l.marca) escreverADireita(p, marca, l.marca, px(FIM), base);
    topo = y0 + linhas.length * e.tam * 1.21 + ENCHIMENTO;
    linha(p, MARGEM, FIM, topo, 0.2);
    topo += 1;
  }
  rodape(ctx, p, d.pagina, MARGEM, FIM);
  return p;
}

/* ── O total ─────────────────────────────────────────────────────────────── */

export interface DadosDoTotal {
  /** «Total a pagar», ou o rótulo dela quando não há total estruturado. */
  rotulo: string;
  /** «4.501,80 €». */
  valor: string;
  /** «Com IVA incluído.» — só quando o valor é o total a pagar. */
  nota?: string;
  /** Subtotal, adicionais, total sem IVA, IVA. */
  linhas: readonly { rotulo: string; valor: string; forte?: boolean }[];
  /** Sinal e saldo. */
  marcos: readonly { valor: string; texto: string }[];
  /** O que vem depois: a versão sem extras, a nota do orçamento. */
  rodapeDoTotal: readonly string[];
  foto: Foto | null;
  pagina: number;
}

const COLUNA = 560;

export async function total(ctx: Contexto, d: DadosDoTotal): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(ctx, p, d.foto, FOLHA, ESCURO_A_ESQUERDA, LADO_PAGINA);

  const preco = caber(
    { letra: ctx.letras.titulo, tam: LETRA.preco.tam, cor: COR.texto, espaco: -0.02 },
    d.valor,
    px(COLUNA),
    1,
    44,
  );
  const lin: Estilo = { letra: ctx.letras.corpo, tam: LETRA.linhaTotal.tam, cor: COR.texto };
  const linF: Estilo = { ...lin, letra: ctx.letras.corpoForte };
  const marco: Estilo = { letra: ctx.letras.corpoForte, tam: LETRA.marco.tam, cor: COR.texto };
  const marcoT: Estilo = {
    letra: ctx.letras.corpo,
    tam: LETRA.marcoTexto.tam,
    cor: COR.textoSuave,
  };
  const nota: Estilo = { letra: ctx.letras.corpo, tam: 12.5, cor: COR.textoSuave };
  const colMarco = (COLUNA - 18) / 2;
  const textosDosMarcos = d.marcos.map((m) => quebrar(marcoT, m.texto, px(colMarco)));
  const notas = d.rodapeDoTotal.flatMap((t) => quebrar(nota, t, px(COLUNA)));

  const altLinha = 10 + lin.tam * 1.21 + 10 + 1;
  const altura =
    2 * LETRA.sobretitulo.tam * 1.21 +
    24 +
    6 +
    preco.estilo.tam +
    (d.nota ? 6 + 14 * 1.6 : 0) +
    (d.linhas.length ? 26 + d.linhas.length * altLinha : 0) +
    (d.marcos.length
      ? 26 +
        13 +
        marco.tam * 1.2 +
        3 +
        Math.max(...textosDosMarcos.map((l) => l.length)) * marcoT.tam * 1.4
      : 0) +
    (notas.length ? 20 + notas.length * nota.tam * 1.5 : 0);
  let topo = Math.max(48, (FUNDO_DO_CONTEUDO - altura) / 2);

  topo = sobretitulo(ctx, p, ctx.t.sobretituloOrcamento, MARGEM, topo) + 24;
  topo = sobretitulo(ctx, p, d.rotulo, MARGEM, topo, COR.textoBaixo) + 6;
  topo = bloco(p, preco.estilo, preco.linhas, MARGEM, topo, 1);
  if (d.nota) topo = bloco(p, { ...nota, tam: 14 }, [d.nota], MARGEM, topo + 6, 1.6);

  if (d.linhas.length) {
    topo += 26;
    for (const l of d.linhas) {
      const e = l.forte ? linF : lin;
      const y = yDoTopo(topo + 10) - baseDaLinha(e, 1.21);
      escrever(p, e, l.rotulo, px(MARGEM), y);
      escreverADireita(p, e, l.valor, px(MARGEM + COLUNA), y);
      topo += altLinha;
      linha(p, MARGEM, MARGEM + COLUNA, topo - 1, 0.2);
    }
  }

  if (d.marcos.length) {
    topo += 26;
    d.marcos.forEach((m, i) => {
      const x = MARGEM + i * (colMarco + 18);
      linha(p, x, x + colMarco, topo, 0.45);
      const t = bloco(p, marco, [m.valor], x, topo + 13, 1.2);
      bloco(p, marcoT, textosDosMarcos[i], x, t + 3, 1.4);
    });
    topo +=
      13 +
      marco.tam * 1.2 +
      3 +
      Math.max(...textosDosMarcos.map((l) => l.length)) * marcoT.tam * 1.4;
  }

  if (notas.length) bloco(p, nota, notas, MARGEM, topo + 20, 1.5);
  rodape(ctx, p, d.pagina);
  return p;
}
