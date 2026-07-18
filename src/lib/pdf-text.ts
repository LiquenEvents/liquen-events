import "server-only";

/**
 * Sanitização de texto para os PDFs desenhados com `StandardFonts` do pdf-lib.
 *
 * As fontes-padrão (Helvetica, Times…) usam a codificação WinAnsi (CP1252):
 * `page.drawText` (e `widthOfTextAtSize`) LANÇAM em qualquer caráter que o
 * WinAnsi não saiba codificar — emoji, alfabetos não-latinos, símbolos raros.
 * Como o nome do cliente, as notas e afins são texto FORNECIDO pelo cliente, um
 * único nome com emoji faria o PDF/​email rebentar (500) — deixando a linha do
 * livro escrita mas sem documento gerado.
 *
 * `winAnsiSafe` percorre a string e mantém apenas o que o WinAnsi codifica,
 * substituindo o resto por "?". Nunca lança. Acentos portugueses (à, ç, õ…)
 * vivem em Latin-1 (0xA0–0xFF) e passam intactos; números e datas formatados
 * (dígitos, "€", "·", "—") também são todos codificáveis, por isso ficam iguais.
 */

// Pontuação tipográfica do CP1252 no bloco 0x80–0x9F (aspas curvas, travessões,
// reticências, €, ™…). São os únicos pontos acima de 0x7F fora de Latin-1 que o
// WinAnsi codifica; tudo o resto nesse bloco é indefinido.
const WINANSI_EXTRA: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** Substitui por "?" qualquer caráter que o WinAnsi (CP1252) não codifique. */
export function winAnsiSafe(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    const ok =
      (cp >= 0x20 && cp <= 0x7e) || // ASCII imprimível
      (cp >= 0xa0 && cp <= 0xff) || // Latin-1 (acentos PT incluídos)
      WINANSI_EXTRA.has(cp); // pontuação tipográfica do CP1252
    out += ok ? ch : "?";
  }
  return out;
}
