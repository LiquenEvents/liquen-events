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

/** Arredonda um valor aos cêntimos (2 casas decimais). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const t = Math.max(0, total);
  const pct = Math.min(100, Math.max(0, percentagem));
  const sinal = Math.round(t * (pct / 100) * 100) / 100;
  const saldo = Math.round((t - sinal) * 100) / 100;
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
 */
export function saldoAPartirDoSinal(
  sinal: number,
  percentagem: number = SINAL_POR_OMISSAO,
): number {
  const pct = Math.min(99.99, Math.max(0.01, percentagem));
  return round2((sinal * (100 - pct)) / pct);
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
