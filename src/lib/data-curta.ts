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

/**
 * ── O DIA POR EXTENSO, COM O DIA DA SEMANA ───────────────────────────────
 *
 * «sexta-feira, 9 de outubro» — e, com `{ ano: true }`, «… de 2026».
 *
 * Existiam cinco cópias desta frase feitas com `toLocaleDateString` (o
 * Calendário, os Guiões, a Agenda, a Visão Geral, o campo de data), e duas
 * delas punham-lhe `capitalize` por cima. O `text-transform: capitalize`
 * levanta a primeira letra de CADA palavra — MEDIDO no diálogo «Novo no
 * calendário»: «Quinta-Feira, 1 De Outubro De 2026». E o título da vista de
 * dia era montado à mão com os meses dos cabeçalhos: «9 de Outubro 2026», sem
 * o «de» e com o mês em maiúscula, ao lado de uma Visão Geral que dizia
 * «sexta-feira, 9 de outubro».
 *
 * Lê a cadeia directamente, como o `dataCurta` (ver em cima porque é que não
 * passa por um instante nem pelo `Intl`). O dia da semana sai de uma conta em
 * UTC sobre a própria data, que não tem fuso que a mexa.
 *
 * Minúsculas sempre, como se escrevem os dias e os meses em português. Quem
 * a põe no início de uma frase usa `comMaiuscula`.
 */
const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function diaPorExtenso(
  iso?: string | null,
  { ano = false, semana = true }: { ano?: boolean; semana?: boolean } = {},
): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return iso;
  const corpo = `${dia} de ${MESES_LONGOS[mes - 1]}${ano ? ` de ${a}` : ""}`;
  if (!semana) return corpo;
  const nome = DIAS_DA_SEMANA[new Date(Date.UTC(a, mes - 1, dia)).getUTCDay()];
  return `${nome}, ${corpo}`;
}

/** A primeira letra em maiúscula — e SÓ a primeira, ao contrário do CSS. */
export function comMaiuscula(texto: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase("pt-PT") + texto.slice(1) : texto;
}
