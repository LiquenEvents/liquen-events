import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getForQuote } from "@/lib/event-material-store";
import { listItemsOfEvent, updateEventItem } from "@/lib/event-material-items-store";
import { registar } from "@/lib/event-material-log-store";
import type { AccaoOffline } from "@/lib/material-offline";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOES: AccaoOffline[] = ["loaded", "unloaded", "returned", "missing", "note", "used"];

/** Um lote grande é duas horas sem rede; acima disto é engano ou abuso. */
const MAX_MARCACOES = 500;

/**
 * DESCARREGA A FILA DE MARCAÇÕES.
 *
 * Recebe um LOTE, não uma marcação de cada vez: quem esteve duas horas sem rede
 * tem quarenta para enviar, e quarenta pedidos numa ligação fraca é a maneira
 * de metade se perder.
 *
 * ── O conflito ────────────────────────────────────────────────────────────
 * Ganha a marcação mais recente pelo relógio de QUEM MARCOU, não pelo de
 * chegada. Um telemóvel offline há uma hora traz marcações mais ANTIGAS do que
 * as de quem marcou agora no armazém, mesmo chegando depois — decidir pela
 * ordem de chegada dava a vitória a quem tinha pior rede.
 *
 * A marcação que perde NÃO é deitada fora: fica no registo com `superseded`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    const marcacoes = Array.isArray(body?.marcacoes) ? body.marcacoes : [];
    if (marcacoes.length === 0) return NextResponse.json({ ok: true, aplicadas: 0 });
    if (marcacoes.length > MAX_MARCACOES) {
      return NextResponse.json({ error: "Lote demasiado grande" }, { status: 413 });
    }

    const evento = await getForQuote(id);
    if (!evento) return NextResponse.json({ error: "Sem checklist" }, { status: 404 });

    const itens = await listItemsOfEvent(evento.id);
    const porId = new Map(itens.map((i) => [i.id, i]));

    let aplicadas = 0;
    let ignoradas = 0;

    for (const m of marcacoes) {
      const itemId = typeof m?.itemId === "string" ? m.itemId : "";
      const accao = ACCOES.includes(m?.accao) ? (m.accao as AccaoOffline) : null;
      const markedAt = typeof m?.markedAt === "string" ? m.markedAt : "";
      const actor = typeof m?.actor === "string" ? m.actor.slice(0, 120) : "";
      const item = porId.get(itemId);
      if (!item || !accao || !markedAt) {
        ignoradas++;
        continue;
      }

      // A marcação que já lá está é mais recente? Então esta perdeu — mas fica
      // registada, para se poder saber que existiu.
      const carimboAtual =
        accao === "loaded" || accao === "unloaded"
          ? item.loadedAt
          : accao === "returned" || accao === "missing"
            ? item.returnedAt
            : undefined;
      const perdeu = Boolean(carimboAtual && carimboAtual > markedAt);

      await registar({
        eventId: evento.id,
        itemId,
        action: accao,
        value: typeof m?.valor === "string" ? m.valor.slice(0, 500) : undefined,
        actor,
        markedAt,
        superseded: perdeu,
      });

      if (perdeu) {
        ignoradas++;
        continue;
      }

      const patch: Record<string, unknown> = {};
      switch (accao) {
        case "loaded":
          patch.loadedAt = markedAt;
          patch.loadedBy = actor;
          break;
        case "unloaded":
          // `null` e não undefined: é uma instrução para LIMPAR o carimbo, e um
          // undefined seria ignorado pelo patch.
          patch.loadedAt = null;
          patch.loadedBy = null;
          break;
        case "returned":
          patch.returnedAt = markedAt;
          patch.returnedBy = actor;
          patch.missing = false;
          break;
        case "missing":
          patch.missing = true;
          patch.returnedAt = null;
          break;
        case "note":
          patch.note = typeof m?.valor === "string" ? m.valor.slice(0, 500) : "";
          break;
        case "used":
          patch.usedQty = Number(m?.valor) || 0;
          break;
      }
      await updateEventItem(item.id, patch);
      aplicadas++;
    }

    return NextResponse.json({
      ok: true,
      aplicadas,
      ignoradas,
      itens: await listItemsOfEvent(evento.id),
    });
  } catch (err) {
    log.error("material marcar falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
