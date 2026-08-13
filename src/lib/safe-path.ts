/**
 * Caminhos seguros para telemetria — o token NUNCA sai da rota.
 *
 * As rotas `/proposta/<token>` e `/portal/<token>` levam o segredo do cliente
 * DENTRO do caminho do URL. E não é um segredo qualquer:
 *
 *   · `/proposta/<token>` autoriza ACEITAR a proposta (POST /api/proposta), e
 *     aceitar cria contrato e fatura de sinal — quem tiver o token pode assumir
 *     um compromisso financeiro em nome do cliente. Validade: 14 dias.
 *   · `/portal/<token>` abre a reserva inteira (proposta, contrato, faturas,
 *     faseamento). Validade: 365 dias.
 *
 * Qualquer telemetria que reporte o caminho da página — Web Vitals, o
 * `page_location` do Google tag, relatórios de CSP — leva o token consigo para
 * fora: para os registos da Vercel, para a propriedade GA4/Ads (legível por
 * qualquer agência ou prestador com acesso), para o Plausible. Medido: o token
 * do portal tem 140 caracteres e `/portal/<token>` tem 148 — cabe inteiro em
 * todos esses campos, logo é gravado inteiro.
 *
 * A regra é uma só, aqui, e é usada pelos três emissores (cliente, tag da
 * Google e servidor) para não haver duas versões da verdade. O `src/lib/logger`
 * mantém deliberadamente a SUA própria limpeza: é a última rede, e não pode
 * depender de quem chama ter feito o trabalho.
 */

/** Padrão dos segmentos-token, em fonte de expressão regular, para poder ser
 *  interpolado no script inline do Google tag (que é uma STRING de JS e por
 *  isso não pode importar este módulo). Uma só definição, três consumidores. */
export const TOKEN_PATH_PATTERN = "/(portal|proposta)/[^/?#]+";

/** Substituto legível. Mantém a rota identificável nas estatísticas (dá para
 *  continuar a ver quantas visitas teve o portal) sem revelar de QUEM é. */
export const TOKEN_PLACEHOLDER = "[token]";

/**
 * Devolve o caminho (ou URL) sem o segmento-token. Tudo o resto fica intacto,
 * para a telemetria continuar a ser útil.
 *
 *   /portal/eyJ0eXAi….xYFY    → /portal/[token]
 *   /en/proposta/abc123       → /en/proposta/[token]
 *   /galeria                  → /galeria   (inalterado)
 */
export function sanitizeTelemetryPath(path: string): string {
  return path.replace(new RegExp(TOKEN_PATH_PATTERN, "g"), `/$1/${TOKEN_PLACEHOLDER}`);
}

/** `true` quando o caminho é uma rota com token e, por isso, NENHUM analítico
 *  de terceiros deve sequer ser montado nela. */
export function isTokenRoute(path: string | null | undefined): boolean {
  return !!path && new RegExp(TOKEN_PATH_PATTERN).test(path);
}
