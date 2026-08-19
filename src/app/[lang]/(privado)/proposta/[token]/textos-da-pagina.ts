import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PALAVRAS QUE SÃO DA PÁGINA, E NÃO DO DOCUMENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Ampliar», «Fechar», «Fotografia 3 de 12». Nada disto existe no documento —
 * são gestos de um ecrã, e um ecrã é coisa que o PDF não tem. O documento tem
 * os seus (`proposal-doc-textos.ts`) e continua a ser de lá que sai tudo o que
 * o casal já leu no papel: os títulos das secções, os rótulos do orçamento, as
 * condições.
 *
 * ── PORQUE É QUE NÃO VIVEM NO DICIONÁRIO DO SÍTIO ─────────────────────────
 *
 * Porque o `getDictionary(locale)` responde na língua do VISITANTE, e esta
 * página segue a língua da PROPOSTA (`idiomaDaProposta` — a decisão está
 * escrita no cabeçalho da `page.tsx` e não se mexe). São dois eixos diferentes
 * com o mesmo nome; misturá-los era convidar o defeito que já cá esteve — a
 * moldura numa língua e o documento noutra, na mesma folha.
 *
 * Estas seguem o documento, e por isso são indexadas por
 * {@link IdiomaDaProposta} e não por `Locale`. O tipo é que o garante.
 */
export interface TextosDaPagina {
  /** O rótulo do botão que abre a fotografia em grande. */
  ampliar: string;
  fechar: string;
  anterior: string;
  seguinte: string;
  /** «Fotografia 3 de 12» — o que o leitor de ecrã anuncia ao mudar de foto. */
  contagem: (i: number, total: number) => string;
  /** A célula que não conseguiu mostrar a fotografia. */
  fotoFalhou: string;
  /** O botão que volta a pedir as assinaturas ao servidor. */
  recarregarFotos: string;
  /** O índice no topo, para se chegar às fotografias sem rolar tudo. */
  nestaPagina: string;
  inspiracao: string;
  /** O aviso de que a galeria não abriu — sem fotografias não há nada a fazer. */
  semFotos: string;
}

const PT: TextosDaPagina = {
  ampliar: "Ampliar",
  fechar: "Fechar",
  anterior: "Fotografia anterior",
  seguinte: "Fotografia seguinte",
  contagem: (i, total) => `Fotografia ${i} de ${total}`,
  fotoFalhou: "Não foi possível mostrar esta fotografia.",
  recarregarFotos: "Voltar a carregar as fotografias",
  nestaPagina: "Nesta página",
  inspiracao: "Inspiração",
  semFotos: "As fotografias desta secção não estão disponíveis neste momento.",
};

const EN: TextosDaPagina = {
  ampliar: "Enlarge",
  fechar: "Close",
  anterior: "Previous photo",
  seguinte: "Next photo",
  contagem: (i, total) => `Photo ${i} of ${total}`,
  fotoFalhou: "This photo could not be shown.",
  recarregarFotos: "Load the photos again",
  nestaPagina: "On this page",
  inspiracao: "Inspiration",
  semFotos: "The photos in this section are not available right now.",
};

export function textosDaPagina(idioma: IdiomaDaProposta): TextosDaPagina {
  return idioma === "en" ? EN : PT;
}
