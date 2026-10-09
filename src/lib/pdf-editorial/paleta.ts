import { rgb, type RGB } from "pdf-lib";
import { PAGINA_W } from "@/lib/proposal-geometria";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS MEDIDAS E AS CORES DO PDF EDITORIAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O exemplo dela («Mafalda & João») foi desenhado em HTML numa folha de
 * 1123 × 794 px — o A4 deitado a 96 ppp. Todas as medidas deste módulo estão
 * escritas EM PÍXEIS DO EXEMPLO e passam a pontos do PDF por {@link px}: assim
 * cada número aqui pode ser comparado de olho com o CSS de
 * `referencia/modelo-html/proposta-exemplo.html`, sem contas de cabeça.
 *
 * O A4 do PDF é o mesmo do gerador antigo (`proposal-geometria.ts`):
 * 841,89 × 595,28 pt. 1123 px × 0,7497 = 841,89 pt.
 */

/** Largura da folha do exemplo, em píxeis CSS. */
export const FOLHA_PX_W = 1123;
/** Altura da folha do exemplo, em píxeis CSS. */
export const FOLHA_PX_H = 794;

/** Pontos do PDF por píxel do exemplo. */
export const PT_POR_PX = PAGINA_W / FOLHA_PX_W;

/** Píxeis do exemplo → pontos do PDF. */
export const px = (n: number): number => n * PT_POR_PX;

/** Margem lateral das páginas de texto (`.pg { padding: 0 98px }`). */
export const MARGEM = 98;

/** O rodapé: a 38 px do fundo, letra de 12 px (`.ft`). */
export const RODAPE = { fundo: 38, tamanho: 12 } as const;

/* ── Cores ───────────────────────────────────────────────────────────────── */

type Hex = `#${string}`;

function hexParaRgb(hex: Hex): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * As cores do exemplo, pelo nome do que fazem.
 *
 * O ACENTO é o dourado do logótipo (#cfb12a) aclarado para o fundo escuro: é o
 * `#d8bd5a` do exemplo dela, e mede 8,8:1 contra o fundo; o `textoBaixo` mede
 * 10,3:1 e o texto principal 14,3:1. Nenhum fica abaixo dos 4,5:1 — e o teste
 * `paleta.test.ts` mede-os, para continuar assim.
 *
 * É o ÚNICO acento. O exemplo tem um segundo dourado, mais claro (#e6d28a), no
 * «&» da capa e nos sobretítulos por cima de fotografia; o documento dela diz
 * «uma cor de destaque, não duas», e é o documento que manda.
 */
export const HEX = {
  fundo: "#1f2022",
  texto: "#f3f0ea",
  textoSuave: "#e2ddd3",
  textoBaixo: "#d2cdc3",
  /** O texto de abertura (`.lead`, `.cover .sub`). */
  textoLead: "#d9d4ca",
  acento: "#d8bd5a",
} as const satisfies Record<string, Hex>;

export const COR = {
  fundo: hexParaRgb(HEX.fundo),
  texto: hexParaRgb(HEX.texto),
  textoSuave: hexParaRgb(HEX.textoSuave),
  textoBaixo: hexParaRgb(HEX.textoBaixo),
  textoLead: hexParaRgb(HEX.textoLead),
  acento: hexParaRgb(HEX.acento),
} as const;

/**
 * Um fio branco com a opacidade do exemplo, JÁ MISTURADO com o fundo.
 *
 * O exemplo desenha os fios com `rgba(255,255,255,.28)`. No PDF isso seria
 * transparência — e transparência é exactamente o que este desenho evita (é ela
 * que dá o «cor-de-rosa» em alguns leitores). A cor que se vê é a mistura do
 * branco com o fundo, e é essa que se pinta, chapada.
 *
 * Sobre uma fotografia escurecida o fundo não é exactamente #1f2022, mas a
 * diferença num fio de meio ponto não se vê.
 */
export function fio(opacidade: number): RGB {
  const base = [0x1f, 0x20, 0x22];
  const [r, g, b] = base.map((c) => (c + (255 - c) * opacidade) / 255);
  return rgb(r, g, b);
}

/**
 * `cor` com a opacidade pedida, já misturada no fundo — para pintar chapado o
 * que o exemplo pinta com `opacity` (o símbolo do rodapé, a 0,8).
 */
export function misturaNoFundo(cor: Hex, opacidade: number): Hex {
  const a = Number.parseInt(cor.slice(1), 16);
  const b = Number.parseInt(HEX.fundo.slice(1), 16);
  const canal = (n: number, s: number) => (n >> s) & 255;
  const m = [16, 8, 0].map((s) =>
    Math.round(canal(b, s) + (canal(a, s) - canal(b, s)) * opacidade)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${m.join("")}`;
}

/* ── Letra ───────────────────────────────────────────────────────────────── */

/**
 * Os tamanhos do exemplo, em píxeis, com o espaçamento entre letras em `em`.
 *
 * Só os que a parte 1 usa. Os do quadro do orçamento e das condições entram com
 * a parte 3.
 */
export const LETRA = {
  /** `.eb` — sobretítulo em maiúsculas, dourado. */
  sobretitulo: { tam: 11.5, espaco: 0.2 },
  /** `h1` — título de página. */
  titulo: { tam: 46, entrelinha: 1.06 },
  /** O título da capa (os nomes). */
  tituloCapa: { tam: 76, entrelinha: 0.98, minimo: 40 },
  /** O «&» entre os nomes, em itálico. */
  eComercial: { tam: 52 },
  /** O título dos separadores («Cerimónia»). */
  tituloSeparador: { tam: 58 },
  /** A frase da página de citação. */
  citacao: { tam: 54, entrelinha: 1.12 },
  /** A frase da contracapa. */
  agradecimento: { tam: 50, entrelinha: 1.1 },
  /** O lema por baixo do logótipo, na contracapa. */
  lema: { tam: 21 },
  /** `.lead`. */
  lead: { tam: 16, entrelinha: 1.6 },
  /** `.meta .k` — rótulo da faixa da capa. */
  metaRotulo: { tam: 10.5, espaco: 0.2 },
  /** `.meta .v` — valor da faixa da capa. */
  metaValor: { tam: 14.5, entrelinha: 1.35 },
  /** `.kf small` — rótulo dos factos. */
  factoRotulo: { tam: 10.5, espaco: 0.18 },
  /** `.kf b` — valor dos factos. */
  factoValor: { tam: 17, entrelinha: 1.25 },
  /** As linhas do índice. */
  indice: { tam: 15 },
  /** O rodapé. */
  rodape: { tam: 12, espaco: 0.02 },
  /** Os contactos da contracapa. */
  contactos: { tam: 13.5, entrelinha: 1.8 },
} as const;
