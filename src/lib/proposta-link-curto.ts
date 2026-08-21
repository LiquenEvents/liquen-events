import "server-only";
import { randomBytes } from "node:crypto";
import { getState, setState } from "./app-state";
import { createProposalToken, validadeDeUmLinkNovo } from "./proposal-token";
import { SITE } from "./site";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO CURTO DA PROPOSTA — E A ALAVANCA PARA O CORTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O link que o casal recebe levava o token assinado inteiro atrás:
 *
 *     …/proposta/eyJ0eXAiOiJwcm9wb3NhbCIsInBpZCI6IjI0ZTY0MjVhLTdmYjktNDdhMi1i…
 *
 * Cinco linhas de caracteres aleatórios num email comercial. No HTML isso
 * arruma-se — o endereço vive no `href` e o que se lê é uma frase. No TEXTO
 * SIMPLES não há `href` nenhum onde o esconder: ou o endereço é curto, ou o
 * email de texto continua com cinco linhas de ruído. E é o email de texto que
 * os filtros de spam leem primeiro.
 *
 * ── O QUE MUDA NO MODELO DE ACESSO, DITO COM TODAS AS LETRAS ──────────────
 *
 * O token assinado é AUTO-SUFICIENTE: a assinatura prova quem é, e ninguém
 * precisa de perguntar nada a ninguém. O código curto não prova nada por si —
 * é uma CHAVE DE GAVETA, e a gaveta está do lado do servidor. Isso troca uma
 * verificação criptográfica por uma leitura, e a troca abre a porta a uma coisa
 * que o token nunca poderia dar: **o link passar a poder ser cortado.**
 *
 * Com o token, a única maneira de invalidar um link era rodar o segredo da
 * casa — o que punha toda a equipa fora do back office e matava, ao mesmo
 * tempo, os links de TODOS os casais. Na prática, não se fazia.
 *
 * ── O QUE AINDA NÃO ESTÁ FEITO, DITO AQUI PARA NÃO SE PENSAR QUE ESTÁ ─────
 *
 * A alavanca NÃO existe ainda, e não bastava escrevê-la aqui: enquanto o token
 * assinado continuar a abrir a mesma proposta, cortar o código curto não fecha
 * porta nenhuma — quem tem o email antigo entra à mesma. Cortar a sério é uma
 * decisão sobre as DUAS portas ao mesmo tempo, e essa fica para quando ela
 * quiser a alavanca. A gaveta já guarda o carimbo (`revogadaEm`) e a leitura já
 * o respeita; o que falta é quem o escreva, e o lado do token.
 *
 * O que este ficheiro entrega hoje é o endereço curto — que é o que estava a
 * pôr cinco linhas de ruído dentro de um email comercial.
 *
 * ── PORQUE É QUE O TOKEN CONTINUA A FUNCIONAR ─────────────────────────────
 *
 * Porque há links já enviados, em caixas de correio de gente a sério, e um
 * casal que abra o email de ontem tem de continuar a ver a proposta. Os dois
 * caminhos coexistem: o `propostaDoLink` tenta o token e, se não for um, tenta
 * a gaveta. Os links novos levam o código curto; os antigos morrem sozinhos
 * quando expirarem.
 *
 * ── O ALFABETO, E PORQUE É QUE NÃO É BASE64 ───────────────────────────────
 *
 * Um destes códigos vai ser lido em voz alta ao telefone («é liquen-events
 * ponto com barra proposta barra…») e escrito à mão por alguém a olhar para
 * um telemóvel. Base64 tem `I` e `l`, `O` e `0`, maiúsculas e minúsculas do
 * mesmo sinal — e um erro de leitura dá uma página de erro sem explicação.
 *
 * Este alfabeto é o de Crockford: 32 símbolos, sem `I`, `L`, `O` nem `U` (a
 * primeira letra confunde-se com o um, a última com o zero, e o `U` sai de
 * propósito para nenhum código soletrar uma palavra que ela não queira ler ao
 * telefone). Tudo minúsculas, porque um endereço em maiúsculas parece um grito.
 *
 * ── E O TAMANHO ───────────────────────────────────────────────────────────
 *
 * 16 símbolos deste alfabeto são 80 bits de acaso. Para efeito de comparação:
 * um `randomUUID` tem 122. Oitenta bits são mais do que suficientes para um
 * endereço que ninguém publica e que expira — e o que se ganha é um link com
 * 16 caracteres em vez de duzentos.
 */

