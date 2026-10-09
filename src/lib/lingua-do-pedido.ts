/**
 * O cabeçalho em que o `proxy` diz a língua de cada pedido de página.
 *
 * Existe para o `app/global-not-found.tsx` (o 404 dos endereços que não
 * existem), que não recebe parâmetros e por isso não vê o `[lang]` do caminho.
 * Módulo à parte para a página não ter de importar o proxy.
 */
export const CABECALHO_DA_LINGUA = "x-liquen-lingua";
