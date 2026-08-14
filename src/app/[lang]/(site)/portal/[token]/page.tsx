import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPortalToken } from "@/lib/portal-token";
import { getQuote } from "@/lib/quotes-store";
import { getProposal, getProposalByQuote } from "@/lib/proposals-store";
import { getAcceptedContractByQuote, getContractByProposal } from "@/lib/contracts-store";
import { splitSinal } from "@/lib/money";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import { getDictionary, htmlLang, normalizeLocale } from "@/lib/i18n";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import type { Quote } from "@/lib/orcamento/types";
import { eventTypeName, isQuoteOptionLabel } from "@/lib/orcamento/data";
import PortalView from "./PortalView";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RENDERIZADA A CADA VISITA — NUNCA GUARDADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mesma razão da página da proposta. `[token]` não tem `generateStaticParams`
 * e nada aqui usa uma API de pedido (o idioma vem do segmento da rota — ver
 * src/proxy.ts), por isso o Next trata isto como estático: renderiza à primeira
 * visita e guarda o HTML até ao próximo deploy.
 *
 * Este é o ecrã a que o cliente VOLTA — para ver se a factura já entrou, se o
 * contrato já ficou assinado, se o sinal já está dado como pago. Congelado, ele
 * volta durante um ano (é o prazo do token do portal) à fotografia do dia em
 * que o abriu pela primeira vez, e escreve ao estúdio a perguntar porque é que
 * o pagamento que fez não aparece.
 *
 * E, como na proposta, é isto que põe `Cache-Control: private, no-store` numa
 * página cujo URL é a própria credencial.
 */
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LÍNGUA DESTE PORTAL É A DA PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O segmento `[lang]` vem do COOKIE de quem visita (ver src/proxy.ts). Um casal
 * inglês que tenha aberto o site uma vez em português encontrava, meses depois,
 * o seu portal inteiro em português — a página onde volta para ver se a factura
 * entrou e para rever o documento que aceitou.
 *
 * A proposta é o documento à volta do qual este ecrã existe (é dela que vêm o
 * total, o plano de pagamentos e o botão do PDF), e é ela que manda. Sem
 * proposta ainda, não há língua a seguir senão a do visitante.
 *
 * Não se redirecciona para o outro segmento, pela mesma razão da página da
 * proposta: o português canónico é o caminho SEM prefixo e o proxy volta a
 * reescrevê-lo pelo cookie — seria um ciclo. O `lang` no elemento é o que
 * arruma a leitura em voz alta.
 */

// Private, per-client link — must NEVER be indexed. O título segue a língua da
// proposta, que é a do conteúdo desta página.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}): Promise<Metadata> {
  const { lang, token } = await params;
  let locale = normalizeLocale(lang);
  try {
    const claim = readPortalToken(token);
    // A MESMA proposta que a página resolve (a aceite primeiro), senão o
    // separador podia dizer uma língua e o conteúdo outra.
    const proposta = claim ? await propostaDoPortal(claim.quoteId) : null;
    if (proposta) locale = idiomaDaProposta(proposta);
  } catch {
    /* uma leitura que falhe não pode deitar abaixo o título: fica o visitante */
  }
  return {
    title: getDictionary(locale).portal.title,
    robots: { index: false, follow: false },
  };
}

/**
 * A proposta que o portal mostra: a ACEITE, e só na falta dela a mais recente.
 *
 * Está numa função porque a página e o título do separador têm de resolver
 * exactamente a mesma — duas escadas diferentes davam um separador inglês por
 * cima de um portal português no dia em que houvesse uma revisão por aceitar.
 */
async function propostaDoPortal(quoteId: string) {
  const aceite = await getAcceptedContractByQuote(quoteId);
  const proposta = aceite
    ? await getProposal(aceite.proposalId)
    : await getProposalByQuote(quoteId);
  // A mesma defesa em profundidade da página: sem pertença provada, nada.
  return proposta && proposta.quoteId === quoteId ? proposta : null;
}

/** Friendly, localized event-type label — resolved server-side so the view
 *  receives plain text (no enum-to-copy mapping in the presentation layer).
 *
 *  O nome do tipo vem do `orcamento/data.ts`, que é onde a taxonomia vive: era
 *  aqui que existia uma SEGUNDA lista das mesmas oito palavras, e duas listas
 *  da mesma coisa acabam sempre por divergir. */
function eventLabel(quote: Quote, locale: string, empresa: string, particular: string) {
  return (
    eventTypeName(quote.eventType, locale) || (quote.category === "empresas" ? empresa : particular)
  );
}

/**
 * O nome que o CLIENTE (ou a equipa) deu ao evento — e só isso.
 *
 * A linha do evento dizia «Casamento · Casamento · 15 de maio de 2027»: o tipo
 * traduzido e, logo a seguir, o `eventName`, que nos pedidos do formulário
 * público era o rótulo da lista, em português, palavra por palavra igual ao
 * tipo. Num portal inglês saía «Wedding · Casamento».
 */
