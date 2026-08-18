import { NextRequest, NextResponse } from "next/server";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { transicaoDoPedido, type AcontecimentoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { ehMotivoDeRecusa } from "@/lib/orcamento/desfecho";
import { getQuote, updateQuote, deleteQuote } from "@/lib/quotes-store";
import {
  semearProducaoAoGanhar,
  preverGeracaoDoEvento,
  gerarEventoAoGanhar,
} from "@/lib/semear-producao";
import { getProposalByQuote, updateProposal } from "@/lib/proposals-store";
import { createContractIfAbsent, newContractId } from "@/lib/contracts-store";
import { TERMS_VERSION, termosPara, termsToPlainText } from "@/lib/contract-terms";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import { isAuthed } from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quoteUpdateSchema, firstError } from "@/lib/validation";
import { eur } from "@/lib/money";
import { log } from "@/lib/logger";

// The store is server-only and reaches for node:crypto — pin the Node runtime.
export const runtime = "nodejs";

/**
 * O que este PATCH conta como tendo ACONTECIDO ao pedido, comparando o que vem
 * com o que está gravado. `null` quando não aconteceu nada que mude o estado —
 * que é o caso da esmagadora maioria das gravações (uma nota, uma etiqueta, uma
 * linha de pagamento ainda por receber).
 *
 * Vive aqui e não no módulo da decisão de propósito: a decisão é sobre
 * ACONTECIMENTOS, e isto é a tradução de um corpo de HTTP para um deles. Pôr
 * `Partial<Quote>` lá dentro fazia a regra passar a saber o que é um PATCH.
 */
