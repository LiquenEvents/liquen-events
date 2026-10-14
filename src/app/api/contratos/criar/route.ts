import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { nascerContratoDoGanho } from "@/lib/contrato-do-ganho";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * «Criar contrato», nas Propostas Aceites, para um negócio ganho que ainda não
 * o tem — os ganhos de antes desta regra, ou os que passaram por um caminho que
 * não o criava. É ela que carrega: nada aqui cria contratos sozinho para trás.
 *
 * Usa a proposta aceite do pedido, ou a mais recente. Sem proposta não há
 * termos nem sinal a congelar — 409, e o ecrã já o diz antes de chegar aqui.
 * Idempotente por proposta (`createContractIfAbsent`): carregar duas vezes não
 * cria dois.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => null)) as { quoteId?: unknown } | null;
    const quoteId = typeof body?.quoteId === "string" ? body.quoteId : "";
    if (!quoteId) return NextResponse.json({ error: "Falta o pedido" }, { status: 400 });
    const pedido = await getQuote(quoteId);
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    const propostas = await listProposalsForQuote(quoteId);
    const ordenadas = [...propostas].sort((a, b) =>
      (b.respondedAt ?? b.sentAt ?? b.createdAt ?? "").localeCompare(
        a.respondedAt ?? a.sentAt ?? a.createdAt ?? "",
      ),
    );
    const proposta = ordenadas.find((p) => p.status === "aceite") ?? ordenadas[0];
    if (!proposta) {
      return NextResponse.json(
        { error: "Este pedido não tem proposta — não há termos a registar." },
        { status: 409 },
      );
    }
    const { created, contract } = await nascerContratoDoGanho(quoteId, proposta);
    return NextResponse.json({ ok: true, criado: created, contrato: contract });
  } catch (err) {
    log.error("contratos/criar falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
