/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LQIP QUE VEM DO CLIENTE — o que se aceita, e porquê tão pouco
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O LQIP é gerado no NAVEGADOR (ver `image-worker.ts`), guardado na base de
 * dados e depois servido **inline, dentro do JSON**, para ser desenhado sem
 * rede. Isso é a razão de existir — e é também a razão de ser preciso um
 * guarda a sério à entrada.
 *
 * Um `data:` URI que venha do cliente e vá parar a um `src` é uma superfície
 * com história: um `data:text/html`, um `data:image/svg+xml` com um `<script>`
 * lá dentro. Um SVG não é uma fotografia reduzida a 16 px — é um documento com
 * capacidade de execução, e a CSP do site permite `data:` em `img-src` de
 * propósito, para os placeholders. Por isso a lista aqui é curta e é uma LISTA
 * DE PERMITIDOS: WebP e JPEG, e mais nada.
 *
 * O tecto de caracteres é a outra metade. Sem ele, um cliente adulterado podia
 * gravar 8 KB por foto e transformar cada resposta da biblioteca — servida a
 * cada abertura — num megabyte de placeholders. Não é um ataque exótico: é o
 * que acontece sozinho se alguém mudar a qualidade do encode e ninguém reparar.
 *
 * Nada disto FALHA um carregamento. Um LQIP recusado é um LQIP que não se
 * grava, e a célula da grelha fica como estava antes de tudo isto existir: uma
 * caixa à espera. Perder uma fotografia por causa do seu placeholder seria
 * trocar o essencial pelo acessório.
 */

/**
 * Tecto de caracteres do LQIP guardado.
 *
 * Medido sobre 12 fotografias reais do repositório, a 16 px e WebP q40: 151 a
 * 207 caracteres. 1200 dá seis vezes a folga do pior caso — chega para uma
 * fotografia patológica e continua a ser 15× menos do que a miniatura de 20 KB
 * que este placeholder substitui enquanto ela não chega.
 *
 * O mesmo número está em `image-worker.ts` (`LQIP_MAX_CHARS`), do lado de quem
 * GERA. Aqui está do lado de quem ACEITA — e os dois lados têm de existir: o
 * gerador protege o caso normal, este protege o caso em que o pedido não veio
 * do nosso gerador.
 */
export const LQIP_LIMITE_CARACTERES = 1200;

/** Os únicos formatos que um placeholder pode ter. Ver o cabeçalho. */
const FORMATO = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Isto é um LQIP que se pode guardar e servir inline?
 *
 * Puro e total: qualquer entrada, incluindo `undefined`, dá uma resposta.
 */
export function lqipAceitavel(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.length > 0 &&
    valor.length <= LQIP_LIMITE_CARACTERES &&
    FORMATO.test(valor)
  );
}

/**
 * Os LQIP de um lote, filtrados — só os caminhos que vieram na lista de fotos
 * confirmadas e só os valores aceitáveis.
 *
 * O cruzamento com `caminhosAceites` é o que impede um pedido de gravar um
 * placeholder numa foto que não faz parte deste carregamento (ou que nem
 * sequer é deste tema): a confirmação já validou esses caminhos um a um, e
 * este mapa não pode alargar o que ela decidiu.
 */
export function lqipsDoLote(
  bruto: unknown,
  caminhosAceites: readonly string[],
): Map<string, string> {
  const saida = new Map<string, string>();
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return saida;
  const aceites = new Set(caminhosAceites);
  for (const [caminho, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!aceites.has(caminho)) continue;
    if (lqipAceitavel(valor)) saida.set(caminho, valor);
  }
  return saida;
}
