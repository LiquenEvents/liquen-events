import type { Metadata } from "next";
import Image from "next/image";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal } from "@/lib/proposals-store";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import { SITE } from "@/lib/site";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import ProposalResponse from "./ProposalResponse";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RENDERIZADA A CADA VISITA — NUNCA GUARDADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `[token]` não tem `generateStaticParams` e nada nesta página usa uma API de
 * pedido: o idioma vem do SEGMENTO da rota, de propósito, para o sítio
 * institucional poder ser pré-renderizado (ver o cabeçalho de src/proxy.ts).
 * Para o Next isto é, portanto, uma rota estática — renderiza à primeira visita
 * e guarda o HTML no Full Route Cache, sem revalidação, até ao próximo deploy.
 *
 * Só que tudo o que esta página mostra é ESTADO que muda por baixo dela. Com o
 * HTML congelado: o casal aceita, volta ao link (reenviam-no, reabrem-no do
 * email) e encontra outra vez o formulário de aceitar como se nada tivesse
 * acontecido; a proposta que o estúdio retirou continua a ser oferecida até um
 * 409 no clique; e o `expired` fica preso ao dia da primeira visita, portanto o
 * aviso de validade nunca chega a aparecer.
 *
 * `force-dynamic` também é o que põe `Cache-Control: private, no-store` na
 * resposta. Numa página cujo URL é a própria credencial, isso não é acessório:
 * é o que impede um cache partilhado (CDN, proxy da empresa) de guardar a
 * proposta de um cliente e servi-la a quem pedir o mesmo caminho.
 */
export const dynamic = "force-dynamic";

// Private, per-client link — never index it. Localized title so an EN client
// isn't announced a Portuguese document title on <html lang="en">.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  return {
    title: locale === "en" ? "Your proposal | Líquen Events" : "A sua proposta | Líquen Events",
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
  // Mirror the API's expiry rule (through the WHOLE of the last valid day, i.e.
  // 23:59:59) so the client sees an "expired" notice up front instead of only
  // discovering it on a 410 after clicking Accept.
  const expired = proposal.validUntil
    ? (() => {
        const e = Date.parse(`${proposal.validUntil.slice(0, 10)}T23:59:59`);
        return !Number.isNaN(e) && e < Date.now();
      })()
    : false;
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
          {/* O CABEÇALHO SÓ APARECE SE HOUVER LINHAS PARA PÔR POR BAIXO.

              Uma proposta feita no estúdio grava sempre `lineItems: []` (ver
              api/orcamento/[id]/proposta-doc/route.ts) — o detalhe dos serviços
              vive no documento em PDF que segue em anexo, não em linhas. Sem
              esta condição, o noivo que abre a página para decidir gastar
              milhares de euros via o cabeçalho "Descrição / Quantidade / Valor",
              NADA por baixo, e logo a seguir o total a pagar. É a página mais
              cara do produto para dar má impressão, e dava-a a toda a gente que
              recebe uma proposta do estúdio. */}
          {proposal.lineItems.length > 0 && (
            <div className="hidden sm:flex items-center gap-3 px-5 py-3 border-b border-foreground/8 text-foreground/68 text-[10px] tracking-[0.2em] uppercase">
              <span className="flex-1">{t.tableDescricao}</span>
              <span className="w-12 text-center">{t.tableQt}</span>
              <span className="w-28 text-right">{t.tableValor}</span>
            </div>
          )}
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

        {/* O DOCUMENTO COMPLETO, na página onde se decide.

            O PDF seguia só em anexo no email: quem arquivasse a mensagem, ou
            abrisse o link no telemóvel, ficava a decidir milhares de euros a
            olhar para um total e um IVA. O botão só aparece quando há mesmo
            documento guardado (`proposal.doc`) — as propostas anteriores à
            coluna `proposals.doc`, e as de linhas criadas no back office, não
            têm nenhum e a página fica exatamente como estava. */}
        {proposal.doc && (
          <p className="mt-6 text-center">
            <a
              href={`/api/proposta/${encodeURIComponent(token)}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md border border-moss/40 px-6 py-3 text-moss text-xs tracking-[0.2em] uppercase hover:bg-moss/8 transition-colors"
            >
              {t.verPdf}
            </a>
          </p>
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
          expired={expired}
          proposta={t}
          percentagemDoSinal={depositPercentOf(proposal.doc as ProposalDoc | undefined)}
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
