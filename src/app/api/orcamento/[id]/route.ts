import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "@/lib/orcamento/types";
import { transicaoDoPedido, type AcontecimentoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuote, deleteQuote } from "@/lib/quotes-store";
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
    return NextResponse.json(updated);
  } catch (err) {
    log.error("orcamento PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Hard delete — for junk/test leads. This is deliberately distinct from
// archiving (PATCH { archived: true }), a reversible soft-delete that keeps the
// record. Deleting only removes the quote itself: related invoices and
// contracts are fiscal records and are intentionally left untouched. (Draft
// proposals are left too — proposals-store exposes no clean delete helper.)
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
