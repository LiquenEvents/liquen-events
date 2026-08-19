import "server-only";
import { esc } from "./mail";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LINK DA PROPOSTA NÃO SE ESCREVE POR EXTENSO NA CARA DO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um link de proposta leva um token assinado atrás: quatro linhas de caracteres
 * aleatórios. Escrito à vista, no meio de um email, é o desenho exacto de uma
 * mensagem de phishing — e é um dos padrões que os filtros de spam penalizam.
 * Um cliente que hesite em carregar é uma proposta que não se lê.
 *
 * O endereço passa a viver SÓ no `href`, e o que se vê é uma frase.
 *
 * ── PORQUE É QUE ISTO ACONTECE NO ENVIO, E NÃO NO MODELO ──────────────────
 *
 * O corpo vem de um modelo GUARDADO por ela no back office, e os dois editores
 * escrevem o link assim: `<a href="{link}">{link}</a>` — o construtor simples
 * (`email-template-format.ts`) e o modelo por omissão fazem-no à letra. Reparar
 * o que está guardado era reescrever o trabalho dela na base de dados sem lho
 * pedir; e reparar só o editor deixava de fora todos os modelos que já existem.
 * Arruma-se à saída, no caminho do envio: o modelo dela fica exactamente como
 * ela o escreveu, e o email sai limpo.
 *
 * ── SÓ O LINK DAQUELE EMAIL ───────────────────────────────────────────────
 *
 * Trocar o texto de TODAS as ligações era pôr «Ver a proposta online» por cima
 * do link do Instagram que ela tenha no rodapé. Só se mexe nas ligações cujo
 * destino é o endereço que esta rota acabou de gerar — o resto do modelo é
 * dela e não se toca.
 *
 * ── E O `{link}` QUE APARECE DUAS VEZES ───────────────────────────────────
 *
 * Um modelo pode ter o mesmo endereço no `href` E solto no meio da prosa («ou
 * copie: https://…»). O primeiro fica com a etiqueta; o segundo passa a ser
 * também uma ligação — um endereço nu num email é o problema, esteja ele dentro
 * ou fora de uma âncora.
 */

/** O que o cliente lê no lugar do endereço, no email da proposta. */
export const ROTULO_DA_PROPOSTA = "Ver a proposta online";

/** O mesmo, para os emails que apontam ao portal do cliente. */
export const ROTULO_DO_PORTAL = "Abrir a minha página";

/** Uma ligação de texto: sublinhada, no verde da casa, sem cor herdada.
 *  Estilo EM LINHA porque uma folha de estilo no cabeçalho não sobrevive ao
 *  Gmail (a razão inteira está no `email-assinatura.ts`). */
const ESTILO_LIGACAO = "color:#637a5f;text-decoration:underline;font-weight:600";

const escaparRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** O texto visível de um pedaço de markup, para o comparar com um endereço. */
const semEtiquetas = (s: string): string =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * O corpo do email com o endereço `url` arrumado: fora do texto, dentro do
 * `href`, com `rotulo` no lugar dele.
 *
 * Devolve o HTML tal e qual quando não há nada a arrumar — um modelo que já
 * escreve o link com palavras sai daqui byte a byte igual.
 */
export function arrumarLigacao(
  html: string,
  { url, rotulo }: { url: string; rotulo: string },
): string {
  const cru = String(url ?? "").trim();
  const corpo = String(html ?? "");
  if (!cru) return corpo;

  /**
   * As DUAS formas do mesmo endereço. O corpo já passou pelo `renderTemplate`,
   * que escapa o que substitui: um `&` do endereço chega aqui como `&amp;`. Sem
   * a forma escapada, um link com parâmetros passava ao lado desta arrumação
   * inteira — e é o `&` que separa parâmetros, portanto é o caso normal do dia
   * em que os links deixarem de ser só um token.
   */
  const formas = [...new Set([cru, esc(cru)])];
  const alternativa = new RegExp(formas.map(escaparRegExp).join("|"), "g");

  // 1) As âncoras que mostram o próprio endereço como texto.
  let s = corpo.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (todo, atributos: string, dentro) => {
    const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(atributos);
    const destino = (href?.[1] ?? href?.[2] ?? "").trim();
    if (!formas.includes(destino)) return todo;
    // Só quando o VISÍVEL é o endereço. Se ela lá escreveu palavras, são as
    // palavras dela que ficam.
    if (!formas.includes(semEtiquetas(String(dentro)))) return todo;
    return `<a${atributos}>${esc(rotulo)}</a>`;
  });

  /**
   * 2) O endereço solto no texto. A alternância apanha primeiro a âncora
   * INTEIRA e devolve-a intacta — sem isso, o endereço dentro de um `href`
   * (que a alternativa seguinte também veria) era embrulhado numa segunda
   * âncora e o modelo dela partia-se. Pela mesma razão qualquer outra etiqueta
   * passa ao lado: um endereço dentro de um atributo é markup, não é texto.
   */
  s = s.replace(
    /(<a\b[^>]*>[\s\S]*?<\/a>)|(<[^>]*>)|([^<]+)/gi,
    (todo, ancora: string | undefined, etiqueta: string | undefined, texto: string | undefined) => {
      if (ancora || etiqueta || !texto) return todo;
      return texto.replace(
        alternativa,
        (achado) => `<a href="${achado}" style="${ESTILO_LIGACAO}">${esc(rotulo)}</a>`,
      );
    },
  );

  return s;
}
