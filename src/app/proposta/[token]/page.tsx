import type { Metadata } from "next";
import Image from "next/image";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal } from "@/lib/proposals-store";
import { SITE } from "@/lib/site";
import ProposalResponse from "./ProposalResponse";

// Private, per-client link — never index it.
export const metadata: Metadata = {
  title: "A sua proposta — Líquen Events",
  robots: { index: false, follow: false },
};

const eur = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    n || 0,
  );

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
        <p className="text-foreground/55 text-sm leading-relaxed">{body}</p>
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

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = readProposalToken(token);
  if (!claim) {
    return (
      <Message
        title="Link inválido ou expirado"
        body="Este link de proposta já não é válido. Contacte-nos e enviamos-lhe um novo com todo o gosto."
      />
    );
  }

  const proposal = await getProposal(claim.proposalId);
  if (!proposal) {
    return (
      <Message
        title="Proposta não encontrada"
        body="Não conseguimos encontrar esta proposta. Se acha que é um engano, fale connosco."
      />
    );
  }

  const cur = proposal.currency || "EUR";
  const validLabel = proposal.validUntil
    ? new Date(proposal.validUntil + "T12:00:00").toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Shell>
      <div className="w-full max-w-2xl">
        <header className="text-center mb-10">
          <p className="text-foreground/35 text-[10px] tracking-[0.45em] uppercase mb-3">
            Proposta para o seu evento
          </p>
          <h1
            className="text-foreground/90 font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 5vw, 52px)" }}
          >
            Olá, {proposal.clientName.split(" ")[0]}.
          </h1>
          <p className="text-foreground/55 text-sm mt-3 max-w-md mx-auto leading-relaxed">
            Preparámos esta proposta com todo o cuidado para o seu evento. Reveja os detalhes e
            responda-nos aqui mesmo — será um prazer avançar consigo.
          </p>
        </header>

        {/* Line items */}
        <div className="border border-foreground/10 rounded-lg overflow-hidden bg-surface-raised/30">
          <div className="hidden sm:flex items-center gap-3 px-5 py-3 border-b border-foreground/8 text-foreground/30 text-[10px] tracking-[0.2em] uppercase">
            <span className="flex-1">Descrição</span>
            <span className="w-12 text-center">Qt</span>
            <span className="w-28 text-right">Valor</span>
          </div>
          {proposal.lineItems.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-foreground/6 last:border-0"
            >
              <span className="flex-1 text-foreground/75 text-sm">{it.description}</span>
              <span className="w-12 text-center text-foreground/45 text-sm tabular-nums">
                {it.qty}
              </span>
              <span className="w-28 text-right text-foreground/75 text-sm tabular-nums">
                {eur(it.qty * it.unitPrice, cur)}
              </span>
            </div>
          ))}

          {/* Totals */}
          <div className="px-5 py-4 bg-foreground/[0.03] flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-foreground/45">Subtotal</span>
              <span className="text-foreground/60 tabular-nums">{eur(proposal.subtotal, cur)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-foreground/45">
                IVA ({Math.round(proposal.vatRate * 100)}%)
              </span>
              <span className="text-foreground/60 tabular-nums">{eur(proposal.vat, cur)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-foreground/10">
              <span className="text-foreground/70 text-sm font-medium">Total</span>
              <span
                className="text-moss font-bold tabular-nums"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 3vw, 28px)" }}
              >
                {eur(proposal.total, cur)}
              </span>
            </div>
          </div>
        </div>

        {proposal.notes && (
          <div className="mt-5 border-l-2 border-moss/40 pl-5 py-1">
            <p className="text-foreground/60 text-sm leading-relaxed whitespace-pre-wrap">
              {proposal.notes}
            </p>
          </div>
        )}

        {validLabel && (
          <p className="text-foreground/40 text-xs mt-5 text-center">Válida até {validLabel}.</p>
        )}

        {/* Response */}
        <ProposalResponse
          token={token}
          initialStatus={proposal.status}
          clientEmail={proposal.clientEmail}
        />

        <p className="text-foreground/30 text-[11px] text-center mt-10 leading-relaxed">
          Alguma questão ou ajuste? Responda a este e-mail ou contacte-nos —{" "}
          <a href={`mailto:${SITE.email}`} className="text-moss/80 hover:underline">
            {SITE.email}
          </a>
        </p>
      </div>
    </Shell>
  );
}