/** O prefixo das gavetas, no armazenamento de estado partilhado. */
const PREFIXO = "ligacao-proposta:";

/**
 * O caminho ao contrário: da proposta para o seu código.
 *
 * Sem isto, cada pré-visualização do email no estúdio cunhava um código NOVO —
 * e uma proposta acabava com uma dúzia de endereços válidos, todos a apontar
 * para o mesmo sítio e nenhum possível de cortar sem cortar os outros. Uma
 * proposta, um endereço.
 */
const PREFIXO_INVERSO = "ligacao-de-proposta:";

/** Crockford base32, minúsculas: sem `i`, `l`, `o` nem `u`. */
const ALFABETO = "0123456789abcdefghjkmnpqrstvwxyz";

/** Quantos símbolos tem um código. 16 × 5 bits = 80 bits. */
export const COMPRIMENTO_DO_CODIGO = 16;

/**
 * O que fica guardado por trás de um código.
 *
 * Guarda-se o `pedidoId` além do `propostaId` para se poder cortar de uma vez
 * todos os links de um pedido — que é o gesto real («este casal desistiu, corta
 * os links»), e não «corta este link em concreto», que ninguém sabe qual é.
 */
export interface LigacaoCurta {
  propostaId: string;
  pedidoId: string;
  criadaEm: string;
  /** ISO. Depois disto o código deixa de abrir, como o `exp` do token. */
  expiraEm: string;
  /** ISO, quando alguém a cortou. Não se apaga a linha: saber que um link
   *  FOI cortado (e quando) vale mais do que a linha desaparecer. */
  revogadaEm?: string;
}

/** A chave de um código, saneada para não sair do seu espaço de nomes. */
function chave(codigo: string): string {
  return `${PREFIXO}${String(codigo ?? "")
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .slice(0, 64)}`;
}

/**
 * Um código novo, sem viés.
 *
 * O resto de 256 por 32 é zero, portanto ler cada byte módulo 32 é uniforme —
 * não há aqui o enviesamento clássico de mapear 0-255 para um alfabeto que não
 * divide 256. Vale a pena dizê-lo porque a alternativa (rejeitar bytes fora da
 * gama) seria código a mais para um problema que este alfabeto não tem.
 */
export function codigoNovo(): string {
  const bytes = randomBytes(COMPRIMENTO_DO_CODIGO);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
}

/** Isto tem a forma de um código curto? Serve para distinguir do token, que é
 *  muito mais comprido e traz pontos. */
export function pareceCodigoCurto(valor: unknown): boolean {
  return new RegExp(`^[0-9a-z]{${COMPRIMENTO_DO_CODIGO}}$`).test(String(valor ?? ""));
}

/**
 * Cria a gaveta e devolve o código. `null` quando não deu para guardar.
 *
 * NUNCA atira, e o `null` é significativo: quem chama tem de poder cair para o
 * token assinado. Um envio de proposta não pode falhar porque o armazenamento
 * de estado não respondeu — o casal fica com um link comprido, que é feio, e
 * não com nenhum, que é um negócio parado.
 */
