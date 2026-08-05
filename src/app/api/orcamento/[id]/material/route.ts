import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { rotularPontos } from "@/lib/orcamento/decoracao";
import { listMaterial } from "@/lib/material-store";
import { listLists } from "@/lib/material-lists-store";
import { listAllListItems } from "@/lib/material-list-items-store";
import { listRules } from "@/lib/material-rules-store";
import { gerarChecklist, type ContextoEvento } from "@/lib/material-rules";
import { getForQuote, createEventMaterial, updateEventMaterial } from "@/lib/event-material-store";
import {
  listItemsOfEvent,
  addEventItem,
  removeItemsOfEvent,
} from "@/lib/event-material-items-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O que a proposta diz, na forma que o motor de regras percebe.
 *
 * Os serviços vivem no DOCUMENTO da proposta (`proposal.doc`), escrito no
 * estúdio — não no pedido. O pedido só traz o que o casal preencheu, e é aí
 * que está o número de convidados e os pontos de decoração que marcaram.
 * Ambos contam: uma proposta ainda por escrever não pode impedir a checklist
 * de existir com os essenciais.
 */
async function contextoDoPedido(quoteId: string): Promise<ContextoEvento | null> {
  const [quote, proposta] = await Promise.all([getQuote(quoteId), getProposalByQuote(quoteId)]);
  if (!quote) return null;

  const grupos = proposta?.doc?.serviceGroups ?? [];
  const servicos = grupos.flatMap((g) =>
    (g.items ?? []).map((i) => `${g.title ?? ""} ${i.label ?? ""}`.trim()),
  );
  // Os pontos que o casal marcou no pedido são serviços para efeitos de regra:
  // "arco floral" escolhido no formulário tem de disparar a mesma regra que
  // "arco floral" escrito na proposta.
  const pontos = rotularPontos(quote.decorPoints ?? [], "pt");

  return {
    servicos: [...servicos, ...pontos],
    // Tudo num só texto: é o que deixa uma regra de `texto` apanhar "velas"
    // escrito na DESCRIÇÃO de um item, e não só no título de um serviço.
    texto: [
      quote.notes ?? "",
      ...servicos,
      ...pontos,
      ...grupos.flatMap((g) => (g.items ?? []).map((i) => i.desc ?? "")),
    ].join(" \n "),
    // Sem número, fica 0 — o que faz as quantidades que escalam ficarem pelo
    // mínimo da linha, em vez de zero.
    pax: quote.guests || 0,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const evento = await getForQuote(id);
    if (!evento) return NextResponse.json({ evento: null, itens: [] });
    return NextResponse.json({ evento, itens: await listItemsOfEvent(evento.id) });
  } catch (err) {
    log.error("material do evento GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Gera (ou regenera) a checklist deste evento.
 *
 * ── O QUE A REGENERAÇÃO NÃO PODE DESTRUIR ─────────────────────────────────
 * Regenerar depois de já se ter carregado meia carrinha não pode apagar as
 * marcações. Por isso o que já está CARREGADO, o que foi acrescentado À MÃO e
 * as notas escritas são preservados; o resto é substituído pela geração nova.
 *
 * A alternativa — apagar tudo e gerar de novo — é simples de escrever e perde
 * trabalho real de quem estava no armazém. Ninguém confia numa lista que
 * apaga o que já marcou.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const ctx = await contextoDoPedido(id);
    if (!ctx) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const [catalogo, listas, linhasDeLista, regras] = await Promise.all([
      listMaterial(),
      listLists(),
      listAllListItems(),
      listRules(),
    ]);

    const geradas = gerarChecklist(ctx, { regras, listas, linhasDeLista, catalogo });

    let evento = await getForQuote(id);
    const anteriores = evento ? await listItemsOfEvent(evento.id) : [];
    // Guardado por `itemId` porque é a identidade estável entre gerações; as
    // linhas manuais não têm par na geração e vão à parte.
    const preservar = new Map(
      anteriores
        .filter((i) => i.loadedAt || i.note || i.vehicleId)
        .map((i) => [i.itemId ?? i.id, i]),
    );
    const manuais = anteriores.filter((i) => i.origin === "manual");

    if (!evento) {
      evento = await createEventMaterial({ quoteId: id, status: "preparada", vehicles: [] });
    } else {
      await removeItemsOfEvent(evento.id);
      await updateEventMaterial(evento.id, { generatedAt: new Date().toISOString() });
    }

    for (const g of geradas) {
      const antes = preservar.get(g.itemId);
      await addEventItem({
        eventId: evento.id,
        itemId: g.itemId,
        name: g.name,
        category: g.category,
        unit: g.unit,
        kind: g.kind,
        qty: g.qty,
        critical: g.critical,
        origin: g.origin,
        originRef: g.originRef,
        originLabel: g.originLabel,
        // O que a pessoa fez continua lá.
        vehicleId: antes?.vehicleId,
        loadedAt: antes?.loadedAt,
        loadedBy: antes?.loadedBy,
        note: antes?.note,
        missing: false,
      });
    }

    for (const m of manuais) {
      await addEventItem({ ...m, id: undefined, eventId: evento.id });
    }

    return NextResponse.json({
      evento,
      itens: await listItemsOfEvent(evento.id),
      preservadas: preservar.size,
      manuais: manuais.length,
    });
  } catch (err) {
    log.error("material do evento POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
