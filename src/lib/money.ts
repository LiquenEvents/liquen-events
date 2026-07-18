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
 * Divide o total de um evento no sinal de 30% e no saldo de 70%, arredondados
 * aos cêntimos. O saldo é obtido por subtracção para que as duas parcelas somem
 * sempre exactamente o total (sem desvio de arredondamento).
 */
export function splitThirtySeventy(total: number): { sinal: number; saldo: number } {
  const t = Math.max(0, total);
  const sinal = Math.round(t * 0.3 * 100) / 100;
  const saldo = Math.round((t - sinal) * 100) / 100;
  return { sinal, saldo };
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
