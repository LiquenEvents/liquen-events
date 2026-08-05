import "server-only";
import { createHash } from "node:crypto";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { renderStoredProposalDocPdf } from "@/lib/proposal-doc-render";

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

function chaveDe(doc: ProposalDoc): string {
  return createHash("sha256").update(JSON.stringify(doc)).digest("base64url").slice(0, 32);
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
export async function pdfDaPropostaEmCache(doc: ProposalDoc): Promise<Buffer<ArrayBuffer>> {
  const chave = chaveDe(doc);
  const guardado = cache.get(chave);
  if (guardado) {
    // Reinserir para ficar no fim da fila — foi usado agora.
    cache.delete(chave);
    cache.set(chave, guardado);
    return guardado;
  }
  const pdf = await renderStoredProposalDocPdf(doc);
  guardar(chave, pdf);
  return pdf;
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
