import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPortalToken } from "@/lib/portal-token";
import { getQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { getContractByProposal } from "@/lib/contracts-store";
import { listInvoicesForQuote, splitThirtySeventy } from "@/lib/invoices-store";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import type { EventType, Quote } from "@/lib/orcamento/types";
import PortalView from "./PortalView";

// Private, per-client link — must NEVER be indexed. Localized title so an EN
// client isn't announced a Portuguese document title on <html lang="en">.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const t = getDictionary(normalizeLocale((await params).lang)).portal;
  return {
    title: t.title,
    robots: { index: false, follow: false },
  };
}

type EventTypeLabels = Record<EventType, string>;

/** Friendly, localized event-type label — resolved server-side so the view
 *  receives plain text (no enum-to-copy mapping in the presentation layer). */
function eventLabel(quote: Quote, labels: EventTypeLabels, empresa: string, particular: string) {
  if (quote.eventType && labels[quote.eventType]) return labels[quote.eventType];
  return quote.category === "empresas" ? empresa : particular;
}

/** yyyy-mm-dd (or ISO) → localized "12 de setembro de 2026"; null if absent. */
function fmtDate(value: string | undefined | null, locale: string): string | null {
  if (!value) return null;
  // Anchor bare dates at midday so the day never shifts across timezones.
  const dt = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang, token } = await params;
  const locale = normalizeLocale(lang);
  const t = getDictionary(locale).portal;

  // Invalid/expired token → 404. A private link must never reveal whether an id
  // exists, so a bad token is indistinguishable from a missing quote.
  const claim = readPortalToken(token);
  if (!claim) notFound();

  const quote = await getQuote(claim.quoteId);
  if (!quote) notFound();

  // The portal shows the quote's current (newest) proposal, its contract and its
  // invoices. Each read is independent, so fan them out. The proposal must come
  // first — the contract lookup keys off it.
  const proposal = await getProposalByQuote(quote.id);
  const [contract, invoices] = await Promise.all([
    proposal ? getContractByProposal(proposal.id) : Promise.resolve(null),
    listInvoicesForQuote(quote.id),
  ]);

  const total = proposal?.total ?? 0;

  return (
    <PortalView
      t={t}
      clientName={quote.name}
      eventLabel={eventLabel(
        quote,
        t.eventTypes,
        t.eventFallbackEmpresa,
        t.eventFallbackParticular,
      )}
      eventName={quote.eventName || undefined}
      eventDate={fmtDate(quote.date, t.dateLocale)}
      location={quote.location || null}
      proposal={
        proposal
          ? {
              status: proposal.status,
              total: proposal.total,
              currency: proposal.currency || "EUR",
              hasDoc: !!proposal.doc,
            }
          : null
      }
      // Only offer the PDF when there's a stored doc to render one from.
      pdfHref={proposal?.doc ? `/api/portal/${token}/proposta-pdf` : null}
      contract={
        contract
          ? {
              status: contract.status,
              acceptedAt: fmtDate(contract.acceptedAt, t.dateLocale) ?? undefined,
              acceptedName: contract.acceptedName,
              termsVersion: contract.termsVersion,
            }
          : null
      }
      invoices={invoices.map((i) => ({
        id: i.id,
        number: i.number,
        kind: i.kind,
        amount: i.amount,
        status: i.status,
        issuedAt: fmtDate(i.issuedAt, t.dateLocale),
        dueAt: fmtDate(i.dueAt, t.dateLocale),
        paidAt: fmtDate(i.paidAt, t.dateLocale),
      }))}
      schedule={proposal ? splitThirtySeventy(total) : null}
      currency={proposal?.currency || "EUR"}
    />
  );
}
