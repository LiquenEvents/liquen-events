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

export type Hex = `#${string}`;

export function hexParaRgb(hex: Hex): RGB {
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
 * Cada um diz de onde vem no HTML do exemplo (`referencia/modelo-html/`).
 */
export const LETRA = {
  /** `.eb` — sobretítulo em maiúsculas, dourado. */
  sobretitulo: { tam: 11.5, espaco: 0.2 },
  /** `h1` — título das páginas de texto (índice). */
  titulo: { tam: 46, entrelinha: 1.06 },
  /** O `h1` de 40 px das páginas de conteúdo (serviços, paleta, orçamento, condições). */
  tituloConteudo: { tam: 40, entrelinha: 1.06 },
  /** O `h1` de «A proposta». */
  tituloProposta: { tam: 50, entrelinha: 1.04 },
  /** O subtítulo em itálico por baixo de um `h1` de conteúdo. */
  subtitulo: { tam: 20 },
  /** O título da capa (os nomes). */
  tituloCapa: { tam: 76, entrelinha: 0.98, minimo: 40 },
  /** O «&» entre os nomes, em itálico. */
  eComercial: { tam: 52 },
  /** O título dos separadores («Cerimónia»), a ~72 px como no exemplo novo. */
  tituloSeparador: { tam: 72 },
  /** A frase da página de citação. */
  citacao: { tam: 54, entrelinha: 1.12 },
  /** A frase da contracapa. */
  agradecimento: { tam: 50, entrelinha: 1.1 },
  /** O lema por baixo do logótipo, na contracapa. */
  lema: { tam: 21 },
  /** `.meta .k` — rótulo da faixa da capa. */
  metaRotulo: { tam: 10.5, espaco: 0.2 },
  /** `.meta .v` — valor da faixa da capa. */
  metaValor: { tam: 14.5, entrelinha: 1.35 },
  /** O rótulo dos factos de «A proposta» (um `.eb` de 10 px). */
  factoRotulo: { tam: 10, espaco: 0.2 },
  /** O valor dos factos. */
  factoValor: { tam: 16.5, entrelinha: 1.3 },
  /** As linhas do índice. */
  indice: { tam: 15.5 },
  /** O rodapé. */
  rodape: { tam: 12, espaco: 0.02, marcaEspaco: 0.14 },
  /** Os contactos da contracapa. */
  contactos: { tam: 13.5, entrelinha: 1.8 },

  // ── O mosaico de texto dos temas ──
  mosaicoSobre: { tam: 10.5, espaco: 0.2 },
  mosaicoTitulo: { tam: 33, entrelinha: 1.05 },
  mosaicoSub: { tam: 21 },
  mosaicoNota: { tam: 16.5, entrelinha: 1.4, minimo: 11 },
  mosaicoNumero: { tam: 120 },
  mosaicoPe: { tam: 10.5, espaco: 0.14 },

  // ── Cartões de serviço ──
  cartaoNumero: { tam: 10, espaco: 0.18 },
  cartaoNome: { tam: 14.5, entrelinha: 1.3 },
  cartaoDescricao: { tam: 12, entrelinha: 1.4 },

  // ── Orçamento ──
  linhaOrcamento: { tam: 16 },
  numeroOrcamento: { tam: 13 },
  preco: { tam: 112 },
  linhaTotal: { tam: 15 },
  marco: { tam: 22 },
  marcoTexto: { tam: 12.5, entrelinha: 1.4 },

  // ── Listas das condições (`.sm li`, `h3`) ──
  h3: { tam: 15.5, entrelinha: 1.3 },
  item: { tam: 12.5, entrelinha: 1.5 },
} as const;
