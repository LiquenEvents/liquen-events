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
  /**
   * «Fotografia 3 de 12» — o que o leitor de ecrã anuncia ao mudar de foto.
   *
   * É um MOLDE com `{i}` e `{n}`, e não uma função, porque isto atravessa a
   * fronteira servidor→cliente: uma função não se serializa, e o React
   * rebentaria a passá-la como propriedade a um Client Component. Ver
   * {@link contar}.
   */
  contagem: string;
  /** A célula que não conseguiu mostrar a fotografia. */
  fotoFalhou: string;
  /**
   * O botão que volta a tentar UMA fotografia — dentro da célula que falhou.
   *
   * Separado do {@link recarregarFotos} de propósito: são duas acções
   * diferentes (uma volta a pedir esta imagem, a outra vai buscar assinaturas
   * novas ao servidor) e enquanto tiveram o mesmo rótulo estavam os dois no
   * ecrã a dizer a mesma coisa, um por cima do outro.
   */
  tentarDeNovo: string;
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
  contagem: "Fotografia {i} de {n}",
  fotoFalhou: "Não foi possível mostrar esta fotografia.",
  tentarDeNovo: "Tentar de novo",
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
  contagem: "Photo {i} of {n}",
  fotoFalhou: "This photo could not be shown.",
  tentarDeNovo: "Try again",
  recarregarFotos: "Load the photos again",
  nestaPagina: "On this page",
  inspiracao: "Inspiration",
  semFotos: "The photos in this section are not available right now.",
};

export function textosDaPagina(idioma: IdiomaDaProposta): TextosDaPagina {
  return idioma === "en" ? EN : PT;
}

/** O molde da contagem preenchido — a única forma de o ler, dos dois lados. */
export function contar(molde: string, i: number, n: number): string {
  return molde.replace("{i}", String(i)).replace("{n}", String(n));
}
