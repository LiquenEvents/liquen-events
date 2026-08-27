/**
 * Caminhos seguros para telemetria — o token NUNCA sai da rota.
 *
 * As rotas `/proposta/<token>` e `/portal/<token>` levam o segredo do cliente
 * DENTRO do caminho do URL. E não é um segredo qualquer:
 *
 *   · `/proposta/<token>` autoriza ACEITAR a proposta (POST /api/proposta), e
 *     aceitar cria o contrato — quem tiver o token pode assumir
 *     um compromisso financeiro em nome do cliente. Validade: 14 dias.
 *   · `/portal/<token>` abre a reserva inteira (proposta, contrato,
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

/**
 * O back office.
 *
 * ── O `/admin` E O LIMITE A SEGUIR SÃO OBRIGATÓRIOS ───────────────────────
 *
 * `/orcamento` SECO é o formulário público de pedido de orçamento — a página
 * de conversão do site, aquela cujo `generate_lead` alimenta a campanha de
 * Ads. Um padrão que apanhasse `/orcamento` apagava a medição do funil todo e
 * ninguém dava por isso: o número não desaparece, encolhe.
 *
 * O `(?:[/?#]|$)` fecha a outra ponta. Sem ele, `/orcamento/administrativo`
 * ou `/orcamento/admin-publico` — que hoje não existem — passavam a calar-se
 * calados no dia em que alguém os criasse.
 *
 * Não leva prefixo de língua de propósito: o `usePathname` tanto pode dar
 * `/orcamento/admin` como `/pt/orcamento/admin` (o proxy reescreve), e as duas
 * formas contêm o segmento. É a mesma razão que já está escrita no
 * `GoogleTag.tsx` para as rotas com token: servidor e cliente decidem o mesmo,
 * logo não há divergência de hidratação.
 */
export const BACK_OFFICE_PATH_PATTERN = "/orcamento/admin(?:[/?#]|$)";

/** `true` quando o caminho é uma página do back office. */
export function isBackOfficeRoute(path: string | null | undefined): boolean {
  return !!path && new RegExp(BACK_OFFICE_PATH_PATTERN).test(path);
}

/**
 * `true` quando NENHUM analítico de terceiros deve ser montado — as rotas com
 * token e o back office.
 *
 * ── PORQUE É QUE O BACK OFFICE ENTRA AQUI ─────────────────────────────────
 *
 * 1. O que sai. O gtag reporta o `page_location` de cada ecrã interno para a
 *    propriedade GA4/Ads. Quem tenha acesso a essa conta — uma agência, um
 *    prestador, alguém que já saiu — passa a ler os caminhos de trabalho dela.
 *    E o banner de consentimento não ajuda: com o consentimento NEGADO o gtag
 *    continua a mandar pings sem cookies. É o argumento que já estava escrito
 *    no `GoogleTag.tsx` para as rotas com token, e vale aqui igual.
 * 2. O que fica sujo. As horas dela a trabalhar contam como tráfego do site.
 *    A taxa de conversão que o próprio painel mostra é calculada por cima
 *    disso — o número está errado e parece bem.
 * 3. O que custa. `gtag.js` mais `plausible.js` a competir com a hidratação do
 *    back office, no telemóvel dela, em 4G de quinta. Não há nada a medir ali
 *    que pague isso.
 */
export function semAnaliticos(path: string | null | undefined): boolean {
  return isTokenRoute(path) || isBackOfficeRoute(path);
}
