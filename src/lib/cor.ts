/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COR QUE VEM DO CLIENTE — o que se aceita, e porquê tão pouco
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cor dominante é calculada no NAVEGADOR (ver `corDe` em `image-worker.ts`),
 * porque é lá que a fotografia existe em bruto e sem origem cruzada. Isso
 * significa que chega ao servidor como um campo de formulário — e um campo de
 * formulário é uma coisa que qualquer pedido autenticado pode escrever, com o
 * que lhe apetecer lá dentro.
 *
 * O guarda é curto porque o valor é curto: sete caracteres, `#` e seis dígitos
 * hexadecimais. Nada de `rgb()`, nada de nomes de cor, nada de `var(--x)`.
 *
 * ── Porquê tanto cuidado com uma cor ───────────────────────────────────────
 * Porque ela vai acabar num atributo de estilo, para se desenhar a pastilha da
 * paleta. Uma cadeia arbitrária nesse sítio é a porta por onde entra um
 * `url(...)` ou um valor que fecha a declaração e abre outra. Uma lista de
 * permitidos estreita fecha a porta antes de a pergunta se pôr — e, ao
 * contrário de escapar à saída, não depende de quem escreve o próximo `style`.
 *
 * Como no LQIP, nada disto FALHA um carregamento: uma cor recusada é uma cor
 * que não se grava, e a fotografia fica como as que foram carregadas antes de
 * isto existir — sem aviso de paleta e sem arrumação automática. Perder uma
 * fotografia por causa da sua cor seria trocar o essencial pelo acessório.
 */

/** `#rrggbb`, em minúsculas ou maiúsculas. Mais nada. */
const FORMATO = /^#[0-9a-f]{6}$/i;

/**
 * Isto é uma cor que se pode guardar e servir?
 *
 * Puro e total: qualquer entrada, incluindo `undefined`, dá uma resposta.
 * Normaliza para minúsculas quem passa, para o mesmo valor não ficar guardado
 * de duas maneiras.
 */
export function corAceitavel(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO.test(valor);
}

/** A cor normalizada, ou `null` se não for aceitável. */
export function corNormalizada(valor: unknown): string | null {
  return corAceitavel(valor) ? valor.toLowerCase() : null;
}

/**
 * As cores de um lote, filtradas — só os caminhos que vieram na lista de fotos
 * confirmadas e só os valores aceitáveis.
 *
 * O cruzamento com `caminhosAceites` é o que impede um pedido de gravar uma cor
 * numa foto que não faz parte deste carregamento: a confirmação já validou
 * esses caminhos um a um, e este mapa não pode alargar o que ela decidiu.
 */
export function coresDoLote(
  bruto: unknown,
  caminhosAceites: readonly string[],
): Map<string, string> {
  const saida = new Map<string, string>();
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return saida;
  const aceites = new Set(caminhosAceites);
  for (const [caminho, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!aceites.has(caminho)) continue;
    const cor = corNormalizada(valor);
    if (cor) saida.set(caminho, cor);
  }
  return saida;
}
