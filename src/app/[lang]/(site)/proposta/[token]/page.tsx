import type { Metadata } from "next";
import Image from "next/image";
import { readProposalToken } from "@/lib/proposal-token";
import { getProposal } from "@/lib/proposals-store";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import { SITE } from "@/lib/site";
import { getDictionary, htmlLang, normalizeLocale, type Locale } from "@/lib/i18n";
import { idiomaDaProposta } from "@/lib/proposta-idioma";

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LÍNGUA DESTA PÁGINA É A DA PROPOSTA, NÃO A DO VISITANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O segmento `[lang]` desta rota vem do COOKIE de quem visita (ver o cabeçalho
 * de src/proxy.ts): um casal inglês que carregue no botão do email a partir de
 * um computador onde alguém leu o site em português caía numa página portuguesa
 * para responder a uma proposta inglesa. E ao contrário: quem tem o site em
 * inglês recebia a moldura inglesa por cima de um documento português.
 *
 * O documento é que manda. A proposta já sabe em que língua foi feita
 * (`proposals.idioma`), e é essa que esta página usa em tudo: o dicionário, o
 * título do separador e o atributo `lang` do bloco.
 *
 * ── PORQUE É QUE NÃO SE REDIRECCIONA PARA O OUTRO SEGMENTO ────────────────
 *
 * Seria o mais limpo (arrumava também o `<html lang>` do layout) e NÃO PODE
 * SER: o português canónico é o caminho SEM prefixo, e o proxy reescreve-o para
 * `/{lang}/…` segundo o cookie. Um visitante com o cookie em inglês a abrir uma
 * proposta portuguesa entrava num ciclo — a página mandava-o para o caminho
 * bare, o proxy devolvia-o a `/en/…`, sem fim. O `lang` no elemento é o que
 * resolve a parte que interessa a quem lê com um leitor de ecrã.
 */
function tituloDoSeparador(locale: Locale): string {
  return locale === "en" ? "Your proposal | Líquen Events" : "A sua proposta | Líquen Events";
}

// Private, per-client link — never index it. O título segue a língua da
// PROPOSTA: é o que aparece no separador e no histórico, e é a primeira coisa
// que o casal lê do produto.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}): Promise<Metadata> {
  const { lang, token } = await params;
  // Sem proposta (token forjado, proposta apagada) não há língua a seguir senão
  // a de quem está a olhar. Uma leitura que falhe também não pode deitar abaixo
  // o título da página: cai-se no visitante, como sempre foi.
  let locale = normalizeLocale(lang);
  try {
    const claim = readProposalToken(token);
    const proposal = claim ? await getProposal(claim.proposalId) : null;
    if (proposal) locale = idiomaDaProposta(proposal);
  } catch {
    /* fica a língua do visitante */
  }
  return {
    title: tituloDoSeparador(locale),
    robots: { index: false, follow: false },
  };
}

/**
 * O DINHEIRO DESTA PÁGINA FICA EM pt-PT NAS DUAS LÍNGUAS — NÃO É UM ESQUECIMENTO.
 *
 * Aqui vivia uma cópia do `Intl` que recebia o `dateLocale` do dicionário, e
 * numa proposta em inglês o mesmo total saía «€24,600.00» enquanto o email que
 * trouxe o casal a esta página, e o PDF que ela transporta, diziam
 * «24.600,00 €». O `eurDocumento` é o formatador de tudo o que sai para o
 * cliente (ver `money.ts`), e é pt-PT por construção.
 *
 * Foi decidido de propósito, e não se muda para `en-GB` sem desfazer isto:
 *
 *   1. metade dos valores de uma proposta é TEXTO LIVRE escrito por ela, à
 *      portuguesa. Formatar os nossos à inglesa punha «€24,600.00» ao lado do
 *      «24.600,00 €» dela, na mesma folha — e nas duas formas a vírgula e o
 *      ponto TROCAM DE PAPEL: «24.600» lê-se, em inglês, como vinte e quatro
 *      euros e sessenta;
 *   2. a FACTURA que se segue é um documento fiscal português e sai em
 *      português. O casal inglês recebe os dois;
 *   3. o PDF da proposta já escreve assim em qualquer idioma. Localizar só esta
 *      página punha-a a discordar do documento que ela própria oferece a abrir.
 *
 * As DATAS continuam localizadas — é o `t.dateLocale` que trata delas, e é para
 * isso que ele existe.
 */
import { eurDocumento as eur } from "@/lib/money";