function acontecimentoDoPatch(
  actual: Quote,
  updates: Partial<Quote>,
): { acontecimento: AcontecimentoDoPedido; detalhe?: string } | null {
  // 1) Entrou dinheiro: uma linha marcada como paga que antes não estava.
  if (updates.payments) {
    const jaPagos = new Set((actual.payments ?? []).filter((p) => p.paid).map((p) => p.id));
    const recebido = updates.payments.find((p) => p.paid && !jaPagos.has(p.id));
    if (recebido) {
      return { acontecimento: "pagamento_recebido", detalhe: eur(recebido.amount) };
    }
  }
  // 2) Passou a haver contrato com referência. Apagá-la não desfaz nada — o
  //    estado nunca anda para trás, e um campo limpo por engano não pode
  //    desfechar um casamento no quadro.
  const ref = typeof updates.contractRef === "string" ? updates.contractRef.trim() : "";
  if (ref && ref !== (actual.contractRef ?? "").trim()) {
    return { acontecimento: "contrato_registado", detalhe: ref };
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Public endpoint (confirmation page loads by reference id). Authenticated
    // staff get the full record; anyone else gets an explicit allowlist of the
    // event facts the confirmation page renders — never the client's personal
    // data nor internal CRM fields (adminNotes, activityLog, payments, guest
    // list, lost reason…), so an enumerated id can't leak anything sensitive.
    // The id's random suffix has 64 bits of entropy, but rate limiting still
    // slows down brute-force scanning to a crawl for the unauthenticated path.
    if (!isAuthed(request)) {
      sweep();
      const limited = await rateLimit(`orcamento-get:${clientIp(request)}`, 20, 60_000);
      if (!limited.ok) {
        return NextResponse.json(
          { error: "Demasiados pedidos. Tenta novamente dentro de momentos." },
          { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
        );
      }
    }

    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    if (isAuthed(request)) {
      /**
       * ══════════════════════════════════════════════════════════════════════
       * QUEM RECEBE TEM DE PODER DISTINGUIR ESTA RESPOSTA DA DE BAIXO
       * ══════════════════════════════════════════════════════════════════════
       *
       * Esta rota responde 200 nos dois casos: com sessão devolve o pedido
       * INTEIRO, sem sessão devolve a lista curta e pública lá em baixo — que
       * também leva `id`. São 200 com o mesmo aspecto à distância.
       *
       * O back office passou a ir buscar aqui o pedido completo quando ela abre
       * um pedido da lista (ver `openQuote` em AdminClient). Com a sessão
       * expirada — e ela fica com o separador aberto horas seguidas — a
       * resposta pública passava por completa: o painel abria sem nome, sem
       * contacto, sem pagamentos e sem convidados, e o pedido da lista era
       * substituído por essa versão amputada.
       *
       * Este cabeçalho é a distinção, dita e não adivinhada. Adivinhá-la pela
       * presença de um campo seria uma regra a partir-se sozinha no dia em que
       * a lista pública crescesse um campo.
       */
      return NextResponse.json(quote, { headers: { "x-pedido": "completo" } });
    }
    const safe = {
      id: quote.id,
      submittedAt: quote.submittedAt,
      status: quote.status,
      category: quote.category,
      eventType: quote.eventType,
      eventName: quote.eventName,
      packageTier: quote.packageTier,
      guests: quote.guests,
      date: quote.date,
      location: quote.location,
      addons: (quote.addons ?? []).map(({ id, name, tier }) => ({ id, name, tier })),
      // Sem isto, a página de confirmação mostrava os pontos de decoração
      // enquanto o `sessionStorage` durasse e perdia-os ao recarregar — o
      // casal recarrega a página e metade do que escolheu desapareceu. São
      // dados que a própria pessoa acabou de escrever; o que esta lista
      // protege é o que é INTERNO (preços, notas da equipa), e isto não é.
      decorPoints: quote.decorPoints ?? [],
      // Mesma razão dos pontos de decoração: são respostas que a própria pessoa
      // acabou de dar, e recarregar a página de confirmação não as pode fazer
      // desaparecer. O que esta lista protege é o que é INTERNO — preços, notas
      // da equipa — e isto não é nenhuma dessas coisas.
      ceremonyType: quote.ceremonyType ?? "",
      spaceType: quote.spaceType ?? "",
    };
    return NextResponse.json(safe);
  } catch (err) {
    log.error("orcamento GET id falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  // Parse defensively: a malformed or non-object JSON body must yield a clean
  // 400, not an uncaught throw (this parse sits outside the try below, so an
  // unguarded request.json() would surface as a 500). `null`/numbers/strings
  // also break the `key in body` check further down with a TypeError.
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const allowed: (keyof Quote)[] = [
    "status",
    "quotedPrice",
    "adminNotes",
    "checklist",
    "productionPlan",
    "payments",
    "timeline",
    "eventSuppliers",
    "tags",
    "followUpAt",
    "guestList",
    "activityLog",
    "assignedTo",
    "lostReason",
    "date",
    "guests",
    "location",
    // Os dados de contacto: um pedido que entrou por telefone não tem email, e
    // sem isto não havia por onde o acrescentar — nem sequer depois de o envio
    // responder «acrescenta o email e reenvia». Ver `quoteUpdateSchema`.
    "name",
    "email",
    "phone",
    "contractRef",
    "archived",
  ];
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      picked[key] = body[key];
    }
  }
  // Append-only path for the activity log (not a Quote key, so picked apart).
  if ("activityLogAppend" in body) {
    picked.activityLogAppend = (body as Record<string, unknown>).activityLogAppend;
  }

  /**
   * O texto livre do motivo de perda — não é campo do PEDIDO, é campo da
   * PROPOSTA (`Proposal.lostNote`), e é lá que a análise o vai buscar. `Quote`
   * não tem `lostNote` de propósito: dois sítios a guardar a mesma nota
   * divergem com o tempo, e esta é a mesma separação que já existe do lado das
   * propostas (`lostReason` fechado, `lostNote` livre). Por não ser campo do
   * pedido, não passa pelo `quoteUpdateSchema` — validado à mão, com o mesmo
   * limite que `backup-restore.ts` já reserva para `Proposal.lostNote`.
   */
  const lostNoteBruto = "lostNote" in body ? (body as Record<string, unknown>).lostNote : undefined;
  const lostNote =
    typeof lostNoteBruto === "string" ? lostNoteBruto.trim().slice(0, 2000) : undefined;

  // Allowlist says WHICH fields may change; the schema validates the VALUES
  // (status enum, numeric price, well-formed arrays) so nothing malformed is
  // ever persisted and later breaks exports or revenue calculations.
  const parsed = quoteUpdateSchema.safeParse(picked);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { activityLogAppend, ...updates } = parsed.data as Partial<Quote> & {
    activityLogAppend?: Quote["activityLog"];
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * QUEM ESCOLHE O ESTADO À MÃO GANHA SEMPRE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um arrasto no quadro ou uma escolha na gaveta é uma decisão de uma pessoa,
   * e a automação não a discute — nem sequer para a confirmar. Sem esta linha,
   * marcar um pedido como «Perdido» no mesmo gesto em que se corrige um
   * pagamento fazia a automação escrever «Ganho» por cima. É também a única
   * coisa que garante que `rejeitado` continua a ser exclusivamente humano.
   */
  const estadoEscolhidoAMao = "status" in picked;

  try {
    // Merge appends onto the FRESH stored log, server-side. Clients used to
    // send the whole recomputed array; two tools saving near-simultaneously
    // (e.g. "proposta enviada" + Guardar) would overwrite each other's entries.
    //
    // O registo fresco serve agora para uma segunda coisa: comparar o que vem
    // com o que está, para saber se ACONTECEU alguma coisa que mude o estado.
    const querAppend = !!activityLogAppend && activityLogAppend.length > 0;
    const podeMudarEstado =
      !estadoEscolhidoAMao && ("payments" in picked || "contractRef" in picked);
    const current = querAppend || podeMudarEstado ? await getQuote(id) : null;
    if ((querAppend || podeMudarEstado) && !current) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    if (current && querAppend) {
      (updates as Partial<Quote>).activityLog = [
        ...(current.activityLog ?? []),
        ...(activityLogAppend ?? []),
      ].slice(-5000);
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * REGISTAR UM PAGAMENTO OU UM CONTRATO É DIZER QUE O TRABALHO É NOSSO
     * ════════════════════════════════════════════════════════════════════════
     *
     * Este PATCH é a porta por onde o painel de Pagamentos grava (manda a lista
     * inteira em `{ payments }`) e por onde a referência do contrato é guardada.
     * Nenhuma das duas coisas mexia no estado: ela dava um sinal por recebido e
     * o pedido continuava em «Proposta enviada».
     *
     * ── O QUE CONTA E O QUE NÃO CONTA ────────────────────────────────────
     *
     * Só um pagamento com `paid: true` que ANTES não estava pago. Uma linha de
     * pagamento por receber é um PLANO — a maioria é criada assim, com o sinal
     * pré-preenchido no momento em que se abre o painel — e um plano não é um
     * negócio ganho. Comparar com o registo gravado é o que separa "acabou de
     * entrar dinheiro" de "esta linha já cá estava e vem outra vez no array".
     *
     * A referência do contrato conta quando passa a existir: escrevê-la é dizer
     * que há contrato assinado com aquele número.
     *
     * Tudo em melhor esforço: guardar um pagamento tem de resultar mesmo que a
     * conta do estado rebente. O que se perde é a cor de uma coluna.
     */
    if (current && podeMudarEstado) {
      try {
        const aconteceu = acontecimentoDoPatch(current, updates);
        const transicao = aconteceu
          ? transicaoDoPedido({
              acontecimento: aconteceu.acontecimento,
              estadoActual: current.status,
              detalhe: aconteceu.detalhe,
            })
          : null;
        if (transicao) {
          (updates as Partial<Quote>).status = transicao.status;
          (updates as Partial<Quote>).activityLog = [
            ...((updates as Partial<Quote>).activityLog ?? current.activityLog ?? []),
            transicao.entrada,
          ].slice(-5000);
        }
      } catch (e) {
        log.error("orcamento PATCH: transição automática de estado falhou", e, { id });
      }
    }

    const updated = await updateQuote(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    /**
     * GANHO À MÃO É GANHO À MESMA — E A PRODUÇÃO ARRANCA PREENCHIDA.
     *
     * Isto acontecia quando o cliente carregava em «Aceitar proposta» no link.
     * Esse botão saiu (a resposta do casal passa a ser por email ou telefone),
     * e o aceite passa a ser esta gravação: alguém marca o pedido como «Ganho».
     * Sem esta chamada, a equipa perdia o plano de produção pré-preenchido e
     * ninguém ligaria a perda ao botão que desapareceu.
     *
     * Só quando ESTE pedido põe o estado em «aceite» — pela mão dela ou pela
     * transição automática de um pagamento recebido. Correr em cada gravação de
     * um pedido já ganho era um ler-modificar-escrever a mais por cada tecla.
     *
     * Melhor esforço, e de propósito: o estado já está gravado: se a sementeira
     * falhar, perde-se uma lista pré-preenchida, não o negócio.
     */
    if (updated.status === "aceite" && (updates as Partial<Quote>).status === "aceite") {
      try {
        await semearProducaoAoGanhar(id, new Date().toISOString());
      } catch (e) {
        log.error("orcamento PATCH: sementeira da produção falhou", e, { id });
      }
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * A ANÁLISE DE PROPOSTAS LÊ OUTRO LIVRO — E TINHA DE SER ESTA ROTA A
     * ESCREVER LÁ TAMBÉM
     * ════════════════════════════════════════════════════════════════════════
     *
     * O gesto «Já responderam? Ganho / Perdido» faz PATCH e escreve só no
     * PEDIDO. Mas `analise-de-propostas.ts` lê `Proposal.status` e
     * `Proposal.lostReason` — quem marcava «Ganho» deixava a proposta em
     * «enviada» para sempre, a taxa de fecho ficava nula, e os casamentos
     * ganhos contavam como «ainda sem resposta».
     *
     * Propaga-se para a proposta MAIS RECENTE do pedido (a mesma que o portal
     * do cliente mostra — `getProposalByQuote`), em dois momentos:
     *
     *  1. `desfechoConfirmadoAgora` — ESTE PATCH é quem decide o desfecho, à
     *     mão ou pela transição automática de cima. Vai `status` e
     *     `respondedAt`, e — só quando é perdido — o motivo, se já vier.
     *  2. `motivoAcrescentadoDepois` — o segundo passo, opcional, de
     *     `PerguntaDeDesfecho`: o pedido já está «rejeitado» de um PATCH
     *     anterior, e chega só o motivo (ou a nota), sem `status` nenhum no
     *     corpo. Sem isto, o motivo escrito nos botões nunca saía do PEDIDO —
     *     que nem sequer o guarda — e a contagem continuava a ler zero.
     *
     * O motivo só propaga quando é um dos {@link MotivoDeRecusa} fechados
     * (`ehMotivoDeRecusa`): um texto livre escrito noutro sítio (o editor de
     * `AdminClient`) não é uma das cinco palavras que a contagem sabe ler, e
     * escrevê-lo por cima do que lá estivesse teria estragado uma proposta
     * respondida a partir de uma nota que não é a dela.
     *
     * Melhor esforço, como a sementeira acima: o pedido já está gravado — se
     * isto falhar, a análise fica incompleta, não o negócio.
     */
    const estadoDesteGravou = (updates as Partial<Quote>).status;
    const desfechoConfirmadoAgora =
      (estadoDesteGravou === "aceite" || estadoDesteGravou === "rejeitado") &&
      updated.status === estadoDesteGravou;
    const motivoAcrescentadoDepois =
      !desfechoConfirmadoAgora &&
      updated.status === "rejeitado" &&
      (ehMotivoDeRecusa(updates.lostReason) || lostNote !== undefined);

    if (desfechoConfirmadoAgora || motivoAcrescentadoDepois) {
      try {
        const proposta = await getProposalByQuote(id);
        if (proposta) {
          const patchProposta: Partial<Proposal> = {};
          if (desfechoConfirmadoAgora) {
            patchProposta.status = updated.status === "aceite" ? "aceite" : "rejeitada";
            patchProposta.respondedAt = new Date().toISOString();
          }
          if (updated.status === "rejeitado") {
            if (ehMotivoDeRecusa(updates.lostReason)) patchProposta.lostReason = updates.lostReason;
            if (lostNote !== undefined) patchProposta.lostNote = lostNote;
          }
          if (Object.keys(patchProposta).length > 0) {
            await updateProposal(proposta.id, patchProposta);
          }

          /**
           * ══════════════════════════════════════════════════════════════════
           * O CONTRATO NASCE QUANDO A EQUIPA MARCA «GANHO» — POR ASSINAR
           * ══════════════════════════════════════════════════════════════════
           *
           * `createContract` e `createContractIfAbsent` não tinham um único
           * chamador de produção: nasciam do fluxo de
           * aceitação por botão que saiu (ver `nada-de-aceitar-por-botao.test.ts`).
           * Ficaram órfãos o PDF do contrato, os termos com versão e
           * congelamento, e o botão do portal do casal.
           *
           * `createContractIfAbsent` é o LOCK: marcar «Ganho» duas vezes (dois
           * separadores, uma correção para trás e para a frente) não nasce dois
           * contratos — a segunda chamada encontra o primeiro pela `proposalId`
           * e não faz nada.
           *
           * ── O QUE ESTE CONTRATO NÃO FINGE ─────────────────────────────────
           * O aceite electrónico antigo guardava nome, hora, IP e termos
           * congelados — provas de que o CLIENTE tinha carregado no botão.
           * Quem marca agora é a EQUIPA, a partir de um email, um telefonema ou
           * um WhatsApp, e não há aqui nem nome escrito, nem IP, nem o
           * momento em que o casal disse que sim — só o momento em que a
           * equipa o registou. Por isso o contrato nasce com `status:
           * "pendente"` — por assinar — e SEM `acceptedAt`/`acceptedName`/
           * `acceptedIp`: inventá-los seria fingir um aceite que este sistema
           * não presenciou. Quem assina (e como isso fica confirmado) continua
           * a ser tratado fora do sistema; `updateContract` já existe para o
           * dia em que essa confirmação ganhar um caminho próprio.
           *
           * Os termos vão CONGELADOS na versão actual (`TERMS_VERSION`),
           * calculados sobre a percentagem de sinal DESTA proposta — não os
           * 30% por omissão — exactamente como o aceite antigo fazia. O selo
           * do PDF (sha256/bytes) só vai quando a proposta o tem: propostas
           * enviadas antes desse campo existir ficam sem selo, e é assim que
           * deve ser — um selo inventado a posteriori não provaria nada.
           */
          if (desfechoConfirmadoAgora && updated.status === "aceite") {
            await createContractIfAbsent({
              id: newContractId(),
              quoteId: id,
              proposalId: proposta.id,
              clientName: proposta.clientName,
              clientEmail: proposta.clientEmail,
              termsVersion: TERMS_VERSION,
              termsSnapshot: termsToPlainText(
                termosPara(depositPercentOf(proposta.doc as ProposalDoc | undefined)),
              ),
              status: "pendente",
              createdAt: new Date().toISOString(),
              ...(proposta.pdfSha256 !== undefined
                ? { propostaPdfSha256: proposta.pdfSha256 }
                : {}),
              ...(proposta.pdfBytes !== undefined ? { propostaPdfBytes: proposta.pdfBytes } : {}),
            });
          }
        }
      } catch (e) {
        log.error("orcamento PATCH: propagação para a proposta/contrato falhou", e, { id });
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    log.error("orcamento PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O PAINEL DE «GANHO»: O QUE VAI NASCER, E SÓ DEPOIS DE ELA CARREGAR EM GERAR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PROPOSTA-ACEITE.md`: "Não vou gerar nada sem confirmação... Marcar como
 * aceite mostra um painel com o que vai ser gerado e quantas linhas de cada;
 * ela carrega em gerar." Duas acções no mesmo corpo — `{ acao: "prever" }`
 * NÃO escreve nada; `{ acao: "gerar" }` escreve, e é chamável quantas vezes
 * ela quiser sem duplicar (ver `gerarEventoAoGanhar`).
 *
 * Só faz sentido depois de o pedido estar «aceite» — antes disso não há
 * total resolvido nem faz sentido nenhuma das quatro peças.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const acao = body && typeof body === "object" ? (body as Record<string, unknown>).acao : null;
  if (acao !== "prever" && acao !== "gerar") {
    return NextResponse.json({ error: "acao tem de ser 'prever' ou 'gerar'" }, { status: 400 });
  }

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    if (quote.status !== "aceite") {
      return NextResponse.json(
        { error: "O pedido ainda não está marcado como Ganho" },
        { status: 409 },
      );
    }

    if (acao === "prever") {
      return NextResponse.json(await preverGeracaoDoEvento(quote));
    }

    const resultado = await gerarEventoAoGanhar(quote, new Date().toISOString());
    return NextResponse.json(resultado);
  } catch (err) {
    log.error("orcamento POST (geração ao ganhar) falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Hard delete — for junk/test leads. This is deliberately distinct from
// archiving (PATCH { archived: true }), a reversible soft-delete that keeps the
// record. Deleting only removes the quote itself: the contracts and the already
// issued invoices are fiscal records and are intentionally left untouched — the
// invoices table outlives the invoicing code, which moved out of this app.
// (Draft proposals are left too — proposals-store exposes no clean delete
// helper.)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteQuote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("orcamento DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
