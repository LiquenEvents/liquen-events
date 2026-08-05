import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { lerPreferencias, gravarPreferencias, MAX_DIAS } from "@/lib/proposal-prefs";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preferências do estúdio de propostas. Só para a equipa. */

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await lerPreferencias());
  } catch (err) {
    log.error("preferências GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const dias = Number((body as { validUntilDays?: unknown }).validUntilDays);
  if (!Number.isFinite(dias) || dias < 1 || dias > MAX_DIAS) {
    // Uma frase que diz o que fazer, em vez de um 400 mudo.
    return NextResponse.json(
      { error: `A validade tem de ser entre 1 e ${MAX_DIAS} dias.` },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await gravarPreferencias({ validUntilDays: Math.round(dias) }));
  } catch (err) {
    log.error("preferências PUT falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
