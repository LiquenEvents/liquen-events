import { NextResponse } from "next/server";
import { readPortalToken } from "@/lib/portal-token";
import { getQuote } from "@/lib/quotes-store";
import { getProposal, getProposalByQuote } from "@/lib/proposals-store";
import { getAcceptedContractByQuote } from "@/lib/contracts-store";
import { pdfDaPropostaEmCache, PropostaIncompleta } from "@/lib/proposal-pdf-cache";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import { respostaPdf } from "@/lib/pdf-resposta";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

// pdf-lib + sharp need the Node runtime.
export const runtime = "nodejs";
// Cap a single render so a slow/large document can't tie up a worker forever.
export const maxDuration = 20;

/**
 * Public-by-token proposal PDF for the client portal. Same trust model as the
 * proposal accept link: the signed portal token *is* the authorization — no
 * admin auth. Returns the stored proposal document rendered to PDF, inline.
 *
 * 404 (never 403/401) for any miss — bad/expired token, unknown quote, no
 * proposal, or a legacy line-item proposal without a stored `doc` — so a link
 * never reveals whether an id exists.
 *
 * Source of truth mirrors the portal page (page.tsx): the ACCEPTED proposal
 * (resolved via the accepted contract), not merely the newest one. After
 * acceptance the team may draft a revision; the client must still download the
 * exact document they agreed to — never a later internal draft.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Rendering inlines and re-encodes every image (pdf-lib + sharp) — expensive.
  // The token is long-lived (1 year) and forwardable, so throttle per IP to
  // stop a held link being replayed in a loop to exhaust CPU/memory.
  const limited = await rateLimit(`portal-pdf:${clientIp(request)}`, 12, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  const claim = readPortalToken(token);
  if (!claim) return new NextResponse(null, { status: 404 });

  try {
    const quote = await getQuote(claim.quoteId);
    if (!quote) return new NextResponse(null, { status: 404 });

    // Accepted-first: a client who accepted proposal A must download A, even if
    // a newer draft B now exists. Only fall back to the newest when nothing has
    // been accepted yet (proposal still open).
    const acceptedContract = await getAcceptedContractByQuote(quote.id);
    const proposal = acceptedContract
      ? await getProposal(acceptedContract.proposalId)
      : await getProposalByQuote(quote.id);
    // Defesa em profundidade: a proposta resolvida TEM de pertencer ao pedido
    // deste token. O caminho do contrato aceite confia numa ligação gravada
    // (contract.proposalId); um contrato mal ligado que aponte para a proposta
    // de outro cliente nunca pode revelar o documento desse cliente. (O caminho
    // alternativo já filtra por pedido.)
    //
    // A comparação é ESTRITA de propósito. A versão anterior era
    // `proposal.quoteId && proposal.quoteId !== quote.id`, que SALTAVA o guarda
    // sempre que `proposal.quoteId` fosse vazio — e vazio não é um caso
    // teórico: `proposals.quote_id` é `on delete set null` (db/schema.sql), por
    // isso apagar um pedido no back office põe a NULL o quote_id de todas as
    // suas propostas, e `fromRow` lê NULL como "" (falsy). Bastava então um
    // contrato aceite a apontar para uma proposta órfã para o portal de um
    // cliente servir o documento de outro. Falha FECHADA: sem pertença provada,
    // 404.
    if (!proposal?.doc || proposal.quoteId !== quote.id) {
      return new NextResponse(null, { status: 404 });
    }

    /**
     * ── A LÍNGUA VEM DA PROPOSTA QUE SE SERVE ──────────────────────────────
     *
     * Da MESMA proposta cujo `doc` se acabou de resolver — a aceite, quando há
     * aceite. Redesenhar sempre em português dava, ao casal que aceitou uma
     * proposta inglesa, um documento diferente do que combinou, meses depois,
     * na página onde vai reler o que combinou.
     *
     * Não se olha para a língua do visitante: o portal pode estar a ser lido em
     * português por um pai a ajudar, e o documento continua a ser o que o casal
     * recebeu. Sem língua gravada é português (`idiomaDaProposta`).
     */
    const idioma = idiomaDaProposta(proposal);
    // `true`: este botão redesenha, para ecrã, um documento que o casal já
    // recebeu por email. Uma fotografia em falta no armazenamento fazia isto
    // responder 503 sem corpo — e o botão não fazia nada. Ver a nota em
    // `proposal-pdf-cache.ts`; o anexo do email continua a recusar.
    // O mesmo desenho guardado que o link do email serve — a chave é o
    // conteúdo, portanto as duas portas partilham o ficheiro.
    const pdf = await pdfDaPropostaEmCache(proposal.doc, idioma, true, proposal.id);
    // `Content-Length`, pedaços e `ETag` — a razão está em `pdf-resposta.ts`.
    // O nome é o mesmo do anexo que seguiu no email, para o ficheiro ser
    // reconhecível como o documento que o casal já tem.
    const ref = quote.id.replace(/[^A-Za-z0-9_-]/g, "");
    return respostaPdf(request, pdf, {
      nome: nomeDoFicheiroDaProposta(
        {
          escolhido: proposal.doc?.nomeDoFicheiro,
          clientNames: proposal.doc?.clientNames,
          eventDate: proposal.doc?.eventDate,
          ref,
        },
        idioma,
      ),
    });
  } catch (err) {
    /**
     * A PROPOSTA SAIRIA COM FOTOS A MENOS — e por isso não sai.
     *
     * 503 e não 500: isto tem conserto e é temporário. O `Retry-After` diz ao
     * leitor de PDF do cliente para voltar, e o registo do lado de lá
     * (`proposal-storage`: «imagem não resolveu») diz QUAL foto e porquê.
     *
     * Um ficheiro com buracos era o que saía antes, calado. Um casal a ver uma
     * proposta a que faltam duas fotografias não sabe que faltam — a moldura
     * simplesmente não existe.
     */
    if (err instanceof PropostaIncompleta) {
      log.error("portal proposta-pdf: recusado, o documento sairia incompleto", null, {
        quoteId: claim.quoteId,
        emFalta: err.emFalta,
      });
      return new NextResponse(null, { status: 503, headers: { "Retry-After": "30" } });
    }
    log.error("portal proposta-pdf GET falhou", err, { quoteId: claim.quoteId });
    return new NextResponse(null, { status: 500 });
  }
}
