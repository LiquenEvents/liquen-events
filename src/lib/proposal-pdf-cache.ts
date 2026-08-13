import "server-only";
import { createHash } from "node:crypto";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { log } from "@/lib/logger";

/**
 * O PDF já desenhado, guardado por conteúdo.
 *
 * ── Porque é que isto tem de existir ──────────────────────────────────────
 * Desenhar uma proposta não é ler um ficheiro: vai buscar até 80 fotos ao
 * Storage (4 de cada vez) e reencoda cada uma com o sharp. São segundos e
 * dezenas de MB de trabalho.
 *
 * A partir do momento em que as rotas anunciam `Accept-Ranges`, o leitor de PDF
 * do cliente deixa de fazer UM pedido e passa a fazer vários — primeiro o fim
 * do ficheiro (a tabela de referências), depois os objectos de cada página. Sem
 * esta cache, cada um desses pedidos voltava a desenhar o documento inteiro, e
 * a melhoria virava uma degradação de cinco ou seis vezes.
 *
 * Por isso a cache e os pedaços entram juntos. Não é uma optimização solta.
 *
 * ── A chave é o CONTEÚDO ──────────────────────────────────────────────────
 * O documento guardado (`ProposalDoc`) traz caminhos do Storage, não bytes, por
 * isso serializá-lo é barato e o resumo é estável. Uma proposta revista muda o
 * documento e portanto muda a chave — não há como servir uma versão velha, e
 * não é preciso invalidar nada à mão.
 *
 * A chave NÃO é a autorização. Quem chama já validou o token antes de aqui
 * chegar; isto é só memória. Dois clientes com o mesmo documento partilham a
 * entrada, e é o mesmo ficheiro para os dois.
 *
 * ── Os limites, e porquê ──────────────────────────────────────────────────
 * Uma função serverless tem pouca memória e isto guarda buffers de MB. O tecto
 * é por BYTES e não por número de entradas, porque é a memória que acaba — seis
 * propostas de 500 KB e seis de 4 MB não são o mesmo risco. Ao passar do tecto,
 * sai a entrada usada há mais tempo.
 *
 * Vive por processo: um arranque a frio começa vazia, e isso está certo. Não é
 * uma cache de que a correcção dependa — é só a diferença entre desenhar uma
 * vez ou seis dentro da mesma sessão de leitura.
 */

/** ~24 MB. Cabem várias propostas típicas (0,5–3 MB) sem ameaçar o tecto de
 *  memória da função, que costuma ser 1 GB mas é partilhado com o sharp. */
const TECTO_BYTES = 24 * 1024 * 1024;

/** Nenhuma proposta razoável passa disto. Um documento maior não entra na
 *  cache (serve-se à mesma, só não fica guardado) para uma proposta anormal
 *  não expulsar todas as outras sozinha. */
const MAXIMO_POR_ENTRADA = 8 * 1024 * 1024;

/** `Map` preserva a ordem de inserção — é o que dá o "usado há mais tempo"
 *  sem estrutura nenhuma: apagar e voltar a pôr manda a entrada para o fim. */
const cache = new Map<string, Buffer<ArrayBuffer>>();
let bytesGuardados = 0;

/**
 * A chave é o CONTEÚDO **mais a LÍNGUA**.
 *
 * A língua não está dentro do `doc` (o documento guardado é um só, em
 * português — ver `proposal-doc-textos`), portanto sem ela na chave as duas
 * versões do mesmo documento partilhavam entrada: quem pedisse a inglesa a
 * seguir a uma portuguesa recebia a portuguesa, de memória, sem desenhar nada e
 * sem erro nenhum. É a mesma falha do «documento revisto» que a chave por
 * conteúdo já evita, só que por um eixo que o JSON do documento não vê.
 */
function chaveDe(doc: ProposalDoc, idioma: IdiomaDaProposta): string {
  return createHash("sha256")
    .update(`${idioma}:${JSON.stringify(doc)}`)
    .digest("base64url")
    .slice(0, 32);
}

function guardar(chave: string, pdf: Buffer<ArrayBuffer>): void {
  if (pdf.length > MAXIMO_POR_ENTRADA) return;
  const jaLa = cache.get(chave);
  if (jaLa) {
    cache.delete(chave);
    bytesGuardados -= jaLa.length;
  }
  cache.set(chave, pdf);
  bytesGuardados += pdf.length;
  while (bytesGuardados > TECTO_BYTES) {
    const maisAntiga = cache.keys().next();
    if (maisAntiga.done) break;
    const saiu = cache.get(maisAntiga.value)!;
    cache.delete(maisAntiga.value);
    bytesGuardados -= saiu.length;
  }
}