function Shell({ children, lang }: { children: React.ReactNode; lang: string }) {
  return (
    <section
      /* A língua do CONTEÚDO, que pode não ser a do `<html>` (esse vem do
         segmento da rota, e o segmento vem do cookie do visitante). Sem isto,
         um leitor de ecrã lê a proposta inglesa com pronúncia portuguesa —
         que é, ao pé da letra, incompreensível. */
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

function Message({ title, body, lang }: { title: string; body: string; lang: string }) {
  return (
    <Shell lang={lang}>
      <div className="max-w-md text-center">
        <h1
          className="text-foreground/85 font-bold mb-4"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4vw, 40px)" }}
        >
          {title}
        </h1>
        <p className="text-foreground/72 text-sm leading-relaxed">{body}</p>
        {/* O ÚNICO caminho que sobra nesta página, e por isso tem de se poder
            carregar nele com um polegar. Medido num telemóvel: 252×16 px. O
            texto é minúsculo (`text-xs` em maiúsculas) e está sozinho — não é
            uma ligação no meio de uma frase, é O botão desta página, e quem
            aqui chega já teve uma contrariedade.
            `alvo-toque` é a classe da casa (globals.css): 44 px SÓ em ecrãs de
            toque, portanto o portátil fica exactamente como estava. */}
        <a
          href={`mailto:${SITE.email}`}
          className="alvo-toque inline-flex items-center mt-8 text-moss text-xs tracking-[0.2em] uppercase hover:underline"
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
  /**
   * A língua de QUEM VISITA, e serve para uma coisa só: as duas páginas de
   * erro. Um token forjado ou uma proposta apagada não têm proposta nenhuma de
   * onde tirar língua, e o que está no ecrã é uma explicação para quem está a
   * olhar.
   */
  const doVisitante = normalizeLocale(lang);
  const claim = readProposalToken(token);
  if (!claim) {
    const t = getDictionary(doVisitante).proposta;
    return (
      <Message title={t.linkInvalidTitle} body={t.linkInvalidBody} lang={htmlLang(doVisitante)} />
    );
  }

  const proposal = await getProposal(claim.proposalId);
  if (!proposal) {
    const t = getDictionary(doVisitante).proposta;
    return <Message title={t.notFoundTitle} body={t.notFoundBody} lang={htmlLang(doVisitante)} />;
  }

  /**
   * DAQUI PARA BAIXO manda a proposta. Tudo o que se lê nesta página descreve
   * um documento que já foi apresentado ao casal numa língua: o total, a
   * validade, o botão do PDF e o formulário de resposta. Mostrá-los na língua
   * do visitante era pôr a moldura numa língua e o documento noutra — e é
   * exactamente o que acontecia a um casal inglês que abrisse o link a partir
   * de um computador com o site em português.
   *
   * Uma proposta sem língua gravada é portuguesa: ver `idiomaDaProposta`.
   */
  const locale = idiomaDaProposta(proposal);
  const t = getDictionary(locale).proposta;

  /**
   * ── «OLÁ, .» ────────────────────────────────────────────────────────────
   *
   * O título era `{t.greeting}, {proposal.clientName.split(" ")[0]}.` e não
   * tinha guarda nenhuma. Com o nome do cliente vazio — uma linha antiga em
   * que `client_name` ficou a `null` (o `fromRow` traduz isso para `""`) — o
   * casal abria o link do email e a primeira coisa que lia, em Playfair a 52
   * px, era:
   *
   *     Olá, .
   *
   * E com o campo em falta de todo, o `.split` de `undefined` atirava: o casal
   * apanhava a página de «Ocorreu um erro inesperado» em vez da proposta.
   *
   * Sem nome, cumprimenta-se na mesma — «Olá.» — que é uma frase inteira e não
   * denuncia nada. Com nome, é exactamente o que sempre saiu.
   */
  const primeiroNome =
    String(proposal.clientName ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";
  const saudacao = primeiroNome ? `${t.greeting}, ${primeiroNome}.` : `${t.greeting}.`;

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
    <Shell lang={htmlLang(locale)}>
      <div className="w-full max-w-2xl">
        <header className="text-center mb-10">
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
                {eur(it.qty * it.unitPrice, cur)}
              </span>
            </div>
          ))}

          {/* Totals */}
          <div className="px-5 py-4 bg-foreground/[0.03] flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-foreground/72">{t.subtotal}</span>
              <span className="text-foreground/72 tabular-nums">{eur(proposal.subtotal, cur)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-foreground/72">
                {t.iva} ({Math.round(proposal.vatRate * 100)}%)
              </span>
              <span className="text-foreground/72 tabular-nums">{eur(proposal.vat, cur)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-foreground/10">
              <span className="text-foreground/70 text-sm font-medium">{t.total}</span>
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

        {/**
         * ═══════════════════════════════════════════════════════════════════
         * A RESPOSTA É POR EMAIL OU POR TELEFONE — NÃO POR BOTÃO
         * ═══════════════════════════════════════════════════════════════════
         *
         * Havia aqui um formulário: «Aceitar proposta», «Recusar proposta»,
         * uma caixa de termos e um campo de nome, e o clique gravava a decisão
         * do casal no sistema.
         *
         * A dona da casa mandou tirá-lo, e a razão é do negócio: um casamento
         * não se fecha num botão. Fecha-se numa conversa — e uma proposta
         * «recusada» com um toque distraído no telemóvel é um negócio perdido
         * sem ninguém ter falado com ninguém. Passa a dizer-se, com todas as
         * letras, como se responde: escrever ou ligar.
         *
         * O PDF e a validade FICAM: esta página continua a ser onde o casal vê
         * a proposta inteira quando já arquivou o email.
         *
         * A rota que gravava a resposta (`POST /api/proposta`) foi APAGADA, e
         * não apenas escondida — enquanto existisse, uma ligação antiga numa
         * caixa de correio continuava a poder gravar uma decisão que ninguém
         * quis. Ver o teste `nada-de-aceitar-por-botao.test.tsx`.
         */}
        <div className="mt-10 border-t border-foreground/10 pt-8 text-center">
          <p className="text-foreground/85 text-sm leading-relaxed">
            {expired ? t.respostaExpirada : t.respostaComo}
          </p>
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a
              href={`mailto:${SITE.email}`}
              className="alvo-toque text-moss text-sm tracking-wide hover:underline"
            >
              {SITE.email}
            </a>
            <a
              href={`tel:${SITE.phone}`}
              className="alvo-toque text-moss text-sm tracking-wide hover:underline"
            >
              {SITE.phoneDisplay}
            </a>
          </p>
        </div>

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
