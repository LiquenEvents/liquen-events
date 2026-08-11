/**
 * Fonte única para a matemática e a formatação de valores monetários.
 *
 * Módulo *client-safe* de propósito: NÃO importa `server-only`, `./repository`,
 * `fs` nem nada exclusivo do Node. Assim tanto os componentes de cliente
 * (ex.: Faturas.tsx) como o código de servidor (invoices-store, rotas, PDFs)
 * partilham exactamente as mesmas funções — sem cópias que possam divergir.
 *
 * Mesmo padrão de `inventory-types.ts` (client-safe) re-exportado por
 * `inventory-store.ts` (server-only).
 */

/**
 * Arredonda um valor aos cêntimos (2 casas decimais), com o meio cêntimo a
 * subir — que é a regra do arredondamento comercial e a que a factura assume.
 *
 * ── PORQUE É QUE ISTO NÃO É `Math.round(n * 100) / 100` ────────────────────
 * Era. E `Math.round(1.005 * 100) / 100` dá 1,00, não 1,01. Não é um erro do
 * `Math.round`: é que 1,005 NÃO EXISTE em vírgula flutuante — o número que lá
 * está é 1,00499999999999989, e esse arredonda mesmo para baixo. O mesmo
 * acontece com 2,675, com 8,615 e com qualquer valor cujo terceiro decimal
 * seja um 5 exacto, que é precisamente o que sai de multiplicar uma base por
 * uma taxa de IVA.
 *
 * Um IVA de 1,005 € facturado como 1,00 € é um cêntimo a menos entregue ao
 * Estado, e uma factura em que as parcelas não fecham o total é uma conversa
 * com o contabilista. Por isso empurra-se o valor uma fracção infinitesimal
 * para longe do zero antes de arredondar: o empurrão (quatro épsilons
 * relativos, ~1e-13 do valor) é maior do que o erro de representação e muito
 * menor do que meio cêntimo, por isso só muda o resultado nos casos que
 * ESTAVAM a cair para o lado errado.
 *
 * Nos negativos o empurrão vai para baixo, para o meio cêntimo se afastar do
 * zero dos dois lados (−1,005 → −1,01). Uma margem negativa arredonda como o
 * seu simétrico.
 */
export function round2(n: number): number {
  const emCentimos = n * 100;
  const empurrao = Math.abs(emCentimos) * Number.EPSILON * 4;
  return Math.round(emCentimos + (emCentimos < 0 ? -empurrao : empurrao)) / 100;
}

/**
 * A percentagem de sinal da casa, quando a proposta não diz outra coisa.
 *
 * Era uma constante escondida dentro de `splitThirtySeventy` e dentro de um
 * `sinal / 3 * 7` numa rota de facturas. Passa a ter nome, para os sítios que
 * a usam poderem ser encontrados.
 */
export const SINAL_POR_OMISSAO = 30;

/**
 * Divide o total de um evento no sinal e no saldo, arredondados aos cêntimos.
 *
 * O saldo é obtido por SUBTRACÇÃO e não por `total × (100−pct)`: assim as duas
 * parcelas somam sempre exactamente o total, mesmo quando o arredondamento do
 * sinal come um cêntimo. Uma factura em que as parcelas não fecham o total é
 * uma conversa com o contabilista.
 */
export function splitSinal(
  total: number,
  percentagem: number = SINAL_POR_OMISSAO,
): { sinal: number; saldo: number } {
  const t = round2(Math.max(0, total));
  const pct = Math.min(100, Math.max(0, percentagem));
  // `round2` e não um `Math.round` escrito à mão: o meio cêntimo tem de subir
  // aqui exactamente como sobe em todo o resto do dinheiro. Enquanto foram
  // duas contas diferentes, o sinal que o estúdio mostrava e o IVA que a
  // factura calculava podiam arredondar para lados opostos no mesmo valor.
  const sinal = round2(t * (pct / 100));
  const saldo = round2(t - sinal);
  return { sinal, saldo };
}

/**
 * O saldo a partir do SINAL JÁ FACTURADO, quando não há proposta para o
 * confirmar.
 *
 * Generaliza o `sinal / 3 × 7` que estava escrito à mão em
 * `/api/faturas/[id]` — com 30% dá exactamente o mesmo número. Existe porque,
 * assim que a percentagem passa a ser configurável, `/3×7` deixa de ser uma
 * simplificação e passa a ser uma conta errada.
 *
 * ── O QUE ESTA CONTA NÃO CONSEGUE SABER ────────────────────────────────────
 * O sinal já foi arredondado quando foi facturado, e este arredondamento
 * é AMPLIFICADO pela reconstrução na proporção `(100−pct)/pct`. Aos 30% da
 * casa o factor é 7/3 e o desvio máximo é pouco mais de um cêntimo — foi por
 * isso que ninguém deu por ele durante anos. A 1%, o factor é 99 e meio
 * cêntimo escondido no sinal torna-se cerca de meio EURO no saldo.
 *
 * Não há maneira de o evitar sem o total; o que se pode fazer, e se faz, é
 * reconstruir primeiro o TOTAL e tirar-lhe o sinal por subtracção. Assim as
 * duas parcelas fecham sempre, ao cêntimo, o total reconstruído — nunca sobra
 * um cêntimo entre elas. Quem tem o total à mão deve usar {@link splitSinal},
 * que é exacto; isto é a rede para quando a proposta já não existe.
 */
export function saldoAPartirDoSinal(
  sinal: number,
  percentagem: number = SINAL_POR_OMISSAO,
): number {
  const pct = Math.min(99.99, Math.max(0.01, percentagem));
  const totalReconstruido = round2((sinal * 100) / pct);
  return round2(totalReconstruido - sinal);
}

/** @deprecated Use {@link splitSinal}. Mantido porque é lido em vários sítios. */
export function splitThirtySeventy(total: number): { sinal: number; saldo: number } {
  return splitSinal(total, SINAL_POR_OMISSAO);
}

/** Formatador de euros pt-PT com 2 casas decimais (ex.: "1234,50 €"). */
export const eur = (n: number): string =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

/** Formatador de euros pt-PT sem casas decimais (ex.: "1235 €"). */
export const eur0 = (n: number): string =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
