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

interface PortalViewProps {
  t: Dict["portal"];
  /**
   * A língua do conteúdo (`pt-PT` / `en`), resolvida no servidor a partir da
   * PROPOSTA. Vai para o atributo `lang` do bloco: o `<html lang>` desta página
   * é o do segmento da rota, que segue o cookie do visitante, e pode não ser o
   * mesmo. Quem lê com um leitor de ecrã depende disto.
   */
  lang: string;
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
  schedule: { sinal: number; saldo: number } | null;
  /**
   * A percentagem do sinal desta proposta (1–99), resolvida no servidor.
   *
   * Vem como prop e não escrita nos rótulos porque é editável por proposta, e é
   * o valor que o cliente vai transferir. Ver o comentário em `page.tsx`.
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

function Shell({ children, lang }: { children: React.ReactNode; lang: string }) {
  return (
    <section
      /* A língua do CONTEÚDO, que é a da PROPOSTA e pode não ser a do `<html>`
         (esse vem do segmento da rota, e o segmento vem do cookie do
         visitante). Sem isto, um leitor de ecrã lê o portal inglês com
         pronúncia portuguesa. */
      lang={lang}
      className="min-h-[80vh] bg-surface flex flex-col items-center px-5 py-16 sm:py-24"
    >
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
  lang,
  clientName,
  eventLabel,
  eventName,
  eventDate,
  location,
  proposal,
  pdfHref,
  contract,
  contratoPdfHref,
  schedule,
  depositPercent,
  currency,
}: PortalViewProps) {
  /**
   * ── «OLÁ, .» ────────────────────────────────────────────────────────────
   *
   * Era `clientName?.trim().split(" ")[0] || clientName`. Com um nome vazio
   * ("" — a mesma linha antiga em que `client_name` ficou a `null` e o
   * `fromRow` traduz isso para `""`) o primeiro `split(" ")[0]` também dá
   * `""`, que é falsy — e o `||` caía outra vez em `clientName`, ou seja em
   * `""`. O casal abria o link do portal e a primeira coisa que lia, em
   * Playfair a 52 px, era:
   *
   *     Olá, .
   *
   * A mesma avaria que a página da proposta já teve (ver o comentário lá, no
   * componente `Message`), e a mesma solução: sem nome, cumprimenta-se na
   * mesma — «Olá.» — que é uma frase inteira e não denuncia nada. Com nome, é
   * exactamente o que sempre saiu.
   */
  const firstName = clientName?.trim().split(/\s+/)[0] || "";
  const saudacao = firstName ? `${t.greeting}, ${firstName}.` : `${t.greeting}.`;
  // Os rótulos do faseamento trazem as duas percentagens — a do sinal e o que
  // sobra — para não poderem discordar do valor impresso ao lado.
  const pcts = { sinal: String(depositPercent), saldo: String(100 - depositPercent) };

  // Event line: type · name · date · location, dropping any missing parts.
  const eventParts = [eventLabel, eventName, eventDate ?? t.semData, location ?? t.semLocal].filter(
    Boolean,
  ) as string[];

  return (
    <Shell lang={lang}>
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
            {saudacao}
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
                // O botão do PDF da proposta — medido a 375 px: 220×36 px, 8 px
                // abaixo do mínimo de toque. `alvo-toque` só cresce em ecrãs de
                // toque (o `inline-flex items-center justify-center` já cá
                // estava, por isso o texto continua centrado).
                <a
                  href={pdfHref}
                  className="alvo-toque inline-flex items-center justify-center self-start rounded-md bg-moss px-5 py-2.5 text-white text-xs tracking-[0.06em] font-medium hover:bg-moss-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss transition-colors"
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
                // Mesma avaria e a mesma correção do botão do PDF da proposta,
                // aqui em cima: 217×36 px medidos, 7 px abaixo do mínimo.
                <a
                  href={contratoPdfHref}
                  className="alvo-toque inline-flex items-center justify-center self-start rounded-md bg-moss px-5 py-2.5 text-white text-xs tracking-[0.06em] font-medium hover:bg-moss-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss transition-colors"
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
        </Section>

        {/* ── Próximos passos / contacto ── */}
        <Section title={t.proximos.title}>
          <p className="text-foreground/72 text-sm leading-relaxed">{t.proximos.body}</p>
          <div className="mt-4 pt-4 border-t border-foreground/8">
            <p className="text-foreground/62 text-[11px] tracking-[0.15em] uppercase mb-2">
              {t.proximos.contactTitle}
            </p>
            {/* Os dois contactos finais — medidos a 375 px: 293×20 px cada,
                empilhados a 4 px um do outro (`gap-1`). Sem alvo de toque
                próprio, um dedo que erre o e-mail por uns pixels cai no
                telefone por baixo. `alvo-toque` só cresce em ecrãs de toque. */}
            <div className="flex flex-col gap-1 text-sm">
              {/* `justify-start` cancela o `justify-content: center` que o
                  `.alvo-toque` traz de fábrica — aqui a coluna estica a
                  largura de cada âncora (flex-col ⇒ align-items: stretch), e
                  sem isto o e-mail e o telefone saltavam do canto esquerdo,
                  alinhados com "FALE CONNOSCO" por cima, para o meio da
                  coluna. */}
              <a
                href={`mailto:${SITE.email}`}
                className="alvo-toque inline-flex items-center justify-start text-moss hover:underline"
              >
                {SITE.email}
              </a>
              <a
                href={`tel:${SITE.phone}`}
                className="alvo-toque inline-flex items-center justify-start text-moss hover:underline"
              >
                {SITE.phoneDisplay}
              </a>
            </div>
          </div>
        </Section>
      </div>
    </Shell>
  );
}