/**
 * O PDF deste documento, desenhado agora ou reaproveitado.
 *
 * Substitui `renderStoredProposalDocPdf` nas rotas que servem o mesmo documento
 * ao mesmo leitor várias vezes seguidas (portal e link da proposta). Onde o
 * documento é desenhado UMA vez — a pré-visualização do back office, o email —
 * continua a chamar-se o renderizador directamente: guardar ali só gastava
 * memória.
 */
export async function pdfDaPropostaEmCache(
  doc: ProposalDoc,
  /**
   * A língua em que a proposta foi feita (`proposals.idioma`, lida com o
   * `idiomaDaProposta`). Por omissão português, que é o que todas as propostas
   * anteriores a essa coluna são — e o que esta função sempre desenhou.
   */
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<Buffer<ArrayBuffer>> {
  const chave = chaveDe(doc, idioma);
  const guardado = cache.get(chave);
  if (guardado) {
    // Reinserir para ficar no fim da fila — foi usado agora.
    cache.delete(chave);
    cache.set(chave, guardado);
    return guardado;
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * UM PDF COM BURACOS NÃO SAI DAQUI
   * ════════════════════════════════════════════════════════════════════════
   *
   * Esta função serve o documento **ao casal**. Até aqui chamava
   * `renderStoredProposalDocPdf`, que deita fora o relatório: uma fotografia
   * que não resolvesse desaparecia da proposta e o ficheiro seguia na mesma,
   * bonito e incompleto, sem ninguém saber. O ecrã do back office já avisava
   * (cabeçalho `X-Fotos-Em-Falta`); a porta do cliente não avisava nada.
   *
   * UMA SEGUNDA TENTATIVA, E DEPOIS PÁRA. A causa mais comum de uma foto não
   * resolver é passageira — um pedido ao Storage que expirou, uma ligação que
   * caiu a meio de oitenta. Repetir apanha esse caso, e não custa nada quando
   * não é esse (o caminho normal é zero em falta e não repete).
   *
   * Se à segunda continuar a faltar, **não se serve**. É o pedido dela, e está
   * certo: uma proposta com fotos a menos enviada a um casal é pior do que um
   * erro, porque o erro vê-se e a falta não — nem ela nem o casal sabem o que
   * era suposto lá estar.
   *
   * O que NÃO se faz aqui é guardar em cache o que falhou. A falha é
   * passageira por definição; guardá-la fixava-a até ao próximo arranque a
   * frio — o mesmo erro de gravar uma falha como se fosse um facto que já
   * apareceu na cache de fotografias e na célula do estúdio.
   */
  let ultimo = await renderStoredProposalDocPdfWithReport(doc, idioma);
  if (ultimo.missingImages > 0) {
    log.warn("proposta-pdf: fotos em falta, a tentar segunda vez", {
      emFalta: ultimo.missingImages,
    });
    // A repetição é para apanhar uma foto que não resolveu, não para mudar o
    // que sai: MESMO documento, MESMA língua.
    ultimo = await renderStoredProposalDocPdfWithReport(doc, idioma);
  }
  if (ultimo.missingImages > 0) {
    log.error("proposta-pdf: RECUSADO — o documento sairia com fotos a menos", null, {
      emFalta: ultimo.missingImages,
    });
    throw new PropostaIncompleta(ultimo.missingImages);
  }

  guardar(chave, ultimo.pdf);
  return ultimo.pdf;
}

/**
 * O documento não pode ser servido porque sairia com fotografias a menos.
 *
 * Tem tipo próprio para quem chama poder distinguir isto de uma avaria
 * qualquer: a resposta ao cliente é diferente (isto é temporário e tem
 * conserto) e a mensagem para os registos também.
 */
export class PropostaIncompleta extends Error {
  constructor(public readonly emFalta: number) {
    super(`A proposta sairia com ${emFalta} fotografia(s) em falta.`);
    this.name = "PropostaIncompleta";
  }
}

/** Só para os testes: esvaziar entre casos. */
export function esvaziarCachePdf(): void {
  cache.clear();
  bytesGuardados = 0;
}

/** Só para os testes: o que está guardado agora. */
export function estadoCachePdf(): { entradas: number; bytes: number } {
  return { entradas: cache.size, bytes: bytesGuardados };
}
