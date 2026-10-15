import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CARLITO_BOLD_TTF_B64, CARLITO_REGULAR_TTF_B64 } from "@/lib/proposal-fonts";
import { LOGO_DARK_PNG_B64 } from "@/lib/proposal-assets";
import type { Guest, Quote } from "./types";
import { eventTagLabel } from "./data";
import { diaPorExtenso } from "@/lib/data-curta";
import {
  CADEIRA,
  cadeiras,
  alargarSala,
  caixaDaSala,
  chaveDoLugar,
  contas,
  dimensoes,
  iniciais,
  nomeDoLugar,
  numerosDosLugares,
  porNomeDaMesa,
  porSentar,
  quemEstaNaMesa,
  reconciliar,
  lerMapa,
  ROTULO_DA_FORMA,
  type MapaDeMesas,
} from "./mapa-de-mesas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MAPA DE MESAS EM PDF — PARA IMPRIMIR, DESCARREGAR E MANDAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A escolha dela (14/10): «Desenho + lista por mesa». Duas coisas na mesma
 * folha, porque servem duas pessoas no dia: quem monta a sala olha para o
 * DESENHO, quem recebe os convidados à porta procura um NOME.
 *
 *   · Página 1, A4 deitada — a sala inteira à escala da folha: as mesas com o
 *     nome e «6/8», as cadeiras com as iniciais de quem lá está, os elementos
 *     (noivos, pista, palco, buffet, bar) com o nome. O título diz de quem é e
 *     quando.
 *   · Páginas seguintes — a lista por mesa, em três colunas: «Mesa 5 — 8
 *     lugares», e cada pessoa no seu lugar. No fim, quem ficou por sentar.
 *
 * As regras são as do ecrã (`mapa-de-mesas.ts`): as mesmas cadeiras, os mesmos
 * nomes («Família Silva 2/4» quando ninguém escreveu o nome da pessoa), a
 * mesma reconciliação com a lista de convidados. Um PDF que contasse de outra
 * maneira era pior do que não haver PDF.
 *
 * As cores são as do horário (`horario-pdf.ts`), tiradas do `tema.css`:
 * verde-escuro da marca para os títulos e as mesas, os sage claros para os
 * fundos, tinta para o texto. A fonte é a Carlito, pela mesma razão de lá: a
 * Helvetica de série rebenta com um nome fora do WinAnsi.
 */

/** A4 deitada. */
const LARGURA = 841.89;
const ALTURA = 595.28;
const MARGEM = 36;

const CONTORNO = hex("#d0e1d4");
const FUNDO = hex("#f5faf6");
const CABECALHO = hex("#e9f2eb");
const MARCA = hex("#39513f");
const TINTA = hex("#2a2620");
const CINZA = hex("#6b665e");
const BRANCO = rgb(1, 1, 1);

