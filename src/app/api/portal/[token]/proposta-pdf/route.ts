import { NextResponse } from "next/server";
import { readPortalToken } from "@/lib/portal-token";
import { getQuote } from "@/lib/quotes-store";
import { getProposal, getProposalByQuote } from "@/lib/proposals-store";
import { getAcceptedContractByQuote } from "@/lib/contracts-store";
import { renderStoredProposalDocPdf } from "@/lib/proposal-doc-render";
import { log } from "@/lib/logger";

// pdf-lib + sharp need the Node runtime.
export const runtime = "nodejs";

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
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

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
    // Defense in depth: the resolved proposal MUST belong to this token's quote.
    // The accepted-contract path trusts a stored linkage (contract.proposalId);
    // a mislinked/corrupted contract pointing at another client's proposal must
    // never leak that client's document. (The fallback already scopes by quote.)
    if (!proposal?.doc || (proposal.quoteId && proposal.quoteId !== quote.id)) {
      return new NextResponse(null, { status: 404 });
    }

    const pdf = await renderStoredProposalDocPdf(proposal.doc);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Proposta-Liquen-${quote.id}.pdf"`,
      },
    });
  } catch (err) {
    log.error("portal proposta-pdf GET falhou", err, { quoteId: claim.quoteId });
    return new NextResponse(null, { status: 500 });
  }
}
