import { NextRequest, NextResponse } from "next/server";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { quoteUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    // Public endpoint (confirmation page loads by reference id). Authenticated
    // staff get the full record; anyone else gets a redacted view with no
    // personal data, so an enumerated id can never leak PII.
    if (isAuthed(request)) {
      return NextResponse.json(quote);
    }
    const { name, email, phone, company, nif, notes, ...safe } = quote;
    void [name, email, phone, company, nif, notes];
    return NextResponse.json(safe);
  } catch (err) {
    log.error("[orcamento GET id]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const raw = await request.json().catch(() => null);
  const parsed = quoteUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  try {
    const updated = await updateQuote(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    log.error("[orcamento PATCH]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
