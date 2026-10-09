import "server-only";
import type { PDFPage } from "pdf-lib";
import { SITE } from "@/lib/site";
import { PAGINA_H } from "@/lib/proposal-geometria";
import type { Foto } from "../fotos";
import { LADO_PAGINA, type Sombra, type Tratamento } from "../imagens";
import { FOLHA, fotoNaCaixa, linha, novaPagina, sobretitulo, type Contexto } from "../moldura";
import { COR, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import {
  baseDaLinha,
  bloco,
  caber,
  escrever,
  largura,
  maiusculas,
  quebrar,
  yDoTopo,
  type Estilo,
} from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPA E CONTRACAPA — a mesma composição, abrir e fechar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Como no exemplo: uma fotografia a cobrir a folha, escurecida SÓ DO LADO
 * ESQUERDO, onde está o texto; outra num painel alto à direita, com sombra.
 *
 * O fundo é NÍTIDO. Esteve desfocado, e ela viu-o assim: «uma fotografia
 * pequena, ampliada e desfocada». A fotografia de fundo é a de MAIOR
 * resolução que serve para a página — ver `montar.ts`, que a escolhe —, e o
 * painel é a segunda fotografia de capa que ela já escolhe hoje.
 *
 * A contracapa repete a composição: o documento fecha com a imagem com que
 * abriu (e, por isso, com as mesmas duas imagens no ficheiro, não quatro).
 */

/** O painel do exemplo: 300 px de largura, de 70 px do topo a 70 px do fundo. */
const PAINEL = { x: FOLHA_PX_W - MARGEM - 300, y: 70, w: 300, h: 794 - 140 } as const;

const SOMBRA: Sombra = { ...PAINEL, desfoque: 60, desce: 30, opacidade: 0.45 };

/** A caixa do logótipo (`150 × 88`, `contain`). */
const LOGO = { w: 150, h: 88 } as const;

/** O fundo: a foto nítida, escura à esquerda, limpa à direita, com a sombra do painel. */
const FUNDO: Tratamento = {
  sombra: SOMBRA,
  degrades: [
    {
      de: [0, 0],
      para: [1, 0],
      paragens: [
        { em: 0, cobre: 0.84 },
        { em: 0.42, cobre: 0.62 },
        { em: 0.68, cobre: 0.12 },
        { em: 1, cobre: 0 },
      ],
    },
  ],
};

async function fundoEPainel(
  ctx: Contexto,
  pagina: PDFPage,
  fundo: Foto | null,
  painel: Foto | null,
) {
  await fotoNaCaixa(ctx, pagina, fundo, FOLHA, FUNDO, LADO_PAGINA);
  await fotoNaCaixa(ctx, pagina, painel, PAINEL, { qualidade: 78 }, LADO_PAGINA, 2.2);
}

/** O logótipo dentro da caixa do exemplo, centrado como o `contain`. */
function logotipo(ctx: Contexto, pagina: PDFPage, xPx: number, topoPx: number): void {
  if (!ctx.logo) return;
  const k = Math.min(LOGO.w / ctx.logo.width, LOGO.h / ctx.logo.height);
  const w = ctx.logo.width * k;
  const h = ctx.logo.height * k;
  pagina.drawImage(ctx.logo, {
    x: px(xPx),
    y: PAGINA_H - px(topoPx + (LOGO.h + h) / 2),
    width: px(w),
    height: px(h),
  });
}

/* ── Capa ────────────────────────────────────────────────────────────────── */

export interface DadosDaCapa {
  /** «Proposta · Decoração». */
  sobretitulo: string;
  /** «Mafalda Santos & João Barros e Cunha». */
  nomes: string;
  /** Rótulo e valor de cada campo da faixa de baixo; vazios não aparecem. */
  faixa: readonly { rotulo: string; valor: string }[];
  fundo: Foto | null;
  painel: Foto | null;
}

/** O texto da capa ocupa 560 px, como no exemplo. */
const LARGURA_TEXTO = 560;

export async function capa(ctx: Contexto, d: DadosDaCapa): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoEPainel(ctx, p, d.fundo, d.painel);
  logotipo(ctx, p, MARGEM, 78);

  const topoSobre = 78 + LOGO.h + 120;
  const fimSobre = sobretitulo(ctx, p, d.sobretitulo, MARGEM, topoSobre);
  nomesDoCasal(ctx, p, d.nomes, fimSobre + 14);
  faixa(ctx, p, d.faixa);
  return p;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS NOMES — com o «&» em itálico dourado, a abrir a segunda linha
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O primeiro nome numa linha; o «&» a começar a seguinte, menor e em itálico,
 * seguido do segundo nome. Se não couberem em quatro linhas a 76 px, a letra
 * desce até caberem (nunca abaixo dos 40). A faixa de baixo nunca é tapada:
 * quatro linhas a 76 px acabam 20 px acima dela.
 */
function nomesDoCasal(ctx: Contexto, p: PDFPage, nomes: string, topoPx: number): void {
  const L = LETRA.tituloCapa;
  const base: Estilo = { letra: ctx.letras.titulo, tam: L.tam, cor: COR.texto, espaco: -0.01 };
  const partes = nomes
    .split("&")
    .map((s) => s.trim())
    .filter(Boolean);
  const max = px(LARGURA_TEXTO);
  const MAX_LINHAS = 4;

  if (partes.length !== 2) {
    const { estilo, linhas, cortado } = caber(base, nomes, max, MAX_LINHAS, L.minimo);
    if (cortado) ctx.cortes.push({ where: "Capa · nomes", dropped: cortado, unit: "linhas" });
    bloco(p, estilo, linhas, MARGEM, topoPx, L.entrelinha);
    return;
  }

  const [um, dois] = partes;
  for (let tam = L.tam; tam >= L.minimo; tam -= 0.5) {
    const e: Estilo = { ...base, tam };
    const amp: Estilo = {
      letra: ctx.letras.tituloItalico,
      tam: (tam * LETRA.eComercial.tam) / L.tam,
      cor: COR.acento,
    };
    const recuo = largura(amp, "&") + largura(e, " ");
    const linhasUm = quebrar(e, um, max);
    // A primeira linha do segundo nome é mais curta: tem o «&» à frente.
    const linhasDois = quebrarComRecuo(e, dois, max, recuo);
    const total = linhasUm.length + linhasDois.length;
    const ultimo = tam - 0.5 < L.minimo;
    if (total > MAX_LINHAS && !ultimo) continue;

    const alt = tam * L.entrelinha;
    const baseL = baseDaLinha(e, L.entrelinha);
    let topo = topoPx;
    const desenhar = (linhas: string[], primeiraComAmp: boolean) => {
      linhas.forEach((l, i) => {
        const y = yDoTopo(topo) - baseL;
        let x = px(MARGEM);
        if (primeiraComAmp && i === 0) {
          escrever(p, amp, "&", x, y);
          x += recuo;
        }
        escrever(p, e, l, x, y);
        topo += alt;
      });
    };
    const cabem = Math.max(1, MAX_LINHAS - Math.min(linhasUm.length, MAX_LINHAS - 1));
    desenhar(linhasUm.slice(0, MAX_LINHAS - 1), false);
    desenhar(linhasDois.slice(0, cabem), true);
    const fora =
      Math.max(0, linhasUm.length - (MAX_LINHAS - 1)) + Math.max(0, linhasDois.length - cabem);
    if (fora) ctx.cortes.push({ where: "Capa · nomes", dropped: fora, unit: "linhas" });
    return;
  }
}

/** Quebra com a primeira linha `recuo` pontos mais curta. */
function quebrarComRecuo(e: Estilo, texto: string, max: number, recuo: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let linha = "";
  for (const w of palavras) {
    const teste = linha ? `${linha} ${w}` : w;
    const lim = linhas.length === 0 ? max - recuo : max;
    if (linha && largura(e, teste) > lim) {
      linhas.push(linha);
      linha = w;
    } else {
      linha = teste;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

/**
 * A faixa dos dados (`.meta`): um fio, e por baixo rótulo e valor em colunas
 * com 40 px entre elas, assente a 70 px do fundo.
 *
 * Os valores não partem linha (`white-space: nowrap`): se a faixa não couber
 * nos 560 px, o último valor encolhe com «…» — é quase sempre o local, e o
 * local inteiro está na página seguinte.
 */
function faixa(ctx: Contexto, p: PDFPage, campos: DadosDaCapa["faixa"]): void {
  const visiveis = campos.filter((c) => c.valor.trim());
  if (!visiveis.length) return;
  const rot: Estilo = {
    letra: ctx.letras.corpoForte,
    tam: LETRA.metaRotulo.tam,
    cor: COR.acento,
    espaco: LETRA.metaRotulo.espaco,
  };
  const val: Estilo = { letra: ctx.letras.corpoForte, tam: LETRA.metaValor.tam, cor: COR.texto };
  const altRot = rot.tam * 1.21;
  const altVal = val.tam * LETRA.metaValor.entrelinha;
  const altura = 1 + 20 + altRot + 9 + altVal;
  const topo = 794 - 70 - altura;
  linha(p, MARGEM, MARGEM + LARGURA_TEXTO, topo, 0.4);

  let x = px(MARGEM);
  const fim = px(MARGEM + LARGURA_TEXTO);
  const yRot = yDoTopo(topo + 21) - baseDaLinha(rot, 1.21);
  const yVal = yDoTopo(topo + 21 + altRot + 9) - baseDaLinha(val, LETRA.metaValor.entrelinha);
  for (const [i, c] of visiveis.entries()) {
    const r = maiusculas(c.rotulo);
    let v = c.valor.trim();
    const ultimo = i === visiveis.length - 1;
    const livre = fim - x;
    if (ultimo && largura(val, v) > livre) {
      while (v.length > 1 && largura(val, `${v}…`) > livre) v = v.slice(0, -1);
      v = `${v.trimEnd()}…`;
    }
    escrever(p, rot, r, x, yRot);
    escrever(p, val, v, x, yVal);
    x += Math.max(largura(rot, r), largura(val, v)) + px(40);
    if (x >= fim) break;
  }
}

/* ── Contracapa ──────────────────────────────────────────────────────────── */

export interface DadosDaContracapa {
  /** «OBRIGADA». */
  sobretitulo: string;
  /** «Por nos deixarem fazer parte deste momento.» */
  agradecimento: string;
  /** «Decoramos eventos, eternizamos memórias.» */
  lema: string;
  /** «Esta proposta é válida até 27 de novembro de 2026.» */
  validade: string;
  fundo: Foto | null;
  painel: Foto | null;
}

export async function contracapa(ctx: Contexto, d: DadosDaContracapa): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoEPainel(ctx, p, d.fundo, d.painel);
  const largura = 520;
  let topo = sobretitulo(ctx, p, d.sobretitulo, MARGEM, 150) + 16;

  const ag = LETRA.agradecimento;
  const frase: Estilo = { letra: ctx.letras.tituloItalico, tam: ag.tam, cor: COR.texto };
  const { estilo, linhas } = caber(frase, d.agradecimento, px(largura), 3, 34);
  topo = bloco(p, estilo, linhas, MARGEM, topo, ag.entrelinha);

  topo += 56;
  logotipo(ctx, p, MARGEM, topo);
  topo += LOGO.h + 16;

  const lema: Estilo = {
    letra: ctx.letras.tituloItalico,
    tam: LETRA.lema.tam,
    cor: COR.textoSuave,
  };
  topo = bloco(p, lema, quebrar(lema, d.lema, px(largura)), MARGEM, topo, 1.3) + 36;

  const c = LETRA.contactos;
  const contactos: Estilo = { letra: ctx.letras.corpo, tam: c.tam, cor: COR.textoSuave };
  const linhasContacto = [
    `${SITE.email} · ${SITE.phoneDisplay}`,
    ...quebrar(contactos, d.validade, px(largura)),
  ];
  bloco(p, contactos, linhasContacto, MARGEM, topo, c.entrelinha);
  return p;
}
