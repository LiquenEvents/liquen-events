import type { Metadata } from "next";
import Image from "next/image";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal } from "@/lib/proposals-store";
import { SITE } from "@/lib/site";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import ProposalResponse from "./ProposalResponse";

// Private, per-client link — never index it. Localized title so an EN client
// isn't announced a Portuguese document title on <html lang="en">.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  return {
    title: locale === "en" ? "Your proposal — Líquen Events" : "A sua proposta — Líquen Events",
    robots: { index: false, follow: false },
  };
}

const eur = (n: number, currency = "EUR", dateLocale = "pt-PT") =>
  new Intl.NumberFormat(dateLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n || 0);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-[80vh] bg-surface flex flex-col items-center px-5 py-16 sm:py-24">
      <Image
        src="/logo-liquen.png"
        alt="Líquen Events"
        width={150}
        height={90}
        className="object-contain h-16 w-auto mb-10 opacity-90"
      />
      {children}
    </section>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="max-w-md text-center">
        <h1
          className="text-foreground/85 font-bold mb-4"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4vw, 40px)" }}
        >
          {title}
        </h1>
        <p className="text-foreground/72 text-sm leading-relaxed">{body}</p>
        <a
          href={`mailto:${SITE.email}`}
          className="inline-block mt-8 text-moss text-xs tracking-[0.2em] uppercase hover:underline"
        >
          {SITE.email}
        </a>
      </div>
    </Shell>
  );
}

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang, token } = await params;
  const locale = normalizeLocale(lang);
  const t = getDictionary(locale).proposta;
  const claim = readProposalToken(token);
  if (!claim) {
    return <Message title={t.linkInvalidTitle} body={t.linkInvalidBody} />;
  }

  const proposal = await getProposal(claim.proposalId);
  if (!proposal) {
    return <Message title={t.notFoundTitle} body={t.notFoundBody} />;
  }

  const cur = proposal.currency || "EUR";
  const validLabel = proposal.validUntil
    ? new Date(proposal.validUntil + "T12:00:00").toLocaleDateString(t.dateLocale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Shell>
      <div className="w-full max-w-2xl">
        <header className="text-center mb-10">
          <p className="text-foreground/68 text-[10px] tracking-[0.45em] uppercase mb-3">
            {t.eyebrow}
          </p>
          <h1
            className="text-foreground/90 font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 5vw, 52px)" }}
          >
            {t.greeting}, {proposal.clientName.split(" ")[0]}.
          </h1>
          <p className="text-foreground/72 text-sm mt-3 max-w-md mx-auto leading-relaxed">
            {t.intro}
          </p>
        </header>

        {/* Line items */}
        <div className="border border-foreground/10 rounded-lg overflow-hidden bg-surface-raised/30">
          <div className="hidden sm:flex items-center gap-3 px-5 py-3 border-b border-foreground/8 text-foreground/68 text-[10px] tracking-[0.2em] uppercase">
            <span className="flex-1">{t.tableDescricao}</span>
            <span className="w-12 text-center">{t.tableQt}</span>
            <span className="w-28 text-right">{t.tableValor}</span>
          </div>
          {proposal.lineItems.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-foreground/6 last:border-0"
            >
              <span className="flex-1 text-foreground/75 text-sm">{it.description}</span>
              <span className="w-12 text-center text-foreground/72 text-sm tabular-nums">
                {it.qty}
              </span>
              <span className="w-28 text-right text-foreground/75 text-sm tabular-nums">
                {eur(it.qty * it.unitPrice, cur, t.dateLocale)}
              </span>
            </div>
          ))}

          {/* Totals */}
          <div className="px-5 py-4 bg-foreground/[0.03] flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-foreground/72">{t.subtotal}</span>
              <span className="text-foreground/72 tabular-nums">
                {eur(proposal.subtotal, cur, t.dateLocale)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-foreground/72">
                {t.iva} ({Math.round(proposal.vatRate * 100)}%)
              </span>
              <span className="text-foreground/72 tabular-nums">
                {eur(proposal.vat, cur, t.dateLocale)}
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-foreground/10">
              <span className="text-foreground/70 text-sm font-medium">{t.total}</span>
              <span
                className="text-moss font-bold tabular-nums"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 3vw, 28px)" }}
              >
                {eur(proposal.total, cur, t.dateLocale)}
              </span>
            </div>
          </div>
        </div>

        {proposal.notes && (
          <div className="mt-5 border-l-2 border-moss/40 pl-5 py-1">
            <p className="text-foreground/72 text-sm leading-relaxed whitespace-pre-wrap">
              {proposal.notes}
            </p>
          </div>
        )}

        {validLabel && (
          <p className="text-foreground/68 text-xs mt-5 text-center">
            {t.validoAte} {validLabel}.
          </p>
        )}

        {/* Response */}
        <ProposalResponse
          token={token}
          initialStatus={proposal.status}
          clientEmail={proposal.clientEmail}
          proposta={t}
        />

        <p className="text-foreground/68 text-[11px] text-center mt-10 leading-relaxed">
          {t.footerNote}{" "}
          <a href={`mailto:${SITE.email}`} className="text-moss hover:underline">
            {SITE.email}
          </a>
        </p>
      </div>
    </Shell>
  );
}
