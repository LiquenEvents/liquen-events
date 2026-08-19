import "server-only";
import { esc } from "./mail";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CORPO QUE QUEM ENVIA ESCREVEU À MÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O email da proposta saía sempre com um texto predefinido — o modelo guardado
 * em «Modelos de email», ou o texto da casa quando ele não servia. O modelo
 * passa a ser o PONTO DE PARTIDA e não a palavra final: quem envia pode
 * reescrever o corpo antes de carregar em Enviar, e é esse que sai.
 *
 * Este módulo é a única porta por onde esse texto entra, e existe por isso
 * mesmo: um corpo escrito à mão que fosse tratado de maneira diferente em cada
 * rota era garantir que uma delas ficava sem escape.
 *
 * ── É TEXTO, NÃO É MARCAÇÃO. E A DIFERENÇA É DELIBERADA ───────────────────
 *
 * O que chega aqui é o conteúdo de uma caixa de texto, e é tratado como tal:
 * escapa-se TUDO e só depois se lhe acrescenta marcação nossa. Um «arco &
 * flores» ou um «<3» sem escape dá, na melhor das hipóteses, um símbolo que
 * desaparece; na pior, uma etiqueta aberta que come o resto do email — o botão
 * da proposta incluído. É a mesma regra que a mensagem pessoal do estúdio já
 * seguia (era daí que vinha o {@link paragrafosDeTexto}), e a mesma da resposta
 * do mensageiro.
 *
 * Note-se a diferença para os MODELOS: o corpo de um modelo é markup, e é
 * markup de propósito — foi escrito no editor do back office, onde ela escolhe
 * negritos e cores, e o que lá se escapa são os VALORES dos `{marcadores}`.
 * Aqui não há editor nem marcadores: há uma pessoa a escrever a alguém, e a
 * única coisa que pode sair daqui são as palavras dela. Se um dia a caixa
 * passar a ser um editor com formatação, isso é uma decisão a tomar à vista, e
 * não uma coisa que aconteça por este módulo deixar passar `<b>`.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ─────────────────────────────────────────────
 *
 * Não fecha o email. A moldura da casa, a assinatura e os anexos da marca
 * continuam a vir do {@link import("./email-assinatura").emailAoCliente}, no
 * fim e sem excepção — incluindo a protecção que impede um email de sair
 * assinado com o nome de quem o vai ler. Um corpo escrito à pressa é
 * precisamente o caso em que alguém se despede com o nome errado; o fecho da
 * casa não vem daqui e por isso não se consegue substituir por engano.
 */

/**
 * Quanto texto cabe num corpo escrito à mão.
 *
 * O mesmo tecto da resposta da caixa de entrada (`inbox/reply`), e pela mesma
 * razão: é muitíssimo mais do que qualquer email a um cliente, e ao mesmo tempo
 * impede que o corpo de um pedido faça passear megabytes por dentro do escape,
 * da geração do PDF e do SMTP.
 */
export const MAXIMO_CORPO_ESCRITO = 10_000;

/**
 * Marcas bidireccionais e caracteres de controlo. Sobrevivem ao `esc` — não são
 * `<`, `>` nem `&` — e uma delas consegue inverter a leitura de tudo o que vem
 * a seguir na caixa de correio do cliente. Sai antes de entrar no email, como
 * já sai na saudação da confirmação automática (`client-confirmation.ts`).
 *
 * O `\n` e o `\t` ficam: são as quebras de linha dela, e são para respeitar.
 */
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** O texto limpo, ou vazio quando não há texto nenhum lá dentro. */
function limpar(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor.replace(CTRL, "").replace(BIDI, "").trim();
}

/**
 * Texto de uma caixa em HTML que não se parte.
 *
 * As quebras de linha têm de sobreviver: num `<p>` sem tratamento, o navegador
 * de correio junta tudo numa só linha e o que ela escreveu em três parágrafos
 * chega como um bloco. Linha em branco = parágrafo novo; quebra simples =
 * `<br>`, que é a leitura que qualquer pessoa faz de uma caixa de texto.
 *
 * `white-space:pre-wrap` teria feito o mesmo com menos código, e não serve
 * aqui: o Outlook (motor Word) ignora-o, e é onde metade destes emails abre.
 */
