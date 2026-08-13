import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getForQuote } from "@/lib/event-material-store";
import { listItemsOfEvent, updateEventItem } from "@/lib/event-material-items-store";
import { registar } from "@/lib/event-material-log-store";
import type { AccaoOffline } from "@/lib/material-offline";
import { isConflictError } from "@/lib/repository";
import { respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Descarrega até `MAX_MARCACOES` marcações, uma a uma e com escrita própria
 *  cada; os 10 s por omissão do alojamento cortavam a fila a meio e o armazém
 *  via um erro de rede depois de duas horas offline. */
export const maxDuration = 60;

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
    // Marcações que perderam uma corrida de escrita (não uma corrida de
    // relógios, que é a `ignoradas`). Contam-se à parte porque significam outra
    // coisa: alguém marcou a MESMA linha no mesmo instante a partir de outro
    // telemóvel. Ver o tratamento por marcação, mais abaixo.
    let conflitos = 0;

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
      // ── A colisão trata-se AQUI, por marcação, e nunca deita o lote fora ──
      //
      // O bloqueio optimista (ver o `touch` em event-material-items-store) pode
      // recusar esta escrita: duas pessoas a marcar a mesma linha ao mesmo
      // tempo enquanto carregam a carrinha é o caso normal desta tabela, não a
      // excepção. Se o erro subisse até ao `catch` de topo, uma linha
      // disputada devolvia 500 e levava atrás as outras trinta e nove
      // marcações de quem esteve duas horas sem rede — precisamente o que esta
      // rota existe para não deixar acontecer.
      //
      // Nada se perde ao contar em vez de atirar: o `registar` acima já gravou
      // esta marcação no registo do evento ANTES da escrita, com quem a fez e a
      // que horas. Perde-se a aplicação, nunca o facto — e ele fica
      // recuperável à mão a partir do registo.
      try {
        await updateEventItem(item.id, patch);
        aplicadas++;
      } catch (err) {
        if (!isConflictError(err)) throw err;
        conflitos++;
        log.warn("material marcar: marcação em conflito com outra pessoa na mesma linha", {
          eventId: evento.id,
          itemId,
          accao,
          actor,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      aplicadas,
      ignoradas,
      conflitos,
      itens: await listItemsOfEvent(evento.id),
    });
  } catch (err) {
    // Ver `respostaDeMigracaoEmFalta`: a checklist compara sobre `updated_at` e
    // quem está no armazém a marcar material merece saber que falta correr o
    // ficheiro, não "Erro interno" a meio de um carregamento.
    const migracao = respostaDeMigracaoEmFalta(err, "As marcações de material");
    if (migracao) return migracao;
    log.error("material marcar falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
