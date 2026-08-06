import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { deleteProposal, updateProposal } from "@/lib/proposals-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Malformed or non-object body → 400, not a 500. `null`/primitives would
    // otherwise blow up the `"status" in body` check with a TypeError.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const VALID_STATUS = ["rascunho", "enviada", "em_negociacao", "aceite", "rejeitada"];
    if ("status" in body && !VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    // Lista fechada e contável — a razão está em `MotivoDeRecusa`. Aceitar
    // texto livre aqui esvaziava a única pergunta que isto serve para
    // responder: perdemos por preço quantas vezes?
    const VALID_MOTIVO = ["preco", "data", "escolheram-outro", "sem-resposta", "outro"];
    if ("lostReason" in body && body.lostReason && !VALID_MOTIVO.includes(body.lostReason)) {
      return NextResponse.json({ error: "Motivo inválido" }, { status: 400 });
    }
    // O seguimento é uma data do calendário, não um carimbo de tempo. Uma
    // string qualquer aqui ia parar à base e voltava como `NaN` dias no painel.
    if ("followUpAt" in body && body.followUpAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.followUpAt)) {
      return NextResponse.json({ error: "Data de seguimento inválida" }, { status: 400 });
    }
    // Lista fechada, como os motivos e pela mesma razão: o que isto serve
    // para responder é "os extras vendem-se?", e uma coluna que se conta com
    // texto livre lá dentro é uma coluna que nunca mais se conta.
    if (
      "versaoEscolhida" in body &&
      body.versaoEscolhida &&
      !["base", "extras"].includes(body.versaoEscolhida)
    ) {
      return NextResponse.json({ error: "Versão inválida" }, { status: 400 });
    }
    const allowed = [
      "status",
      "respondedAt",
      "followUpAt",
      "followUpNote",
      "lostReason",
      "lostNote",
      "versaoEscolhida",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) patch[k] = body[k];
    }
    const updated = await updateProposal(id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("propostas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    await deleteProposal(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("propostas DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