export function paragrafosDeTexto(texto: string): string {
  return String(texto ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-size:14px;line-height:1.6">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n        ");
}

/**
 * O texto está acima do tecto?
 *
 * RECUSA-SE, não se corta. Um email de proposta cortado a meio de uma frase
 * chega ao cliente com ar de avaria e ninguém do lado de cá dá por isso; uma
 * recusa aparece no ecrã de quem está com o dedo no botão, que é quem a pode
 * resolver em dez segundos.
 */
export function excedeOTecto(valor: unknown): boolean {
  return typeof valor === "string" && valor.length > MAXIMO_CORPO_ESCRITO;
}

/** O corpo pronto a entregar ao `emailAoCliente`, nas duas versões. */
export interface CorpoEscrito {
  /** Markup, já escapado e em parágrafos. */
  html: string;
  /** O texto simples, tal e qual — escapar é uma preocupação de HTML. */
  texto: string;
}

/**
 * O corpo escrito à mão, ou `null` quando não vem nenhum.
 *
 * `null` é o estado NORMAL e tem de continuar a ser: um envio sem corpo editado
 * — que é todo o correio que hoje sai — comporta-se exactamente como antes
 * desta caixa existir. Vazio, só com espaços, ou de um tipo que não é texto (um
 * cliente antigo, um pedido malformado): tudo isso é `null`, e nunca uma
 * excepção. Uma proposta que não segue é um negócio parado.
 */
export function corpoEscritoAMao(valor: unknown): CorpoEscrito | null {
  const texto = limpar(valor);
  if (!texto) return null;
  const html = paragrafosDeTexto(texto);
  // Um texto que só tenha espaços e quebras não dá parágrafo nenhum — e um
  // corpo vazio não pode passar por corpo escrito, senão o email sai em branco.
  if (!html) return null;
  return { html, texto };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ASSUNTO QUE VEM DO ECRÃ DE ENVIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O corpo passou a ser o que está na caixa; o ASSUNTO tinha ficado para trás —
 * saía o do modelo «proposta-enviada» ou o da casa, mesmo quando o ecrã de
 * envio mostrava o assunto de outro modelo. Duas linhas para o mesmo email, e a
 * que o casal lê antes de abrir era a que não estava à vista.
 *
 * Anda SEMPRE com o corpo, e é uma condição e não uma coincidência: assunto e
 * corpo vêm do mesmo rascunho, e aceitar um assunto solto era deixar reescrever
 * a linha de assunto de um email cujo texto ninguém tinha visto.
 *
 * ── PORQUE É QUE ISTO COLAPSA AS QUEBRAS DE LINHA ─────────────────────────
 *
 * Um assunto é UM cabeçalho SMTP. Um `\n` lá dentro não é uma quebra de linha:
 * é o fim do cabeçalho `Subject:` e o princípio de outro qualquer que quem
 * escreveu decidir — um `Bcc:` incluído. É a razão por que aqui não basta o
 * `limpar` (que deixa passar o `\n`, e bem, porque no CORPO as quebras dela são
 * significado): num assunto colapsam-se todos em espaço, e o que sobra é uma
 * linha só.
 */

/** Quanto assunto cabe. Uma caixa de correio mostra 60 a 80 caracteres; 200 dá
 *  folga a quem escreva uma frase inteira sem deixar passar um texto. */
export const MAXIMO_ASSUNTO_ESCRITO = 200;

/**
 * O assunto escrito à mão, ou `null` quando não vem nenhum.
 *
 * `null` é o estado NORMAL — um envio sem assunto editado comporta-se como
 * antes desta caixa existir. Vazio, só com espaços, ou de um tipo que não é
 * texto: tudo `null`, nunca uma excepção.
 */
export function assuntoEscritoAMao(valor: unknown): string | null {
  const numaLinha = limpar(valor).replace(/\s+/g, " ").trim();
  if (!numaLinha) return null;
  return numaLinha.slice(0, MAXIMO_ASSUNTO_ESCRITO);
}
