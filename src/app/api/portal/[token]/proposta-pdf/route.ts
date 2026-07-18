import { NextResponse } from "next/server";
import { readPortalToken } from "@/lib/portal-token";
import { getQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
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
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const claim = readPortalToken(token);
  if (!claim) return new NextResponse(null, { status: 404 });

  try {
    const quote = await getQuote(claim.quoteId);
    if (!quote) return new NextResponse(null, { status: 404 });

    const proposal = await getProposalByQuote(quote.id);
    if (!proposal?.doc) return new NextResponse(null, { status: 404 });

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