function hex(codigo: string) {
  const n = parseInt(codigo.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface MapaParaPdf {
  /** «Ana e Rui». */
  cliente: string;
  /** «Casamento · sábado, 20 de junho de 2027 · Quinta do Lago». */
  detalhe: string;
  mapa: MapaDeMesas;
  lista: readonly Guest[];
}

interface Fontes {
  reg: PDFFont;
  bold: PDFFont;
}

/**
 * As letras que a fonte não tem, trocadas pela letra sem acento.
 *
 * A Carlito escreve o português todo, mas não o vietnamita nem o polaco: um
 * «Nguyễn» saía com um quadrado no meio. Um nome com «e» em vez de «ễ» lê-se;
 * um quadrado num cartão de mesa não. Só quando nem a letra base existe é que
 * fica um «?».
 */
const letrasDaFonte = new WeakMap<PDFFont, Set<number>>();
/** As letras com traço, que a decomposição não separa da letra base. */
const TRACO: Record<string, string> = {
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
  Ŧ: "T",
  ŧ: "t",
};
function seguro(texto: string, fonte: PDFFont): string {
  let tem = letrasDaFonte.get(fonte);
  if (!tem) {
    tem = new Set(fonte.getCharacterSet());
    letrasDaFonte.set(fonte, tem);
  }
  let saida = "";
  for (const ch of texto) {
    const cp = ch.codePointAt(0)!;
    if (tem.has(cp) || /\s/.test(ch)) {
      saida += ch;
      continue;
    }
    const base = (TRACO[ch] ?? ch).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    saida += [...base].every((b) => tem!.has(b.codePointAt(0)!)) ? base : "?";
  }
  return saida;
}

/** Corta um texto para caber numa largura, com reticências. */
function caber(cru: string, fonte: PDFFont, tamanho: number, largura: number): string {
  const texto = seguro(cru, fonte);
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}…`, tamanho) > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Texto centrado num ponto. */
function centrado(
  pagina: PDFPage,
  texto: string,
  cx: number,
  cy: number,
  fonte: PDFFont,
  tamanho: number,
  cor = TINTA,
) {
  texto = seguro(texto, fonte);
  const w = fonte.widthOfTextAtSize(texto, tamanho);
  pagina.drawText(texto, {
    x: cx - w / 2,
    y: cy - tamanho * 0.35,
    size: tamanho,
    font: fonte,
    color: cor,
  });
}

/** Ordem das mesas na lista: «Mesa 2» antes de «Mesa 10». */
const porNome = porNomeDaMesa;

export async function mapaDeMesasEmPdf(dados: MapaParaPdf): Promise<Uint8Array | null> {
  const mapa = reconciliar(dados.mapa, dados.lista);
  if (mapa.mesas.length === 0) return null;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const carlito = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const fontes: Fontes = {
    reg: await carlito(CARLITO_REGULAR_TTF_B64),
    bold: await carlito(CARLITO_BOLD_TTF_B64),
  };
  const marca = await pdf.embedPng(Buffer.from(LOGO_DARK_PNG_B64, "base64"));
  pdf.setTitle(`Mapa de mesas — ${dados.cliente}`);
  pdf.setAuthor("Líquen Events");

  desenharSala(pdf.addPage([LARGURA, ALTURA]), dados, mapa, fontes, marca);
  listaPorMesa(pdf, dados, mapa, fontes);

  // O rodapé, com o número de cada página, depois de se saber quantas são.
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const texto = `Líquen Events · Mapa de mesas · ${dados.cliente} · página ${i + 1} de ${paginas.length}`;
    centrado(p, texto, LARGURA / 2, 20, fontes.reg, 8, CINZA);
  });

  return pdf.save();
}

function cabecalho(
  pagina: PDFPage,
  dados: MapaParaPdf,
  titulo: string,
  fontes: Fontes,
  marca: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
  direita?: string,
): number {
  let x = MARGEM;
  if (marca) {
    const largura = 64;
    const altura = marca.height * (largura / marca.width);
    pagina.drawImage(marca, { x, y: ALTURA - MARGEM - altura + 4, width: largura, height: altura });
    x += largura + 16;
  }
  pagina.drawText(titulo, {
    x,
    y: ALTURA - MARGEM - 12,
    size: 17,
    font: fontes.bold,
    color: MARCA,
  });
  pagina.drawText(
    caber(
      `${dados.cliente}${dados.detalhe ? ` · ${dados.detalhe}` : ""}`,
      fontes.reg,
      10,
      LARGURA - x - MARGEM - 160,
    ),
    {
      x,
      y: ALTURA - MARGEM - 28,
      size: 10,
      font: fontes.reg,
      color: TINTA,
    },
  );
  if (direita) {
    const w = fontes.bold.widthOfTextAtSize(direita, 10);
    pagina.drawText(direita, {
      x: LARGURA - MARGEM - w,
      y: ALTURA - MARGEM - 12,
      size: 10,
      font: fontes.bold,
      color: MARCA,
    });
  }
  const base = ALTURA - MARGEM - 42;
  pagina.drawLine({
    start: { x: MARGEM, y: base },
    end: { x: LARGURA - MARGEM, y: base },
    thickness: 0.6,
    color: CONTORNO,
  });
  return base;
}

/** A página do desenho: a sala inteira, à escala da folha. */
function desenharSala(
  pagina: PDFPage,
  dados: MapaParaPdf,
  mapa: MapaDeMesas,
  fontes: Fontes,
  marca: Awaited<ReturnType<PDFDocument["embedPng"]>>,
) {
  const c = contas(mapa, dados.lista);
  const numeros = numerosDosLugares(mapa);
  const topo =
    cabecalho(pagina, dados, "Mapa de mesas", fontes, marca, `Sentados ${c.sentados}/${c.total}`) -
    14;
  const chao = 40;
  const largura = LARGURA - MARGEM * 2;
  const altura = topo - chao;
  // No máximo 0,35 pt por cm: uma mesa sozinha não enche a folha (14/10).
  const sala = alargarSala(caixaDaSala(mapa), largura / 0.35, altura / 0.35);
  const s = Math.min(largura / sala.largura, altura / sala.altura);
  // A sala ao centro da área livre.
  const x0 = MARGEM + (largura - sala.largura * s) / 2;
  const y0 = topo - (altura - sala.altura * s) / 2;
  const px = (x: number) => x0 + (x - sala.x) * s;
  const py = (y: number) => y0 - (y - sala.y) * s;

  pagina.drawRectangle({
    x: px(sala.x),
    y: py(sala.y + sala.altura),
    width: sala.largura * s,
    height: sala.altura * s,
    color: FUNDO,
    borderColor: CONTORNO,
    borderWidth: 0.6,
  });

  for (const el of mapa.elementos) {
    pagina.drawRectangle({
      x: px(el.x - el.largura / 2),
      y: py(el.y + el.altura / 2),
      width: el.largura * s,
      height: el.altura * s,
      color: el.tipo === "noivos" ? CABECALHO : BRANCO,
      borderColor: MARCA,
      borderWidth: 0.7,
      ...(el.tipo === "pista" ? { borderDashArray: [4, 3] } : {}),
    });
    const tamanho = Math.max(6, Math.min(11, el.altura * s * 0.3));
    centrado(
      pagina,
      caber(el.nome.toUpperCase(), fontes.bold, tamanho, el.largura * s - 6),
      px(el.x),
      py(el.y),
      fontes.bold,
      tamanho,
      MARCA,
    );
  }

  for (const mesa of mapa.mesas) {
    const d = dimensoes(mesa);
    if (mesa.forma === "redonda") {
      pagina.drawCircle({
        x: px(mesa.x),
        y: py(mesa.y),
        size: (d.largura / 2) * s,
        color: BRANCO,
        borderColor: MARCA,
        borderWidth: 0.9,
      });
    } else {
      pagina.drawRectangle({
        x: px(mesa.x - d.largura / 2),
        y: py(mesa.y + d.altura / 2),
        width: d.largura * s,
        height: d.altura * s,
        color: BRANCO,
        borderColor: MARCA,
        borderWidth: 0.9,
      });
    }
    const cs = cadeiras(mesa);
    const ocupados = cs.filter((x) => mapa.lugares[chaveDoLugar(mesa.id, x.lugar)]).length;
    const menor = Math.min(d.largura, d.altura) * s;
    const tamanho = Math.max(5, Math.min(11, menor * 0.22));
    centrado(
      pagina,
      caber(mesa.nome, fontes.bold, tamanho, d.largura * s - 4),
      px(mesa.x),
      py(mesa.y) + tamanho * 0.45,
      fontes.bold,
      tamanho,
      TINTA,
    );
    centrado(
      pagina,
      `${ocupados}/${mesa.lugares}`,
      px(mesa.x),
      py(mesa.y) - tamanho * 0.75,
      fontes.reg,
      tamanho * 0.75,
      CINZA,
    );
    const raio = (CADEIRA / 2) * s;
    // O número do lugar (único na sala) e, por baixo, as iniciais — o pedido
    // dela de 15/10, para duas «Mariana» não serem a mesma «MA». Numa sala tão
    // grande que as duas linhas não cabem, fica só o número: é ele que
    // desfaz a dúvida, e o nome está na lista.
    const duasLinhas = raio >= 5.5;
    const tamNumero = Math.max(3.5, Math.min(6.5, raio * (duasLinhas ? 0.8 : 1)));
    const tamIniciais = Math.max(3, Math.min(5, raio * 0.6));
    for (const cad of cs) {
      const chave = chaveDoLugar(mesa.id, cad.lugar);
      const oc = mapa.lugares[chave];
      const numero = String(numeros.get(chave) ?? "");
      pagina.drawCircle({
        x: px(cad.x),
        y: py(cad.y),
        size: raio,
        color: oc ? CABECALHO : BRANCO,
        borderColor: oc ? MARCA : CONTORNO,
        borderWidth: 0.6,
        ...(oc ? {} : { borderDashArray: [1.5, 1.5] }),
      });
      if (oc && duasLinhas) {
        centrado(pagina, numero, px(cad.x), py(cad.y) + raio * 0.3, fontes.bold, tamNumero, MARCA);
        centrado(
          pagina,
          iniciais(nomeDoLugar(oc, dados.lista)),
          px(cad.x),
          py(cad.y) - raio * 0.42,
          fontes.reg,
          tamIniciais,
          MARCA,
        );
      } else {
        centrado(pagina, numero, px(cad.x), py(cad.y), fontes.bold, tamNumero, oc ? MARCA : CINZA);
      }
    }
  }
}

/** As páginas da lista: três colunas, cada mesa com quem lá está. */
function listaPorMesa(pdf: PDFDocument, dados: MapaParaPdf, mapa: MapaDeMesas, fontes: Fontes) {
  const COLUNAS = 3;
  const intervalo = 18;
  const larguraDaColuna = (LARGURA - MARGEM * 2 - intervalo * (COLUNAS - 1)) / COLUNAS;
  const chao = 40;
  const linha = 12.5;

  let pagina: PDFPage | null = null;
  let topoDaPagina = 0;
  let coluna = 0;
  let y = 0;

  const novaPagina = () => {
    pagina = pdf.addPage([LARGURA, ALTURA]);
    topoDaPagina =
      cabecalho(pagina, dados, "Lista por mesa", fontes, null, "N.º = o lugar no desenho") - 18;
    coluna = 0;
    y = topoDaPagina;
  };
  const xDaColuna = () => MARGEM + coluna * (larguraDaColuna + intervalo);
  /** Garante que cabem `altura` pontos; senão passa de coluna (ou de página). */
  const garantir = (altura: number) => {
    if (!pagina) novaPagina();
    if (y - altura < chao) {
      coluna += 1;
      y = topoDaPagina;
      if (coluna >= COLUNAS) novaPagina();
    }
  };

  const bloco = (
    titulo: string,
    sub: string,
    linhas: { n: string; texto: string; livre?: boolean }[],
  ) => {
    const altura = 20 + linhas.length * linha + 12;
    // Uma mesa não se parte entre colunas, se couber inteira numa.
    garantir(Math.min(altura, topoDaPagina - chao));
    const p = pagina as unknown as PDFPage;
    const x = xDaColuna();
    p.drawRectangle({ x, y: y - 17, width: larguraDaColuna, height: 17, color: CABECALHO });
    p.drawText(caber(titulo, fontes.bold, 10, larguraDaColuna - 70), {
      x: x + 6,
      y: y - 12,
      size: 10,
      font: fontes.bold,
      color: MARCA,
    });
    const w = fontes.reg.widthOfTextAtSize(sub, 8);
    p.drawText(sub, {
      x: x + larguraDaColuna - 6 - w,
      y: y - 12,
      size: 8,
      font: fontes.reg,
      color: CINZA,
    });
    y -= 20;
    for (const l of linhas) {
      garantir(linha);
      const pg = pagina as unknown as PDFPage;
      const xc = xDaColuna();
      pg.drawText(l.n, { x: xc + 6, y: y - 9, size: 8, font: fontes.reg, color: CINZA });
      pg.drawText(caber(l.texto, fontes.reg, 9.5, larguraDaColuna - 30), {
        x: xc + 24,
        y: y - 9,
        size: 9.5,
        font: fontes.reg,
        color: l.livre ? CINZA : TINTA,
      });
      y -= linha;
    }
    y -= 12;
  };

  const numeros = numerosDosLugares(mapa);
  for (const mesa of [...mapa.mesas].sort(porNome)) {
    const lugares = quemEstaNaMesa(mapa, mesa);
    const sentados = lugares.filter((l) => l.ocupante).length;
    bloco(
      mesa.nome,
      `${ROTULO_DA_FORMA[mesa.forma].toLowerCase()} · ${sentados}/${mesa.lugares}`,
      lugares.map((l) => ({
        // O MESMO número que a cadeira tem no desenho (único na sala).
        n: String(numeros.get(l.chave) ?? l.lugar + 1),
        texto: l.ocupante ? nomeDoLugar(l.ocupante, dados.lista) : "livre",
        livre: !l.ocupante,
      })),
    );
  }

  // Quem ficou por sentar, agrupado como na lista de espera do ecrã.
  const faltam = new Map<string, { nome: string; n: number }>();
  for (const p of porSentar(mapa, dados.lista)) {
    const g = faltam.get(p.convidadoId) ?? { nome: p.grupo, n: 0 };
    g.n += 1;
    faltam.set(p.convidadoId, g);
  }
  if (faltam.size > 0) {
    const total = [...faltam.values()].reduce((s, g) => s + g.n, 0);
    bloco(
      "Por sentar",
      `${total} ${total === 1 ? "pessoa" : "pessoas"}`,
      // Sem número: quem não está sentado não tem lugar, e um «1» aqui
      // confundia-se com o lugar 1 do desenho.
      [...faltam.values()].map((g) => ({
        n: "",
        texto: g.n > 1 ? `${g.nome} (${g.n})` : g.nome,
      })),
    );
  }
}

/**
 * O nome do ficheiro: o que ela vê na pasta das transferências, sem acentos nem
 * espaços (um «ã» num `Content-Disposition` chega partido a metade dos browsers).
 */
export function nomeDoFicheiroDoMapa(
  cliente: string | undefined,
  data: string | undefined,
): string {
  const limpo = (cliente ?? "evento")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return `mapa-de-mesas-${limpo || "evento"}${data ? `-${data}` : ""}.pdf`;
}

/**
 * O PDF do mapa de um pedido — o mesmo para descarregar, imprimir e mandar por
 * email. `null` quando o mapa ainda não tem mesas: uma folha em branco parecia
 * um defeito.
 */
export async function pdfDoMapa(q: Quote): Promise<{ bytes: Uint8Array; ficheiro: string } | null> {
  const bytes = await mapaDeMesasEmPdf({
    cliente: q.name || "Evento",
    detalhe: [eventTagLabel(q), diaPorExtenso(q.date, { ano: true }), q.location]
      .filter(Boolean)
      .join(" · "),
    mapa: lerMapa(q.mapaDeMesas),
    lista: q.guestList ?? [],
  });
  if (!bytes) return null;
  return { bytes, ficheiro: nomeDoFicheiroDoMapa(q.name, q.date) };
}
