/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DATA CURTA, EM PORTUGUÊS — ESCRITA UMA VEZ, E SEM UM `Date` PELO MEIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «13 ago 2028». É o formato compacto que a casa já usava, e usava-o em duas
 * cópias — no aviso de data ocupada e no «Criar a partir de…». As duas
 * divergiram, e não numa questão de estilo:
 *
 *   · uma fazia `new Date(`${iso}T12:00:00`)` — meio-dia, de propósito;
 *   · a outra fazia `new Date(iso)`, que para «2028-08-13» é MEIA-NOITE UTC.
 *
 * A segunda está a um fuso de distância de mostrar o dia errado. Em Portugal,
 * no horário de verão, meia-noite UTC é 01:00 — ainda o mesmo dia, e por isso
 * nunca se notou. Basta a página ser aberta a oeste de Greenwich para «13 ago»
 * virar «12 ago» no ecrã de quem decide se uma data está livre.
 *
 * ── PORQUE É QUE AQUI NÃO HÁ `Date` NENHUM ───────────────────────────────
 *
 * O meio-dia é uma mitigação: põe o instante longe das duas fronteiras, e
 * funciona. Mas uma data de casamento não é um instante — é um dia escrito
 * «2028-08-13», sem hora e sem fuso. Convertê-la a um instante para a voltar a
 * escrever como dia é atravessar duas vezes um sítio onde se pode perder um
 * dia, para não ganhar nada.
 *
 * Lê-se a cadeia directamente, como o `dataPorExtenso` já fazia. Assim não há
 * fuso que a possa mexer, em máquina nenhuma.
 *
 * ── E OS MESES SÃO UMA TABELA, NÃO O `Intl` ──────────────────────────────
 *
 * MEDIDO: `toLocaleDateString("pt-PT", { month: "short" })` devolve
 * «13/08/2028» no Node dos testes — a construção mínima de ICU não traz os
 * nomes portugueses e cai no formato numérico. No browser devolveria «13 ago».
 * Um formato que muda conforme onde corre não se pode prender num teste, e é
 * exactamente o formato de base de dados que estamos aqui a tirar do ecrã.
 *
 * É a mesma razão pela qual o `proposal-copy` já tem a sua tabela de meses.
 */
const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** «2028-08-13» → «13 ago 2028». */
export function dataCurta(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  // Uma data que não se consegue ler devolve-se TAL E QUAL: esconder o que lá
  // está impede quem olha de perceber porque é que está estranha, e é a
  // diferença entre um dado mau visível e um dado mau mudo.
  if (!m) return iso;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return iso;
  return `${Number(m[3])} ${MESES_CURTOS[mes - 1]} ${m[1]}`;
}
