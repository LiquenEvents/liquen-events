import "server-only";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF GUARDADO, SERVIDO PELO NOSSO ENDEREÇO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com a fotografia do Safari: «quando carregamos na proposta
 * por email aparece este url. quero que coloques algo muito mais bonito e sem
 * ser com este url super desconfiado». E, depois: «quero que o pdf fique mesmo
 * e continue a ser rapido e se der quero que trabalhes nisso de ser ainda mais
 * rapido mas com um url adequado».
 *
 * ── O QUE ESTAVA, E PORQUE ESTAVA ────────────────────────────────────────
 *
 * A rota do PDF respondia `302` para um endereço ASSINADO do armazenamento.
 * Fazia-se por velocidade — os bytes iam do CDN direitos ao telemóvel, sem
 * atravessarem a função. O preço era o que ela viu: a barra do Safari passa a
 * mostrar `<referência>.supabase.co`, um domínio que ninguém reconhece, a um
 * casal que está prestes a decidir milhares de euros. Um link de um email da
 * Líquen que aterra noutro sítio qualquer é exactamente o que se ensina toda a
 * gente a não abrir.
 *
 * ── E O REENCAMINHAMENTO NÃO ERA SEQUER O CAMINHO MAIS CURTO ─────────────
 *
 * Vale a pena contar o que se descobriu a olhar para isto, porque contraria o
 * comentário que lá estava.
 *
 * O reencaminhamento NÃO poupava o arranque a frio: a função tem de correr de
 * qualquer maneira — abre o token, lê a proposta, calcula a chave — ANTES de
 * poder dizer para onde ir. O que ele poupava era só a travessia dos bytes.
 *
 * Em troca, custava ao telemóvel uma ida e volta INTEIRA a um segundo domínio:
 * DNS, aperto de mão TLS, pedido, e só então o primeiro byte. Numa quinta com
 * 4G fraco, onde o tempo de ida e volta é o que manda, isso são centenas de
 * milissegundos que se pagam antes de o ficheiro começar sequer a chegar.
 *
 * E havia um SEGUNDO pedido escondido: assinar o endereço é uma chamada à API
 * do armazenamento, feita pela função, antes de responder.
 *
 * Ou seja, o caminho antigo era: assinar (ida e volta do servidor) → 302 →
 * novo domínio (ida e volta do telemóvel) → bytes.
 *
 * Este é: pedir o objecto (uma ida e volta do servidor, com a chave de
 * serviço) → bytes a correr para o telemóvel na ligação que ele JÁ tem aberta.
 *
 * Menos um pedido do lado do servidor, menos uma ligação nova do lado do
 * telemóvel, e o endereço continua a ser o dela.
 *
 * ── EM FLUXO, E É ISSO QUE O TORNA BARATO ────────────────────────────────
 *
 * O corpo da resposta do armazenamento é entregue TAL E QUAL ao browser
 * (`upstream.body`), sem passar por um buffer. A função não chega a segurar o
 * ficheiro em memória — encaminha-o à medida que ele chega. É a diferença
 * entre atravessar e transportar.
 *
 * ── A CHAVE DE SERVIÇO NUNCA SAI DAQUI ───────────────────────────────────
 *
 * Vai num cabeçalho de um pedido feito PELO SERVIDOR. Não entra em nenhuma
 * resposta, em nenhum endereço e em nenhum registo. O que o casal recebe é o
 * ficheiro, e mais nada.
 */

/** O bucket dos PDFs guardados. O mesmo do `proposal-pdf-guardado.ts`. */
const BUCKET = "proposal-pdfs";

/**
 * Os cabeçalhos do armazenamento que fazem sentido repetir ao cliente.
 *
 * `content-length` é o que faz o browser saber quanto falta — sem ele a
 * transferência é uma barra sem fim. Os pedaços (`content-range`) vão porque
 * um leitor de PDF os pede; ver `pdf-resposta.ts`, que diz porquê por extenso.
 *
 * O `content-type` e o `content-disposition` NÃO vêm de lá: são nossos, para
 * este caminho e o do desenho dizerem exactamente a mesma coisa.
 */
const A_REPETIR = ["content-length", "content-range", "etag", "last-modified"] as const;

/**
 * O PDF guardado, em fluxo, pelo nosso endereço — ou `null`.
 *
 * `null` quer dizer «não deu»: não há armazenamento configurado, o objecto não
 * está lá, ou a rede falhou. Quem chama tem sempre o caminho de recurso (voltar
 * a desenhar), e é por isso que isto nunca lança.
 */
export async function pdfGuardadoEmFluxo(
  pedido: Request,
  proposalId: string,
  chave: string,
  nome: string,
): Promise<Response | null> {
  if (!proposalId || !chave) return null;
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !servico) return null;

  const caminho = `${proposalId.replace(/[^a-zA-Z0-9_-]/g, "")}/${chave}.pdf`;
  const endereco = `${base.replace(/\/+$/, "")}/storage/v1/object/${BUCKET}/${caminho}`;

  /** O pedido de pedaço do leitor de PDF, se houver, segue tal e qual. */
  const pedaco = pedido.headers.get("range");

  let doArmazenamento: Response;
  try {
    doArmazenamento = await fetch(endereco, {
      headers: {
        Authorization: `Bearer ${servico}`,
        ...(pedaco ? { Range: pedaco } : {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    // Uma avaria de rede não é um erro do casal: cai-se para o desenho.
    log.warn("pdf da proposta: não deu para ler o guardado, vai desenhar-se", {
      proposalId,
      erro: String(e),
    });
    return null;
  }

  // 404 é o caso NORMAL da primeira vez: o ficheiro ainda não foi guardado.
  if (doArmazenamento.status === 404) return null;
  if (!doArmazenamento.ok || !doArmazenamento.body) {
    log.warn("pdf da proposta: o armazenamento respondeu mal, vai desenhar-se", {
      proposalId,
      estado: doArmazenamento.status,
    });
    return null;
  }

  const cabecalhos = new Headers({
    "Content-Type": "application/pdf",
    // O mesmo que o caminho do desenho escreve — ver `pdf-resposta.ts`. Os dois
    // caminhos da MESMA rota têm de fazer a mesma coisa, e já não fizeram uma
    // vez: um descarregava e o outro abria no visualizador.
    "Content-Disposition": `attachment; filename="${nome}"`,
    "Accept-Ranges": "bytes",
    // O documento de um cliente não fica em cache partilhada nenhuma.
    "Cache-Control": "private, no-store, must-revalidate",
  });
  for (const k of A_REPETIR) {
    const v = doArmazenamento.headers.get(k);
    if (v) cabecalhos.set(k, v);
  }

  return new Response(doArmazenamento.body, {
    status: doArmazenamento.status,
    headers: cabecalhos,
  });
}