export async function criarLigacaoCurta(
  propostaId: string,
  pedidoId: string,
  validaAte: Date,
): Promise<string | null> {
  const codigo = codigoNovo();
  const ligacao: LigacaoCurta = {
    propostaId: String(propostaId ?? "").trim(),
    pedidoId: String(pedidoId ?? "").trim(),
    criadaEm: new Date().toISOString(),
    expiraEm: validaAte.toISOString(),
  };
  if (!ligacao.propostaId) return null;
  try {
    const r = await setState(chave(codigo), ligacao);
    // `duradouro: false` quer dizer que ficou num sítio que não sobrevive —
    // e um link que desaparece com o processo é pior do que um link comprido.
    if (!r.gravado || r.duradouro === false) {
      log.warn("ligação curta: não ficou guardada de forma duradoura — usa-se o token", {
        proposta: ligacao.propostaId,
      });
      return null;
    }
    // O caminho ao contrário, para a próxima pré-visualização reaproveitar este
    // código em vez de cunhar outro. Falhar aqui não estraga o link que se
    // acabou de criar — só faz com que o próximo pedido cunhe um novo.
    const inverso = await setState(`${PREFIXO_INVERSO}${ligacao.propostaId}`, { codigo });
    if (!inverso.gravado) {
      log.warn("ligação curta: o caminho inverso não ficou guardado", {
        proposta: ligacao.propostaId,
      });
    }
    return codigo;
  } catch (e) {
    log.warn("ligação curta: não deu para guardar — usa-se o token", {
      proposta: ligacao.propostaId,
      erro: String(e),
    });
    return null;
  }
}

/**
 * O identificador da proposta por trás de um código, ou `null`.
 *
 * `null` em todos os casos em que o link não deve abrir — não existe, foi
 * cortado, ou já expirou — e de propósito SEM distinguir entre eles: a página
 * do casal mostra a mesma frase para um link inválido e para um que expirou, e
 * dizer qual é dos dois só ajudaria quem estivesse a adivinhar códigos.
 */
export async function lerLigacaoCurta(codigo: string): Promise<{ propostaId: string } | null> {
  if (!pareceCodigoCurto(codigo)) return null;
  try {
    const g = await getState<LigacaoCurta>(chave(codigo));
    if (!g?.propostaId) return null;
    if (g.revogadaEm) return null;
    if (g.expiraEm && Date.parse(g.expiraEm) < Date.now()) return null;
    return { propostaId: g.propostaId };
  } catch (e) {
    // Uma leitura que falha NÃO é um link inválido. Mas também não há como
    // abrir a proposta sem ela, portanto o desfecho é o mesmo — o que muda é
    // ficar registado que foi uma avaria e não um endereço errado.
    log.warn("ligação curta: leitura falhou", { erro: String(e) });
    return null;
  }
}

/**
 * O código que esta proposta já tem, se ainda servir.
 *
 * `null` quando não há nenhum, quando o que havia já expirou, ou quando foi
 * cortado. Nos três casos, quem chamar {@link enderecoDaProposta} cunha outro —
 * e é o que tem de acontecer: cortar um link cortou AQUELE endereço, não a
 * proposta. Um envio novo é um acto deliberado dela e merece um endereço que
 * funcione; o que ficou cortado continua cortado, para sempre.
 */
async function codigoJaEmitido(propostaId: string): Promise<string | null> {
  const id = String(propostaId ?? "").trim();
  if (!id) return null;
  try {
    const guardado = await getState<{ codigo?: string }>(`${PREFIXO_INVERSO}${id}`);
    const codigo = String(guardado?.codigo ?? "");
    if (!pareceCodigoCurto(codigo)) return null;
    const ligacao = await getState<LigacaoCurta>(chave(codigo));
    if (!ligacao?.propostaId || ligacao.revogadaEm) return null;
    if (ligacao.expiraEm && Date.parse(ligacao.expiraEm) < Date.now()) return null;
    return codigo;
  } catch {
    // Uma leitura que falha não é «não há código». Mas o desfecho é o mesmo, e
    // cunhar outro é melhor do que não haver endereço nenhum.
    return null;
  }
}

/**
 * O endereço da proposta para pôr num email — curto quando dá, o token quando
 * não dá.
 *
 * NUNCA atira e NUNCA devolve vazio. Um envio de proposta não pode falhar
 * porque o armazenamento de estado não respondeu: o casal fica com um link
 * comprido, que é feio, e não sem link, que é um negócio parado.
 */
export async function enderecoDaProposta(propostaId: string, pedidoId: string): Promise<string> {
  const id = String(propostaId ?? "").trim();
  const curto = id
    ? ((await codigoJaEmitido(id)) ??
      (await criarLigacaoCurta(id, pedidoId, validadeDeUmLinkNovo())))
    : null;
  return `${SITE.url}/proposta/${curto ?? createProposalToken(propostaId)}`;
}