function nomeProprioDoEvento(quote: Quote, etiqueta: string): string | undefined {
  const nome = quote.eventName?.trim();
  if (!nome || isQuoteOptionLabel(nome)) return undefined;
  // E se, por acaso, for a mesma palavra que a etiqueta já mostra, também não
  // vale a pena dizê-la duas vezes.
  return nome.toLowerCase() === etiqueta.toLowerCase() ? undefined : nome;
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
  /** A língua de quem visita: só vale enquanto não houver proposta. */
  const doVisitante = normalizeLocale(lang);

  // Invalid/expired token → 404. A private link must never reveal whether an id
  // exists, so a bad token is indistinguishable from a missing quote.
  const claim = readPortalToken(token);
  if (!claim) notFound();

  const quote = await getQuote(claim.quoteId);
  if (!quote) notFound();

  // A fonte de verdade do portal é a proposta ACEITE, não a mais RECENTE: depois
  // do aceite a equipa pode rascunhar uma revisão da proposta, e o portal tem de
  // continuar a refletir aquilo que o cliente aceitou (estado, total, bloco do
  // contrato, agenda 30/70). Resolvemos via o contrato aceite do pedido → a sua
  // proposta. Só quando não há aceite (proposta ainda em aberto) é que caímos na
  // mais recente (`getProposalByQuote`) e no seu contrato por proposta.
  const acceptedContract = await getAcceptedContractByQuote(quote.id);
  let proposal = acceptedContract
    ? await getProposal(acceptedContract.proposalId)
    : await getProposalByQuote(quote.id);
  // Defesa em profundidade: nunca mostrar uma proposta de outro pedido através
  // de um contrato aceite mal ligado. O caminho do contrato aceite resolve a
  // proposta por um id gravado (contract.proposalId); se essa ligação estiver
  // errada não pode revelar a proposta de outro cliente (total, estado ou o
  // link do PDF).
  //
  // Comparação ESTRITA: a versão anterior exigia `proposal.quoteId &&` antes de
  // comparar, o que desligava o guarda quando o campo estava vazio. Vazio é um
  // estado REAL — `proposals.quote_id` é `on delete set null`, logo apagar um
  // pedido esvazia o quote_id das suas propostas e `fromRow` lê-o como "".
  // Sem pertença provada, não há proposta.
  if (proposal && proposal.quoteId !== quote.id) proposal = null;
  /**
   * DAQUI PARA BAIXO manda a proposta: o dicionário, os formatos de data e o
   * `lang` do bloco. Sem proposta (um pedido que ainda não tem nenhuma), fica a
   * língua do visitante — que é o que este ecrã sempre fez.
   */
  const locale = proposal ? idiomaDaProposta(proposal) : doVisitante;
  const t = getDictionary(locale).portal;

  const contract = acceptedContract
    ? acceptedContract
    : proposal
      ? await getContractByProposal(proposal.id)
      : null;

  const total = proposal?.total ?? 0;
  /**
   * ── O SINAL QUE O CLIENTE LÊ AQUI É O QUE LHE VAI SER FACTURADO ─────────
   *
   * A percentagem do sinal é uma caixa editável na proposta (`depositPercentOf`)
   * e é o que o cliente vai transferir. Este plano dividia sempre 30/70: numa
   * proposta de 50%, o cliente abria o link privado e lia «Sinal (30%)
   * 3.000,00 €» quando o combinado eram 5.000 €. Este é precisamente o ecrã a
   * que ele volta para confirmar o valor antes de transferir.
   */
  const depositPercent = depositPercentOf(proposal?.doc as ProposalDoc | undefined);

  const etiquetaDoEvento = eventLabel(
    quote,
    locale,
    t.eventFallbackEmpresa,
    t.eventFallbackParticular,
  );

  return (
    <PortalView
      t={t}
      /* A língua do CONTEÚDO, que pode não ser a do `<html>` (esse vem do
         segmento da rota, e o segmento vem do cookie do visitante). É o que
         faz um leitor de ecrã ler o portal inglês com pronúncia inglesa. */
      lang={htmlLang(locale)}
      clientName={quote.name}
      eventLabel={etiquetaDoEvento}
      eventName={nomeProprioDoEvento(quote, etiquetaDoEvento)}
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
      // Só oferecemos o PDF do contrato quando ele foi de facto assinado — o
      // endpoint só serve o aceite mais recente do pedido.
      contratoPdfHref={contract?.status === "aceite" ? `/api/portal/${token}/contrato-pdf` : null}
      schedule={proposal ? splitSinal(total, depositPercent) : null}
      depositPercent={depositPercent}
      currency={proposal?.currency || "EUR"}
    />
  );
}
