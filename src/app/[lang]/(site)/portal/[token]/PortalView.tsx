import Image from "next/image";
import { fill, type Dict } from "@/lib/i18n";
import type { ProposalStatus } from "@/lib/orcamento/types";
import { SITE } from "@/lib/site";

/**
 * Portal do Cliente — the visual, read-only window a client has into their
 * booking. Pure presentation: every value arrives as a plain, serialisable prop
 * resolved server-side in page.tsx, and every string comes from the `portal`
 * dictionary. No client-side data fetching, no state, no motion — a calm,
 * static page that matches the proposta link's aesthetic.
 */

type InvoiceRow = {
  id: string;
  number: string;
  kind: "sinal" | "saldo" | "total";
  amount: number;
  status: "emitida" | "paga" | "anulada";
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

interface PortalViewProps {
  t: Dict["portal"];
  clientName: string;
  eventLabel: string;
  eventName?: string;
  eventDate: string | null;
  location: string | null;
  proposal: {
    status: ProposalStatus;
    total: number;
    currency: string;
    hasDoc: boolean;
  } | null;
  pdfHref: string | null;
  contract: {
    status: "pendente" | "aceite";
    acceptedAt?: string;
    acceptedName?: string;
    termsVersion?: string;
  } | null;
  contratoPdfHref: string | null;
  invoices: InvoiceRow[];
  schedule: { sinal: number; saldo: number } | null;
  /**
   * A percentagem do sinal desta proposta (1–99), resolvida no servidor.
   *
   * Vem como prop e não escrita nos rótulos porque é editável por proposta, e é
   * ela que as facturas usam. Ver o comentário em `page.tsx`.
   */
  depositPercent: number;
  currency: string;
}

/**
 * O estado que o CLIENTE vê.
 *
 * "Em negociação" é uma anotação interna dela, para saber a quem telefonar
 * amanhã. Do lado de lá não muda nada: a proposta seguiu e espera resposta —
 * que é exactamente o que "enviada" já diz. Mostrar a palavra "negociação" a
 * quem está a decidir seria dar-lhe a ler o caderno de apontamentos de quem lhe
 * está a vender.
 */
function estadoParaOCliente(s: ProposalStatus): Exclude<ProposalStatus, "em_negociacao"> {
  return s === "em_negociacao" ? "enviada" : s;
}

/**
 * O DINHEIRO DESTE PORTAL FICA EM pt-PT NAS DUAS LÍNGUAS — NÃO É UM ESQUECIMENTO.
 *
 * Aqui vivia uma cópia do `Intl` que recebia o `locale` do dicionário, e num
 * portal em inglês o total saía «€24,600.00» — por cima de uma lista de
 * FACTURAS portuguesas que dizem «24.600,00 €», e ao lado do link para um PDF
 * que diz o mesmo. O `eurDocumento` é o formatador de tudo o que sai para o
 * cliente (ver `money.ts`), e é pt-PT por construção.
 *
 * Foi decidido de propósito, e não se muda para `en-GB` sem desfazer isto:
 *
 *   1. metade dos valores de uma proposta é TEXTO LIVRE escrito por ela, à
 *      portuguesa. Formatar os nossos à inglesa punha as duas formas na mesma
 *      folha — e nelas a vírgula e o ponto TROCAM DE PAPEL: «24.600» lê-se, em
 *      inglês, como vinte e quatro euros e sessenta;
 *   2. as FACTURAS listadas aqui são documentos fiscais portugueses e saem em
 *      português. O casal inglês abre-as a partir desta mesma página;
 *   3. o PDF da proposta já escreve assim em qualquer idioma.
 *
 * As DATAS não são afectadas: chegam a este componente JÁ ESCRITAS, em props
 * resolvidas no servidor (ver `page.tsx`), e continuam a sair no idioma do
 * casal. O `t.dateLocale` só era lido aqui para formatar DINHEIRO — deixou de
 * ter leitor neste ficheiro.
 */
import { eurDocumento as eur } from "@/lib/money";

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

/** Card section with a consistent title treatment. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-foreground/68 text-[11px] tracking-[0.28em] uppercase mb-3">{title}</h2>
      <div className="border border-foreground/10 rounded-lg bg-surface-raised/30 p-5">
        {children}
      </div>
    </section>
  );
}

export default function PortalView({
  t,
  clientName,
  eventLabel,
  eventName,
  eventDate,
  location,
  proposal,
  pdfHref,
  contract,
  contratoPdfHref,
  invoices,
  schedule,
  depositPercent,
  currency,
}: PortalViewProps) {
  const firstName = clientName?.trim().split(" ")[0] || clientName;
  // Os rótulos do faseamento trazem as duas percentagens — a do sinal e o que
  // sobra — para não poderem discordar do valor impresso ao lado.
  const pcts = { sinal: String(depositPercent), saldo: String(100 - depositPercent) };

  // Event line: type · name · date · location, dropping any missing parts.
  const eventParts = [eventLabel, eventName, eventDate ?? t.semData, location ?? t.semLocal].filter(
    Boolean,
  ) as string[];

  return (
    <Shell>
      <div className="w-full max-w-2xl">
        {/* ── Cabeçalho ── */}
        <header className="text-center mb-2">
          <p className="text-foreground/68 text-[10px] tracking-[0.45em] uppercase mb-3">
            {t.eyebrow}
          </p>
          <h1
            className="text-foreground/90 font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 5vw, 52px)" }}
          >
            {t.greeting}, {firstName}.
          </h1>
          <p className="text-foreground/72 text-sm mt-3 max-w-md mx-auto leading-relaxed">
            {t.intro}
          </p>
          <p className="text-foreground/70 text-sm mt-5">{eventParts.join(" · ")}</p>
        </header>

        {/* ── Proposta ── */}
        <Section title={t.proposta.title}>
          {proposal ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-foreground/62 text-[11px] tracking-[0.15em] uppercase mb-1">
                    {t.proposta.statusLabel}
                  </p>
                  <p className="text-foreground/85 text-sm">
                    {t.proposta.status[estadoParaOCliente(proposal.status)]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-foreground/62 text-[11px] tracking-[0.15em] uppercase mb-1">
                    {t.proposta.totalLabel}
                  </p>
                  <p
                    className="text-moss font-bold tabular-nums"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(18px, 3vw, 24px)",
                    }}
                  >
                    {eur(proposal.total, proposal.currency)}
                  </p>
                </div>
              </div>
              {pdfHref && (
                <a
                  href={pdfHref}
                  className="inline-flex items-center justify-center self-start rounded-md bg-moss px-5 py-2.5 text-white text-xs tracking-[0.06em] font-medium hover:bg-moss-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss transition-colors"
                >
                  {t.proposta.download}
                </a>
              )}
            </div>
          ) : (
            <p className="text-foreground/72 text-sm leading-relaxed">{t.proposta.none}</p>
          )}
        </Section>

        {/* ── Contrato ── */}
        <Section title={t.contrato.title}>
          {contract && contract.status === "aceite" ? (
            <div className="flex flex-col gap-4">
              <p className="text-foreground/80 text-sm leading-relaxed">
                {fill(t.contrato.aceite, {
                  date: contract.acceptedAt ?? "",
                  name: contract.acceptedName ?? "",
                  version: contract.termsVersion ?? "",
                })}
              </p>
              {contratoPdfHref && (
                <a
                  href={contratoPdfHref}
                  className="inline-flex items-center justify-center self-start rounded-md bg-moss px-5 py-2.5 text-white text-xs tracking-[0.06em] font-medium hover:bg-moss-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss transition-colors"
                >
                  {t.contrato.download}
                </a>
              )}
            </div>
          ) : (
            <div>
              <p className="text-foreground/85 text-sm font-medium">{t.contrato.pendingTitle}</p>
              <p className="text-foreground/72 text-sm leading-relaxed mt-1">
                {t.contrato.pendingBody}
              </p>
            </div>
          )}
        </Section>

        {/* ── Pagamentos ── */}
        <Section title={t.pagamentos.title}>
          <p className="text-foreground/72 text-sm leading-relaxed">
            {fill(t.pagamentos.intro, pcts)}
          </p>

          {schedule ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border border-foreground/8 px-4 py-3">
                <p className="text-foreground/62 text-[11px] tracking-[0.12em] uppercase">
                  {fill(t.pagamentos.sinal, pcts)}
                </p>
                <p className="text-foreground/85 text-sm tabular-nums mt-1">
                  {eur(schedule.sinal, currency)}
                </p>
              </div>
              <div className="rounded-md border border-foreground/8 px-4 py-3">
                <p className="text-foreground/62 text-[11px] tracking-[0.12em] uppercase">
                  {fill(t.pagamentos.saldo, pcts)}
                </p>
                <p className="text-foreground/85 text-sm tabular-nums mt-1">
                  {eur(schedule.saldo, currency)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-foreground/68 text-sm mt-3">{t.pagamentos.semTotal}</p>
          )}

          {invoices.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-foreground/62 text-[11px] tracking-[0.15em] uppercase mb-2">
                {t.pagamentos.faturasTitle}
              </h3>
              <ul className="flex flex-col divide-y divide-foreground/8 border-t border-foreground/8">
                {invoices.map((inv) => {
                  const paid = inv.status === "paga";
                  const void_ = inv.status === "anulada";
                  const dateLine = paid
                    ? inv.paidAt && fill(t.pagamentos.pagaEm, { date: inv.paidAt })
                    : inv.dueAt
                      ? fill(t.pagamentos.venceEm, { date: inv.dueAt })
                      : inv.issuedAt && fill(t.pagamentos.emitidaEm, { date: inv.issuedAt });
                  return (
                    <li key={inv.id} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground/85 text-sm">
                          {inv.number}
                          <span className="text-foreground/55">
                            {" "}
                            · {t.pagamentos.kind[inv.kind]}
                          </span>
                        </p>
                        {dateLine && (
                          <p className="text-foreground/58 text-xs mt-0.5">{dateLine}</p>
                        )}
                      </div>
                      <span className="text-foreground/85 text-sm tabular-nums">
                        {eur(inv.amount, currency)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] tracking-[0.04em] ${
                          paid
                            ? "bg-moss/15 text-moss"
                            : void_
                              ? "bg-foreground/8 text-foreground/55 line-through"
                              : "bg-gold/15 text-gold-text"
                        }`}
                      >
                        {t.pagamentos.estado[inv.status]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-foreground/62 text-xs mt-4 leading-relaxed">
              {t.pagamentos.noInvoices}
            </p>
          )}
        </Section>

        {/* ── Próximos passos / contacto ── */}
        <Section title={t.proximos.title}>
          <p className="text-foreground/72 text-sm leading-relaxed">{t.proximos.body}</p>
          <div className="mt-4 pt-4 border-t border-foreground/8">
            <p className="text-foreground/62 text-[11px] tracking-[0.15em] uppercase mb-2">
              {t.proximos.contactTitle}
            </p>
            <div className="flex flex-col gap-1 text-sm">
              <a href={`mailto:${SITE.email}`} className="text-moss hover:underline">
                {SITE.email}
              </a>
              <a href={`tel:${SITE.phone}`} className="text-moss hover:underline">
                {SITE.phoneDisplay}
              </a>
            </div>
          </div>
        </Section>
      </div>
    </Shell>
  );
}
