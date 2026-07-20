import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listTemplatesWithDefaults, upsertTemplate } from "@/lib/email-templates-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listTemplatesWithDefaults());
  } catch (err) {
    log.error("email-templates GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** Upsert a single template. POST and PUT behave identically (create-or-update). */
async function upsert(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const key = String(body?.key ?? "").trim();
    if (!key) return NextResponse.json({ error: "Chave obrigatória" }, { status: 400 });

    const name = String(body?.name ?? "").trim();
    const subject = String(body?.subject ?? "").trim();
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Assunto obrigatório" }, { status: 400 });

    const saved = await upsertTemplate({
      key,
      name,
      subject,
      body: String(body?.body ?? ""),
    });
    return NextResponse.json(saved);
  } catch (err) {
    log.error("email-templates upsert falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const POST = upsert;
export const PUT = upsert;
