import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getInvoice, updateInvoice, type Invoice } from "@/lib/invoices-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const VALID_STATUS: Invoice["status"][] = ["emitida", "paga", "anulada"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (err) {
    log.error("faturas GET (id) falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const patch: Partial<Invoice> = {};

    if ("status" in body) {
      if (!VALID_STATUS.includes(body.status)) {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      }
      patch.status = body.status;
      // Keep paidAt in lockstep with the status unless the caller set it
      // explicitly: marking paga stamps today, un-paying (or annulling) clears it.
      if (body.status === "paga" && !("paidAt" in body)) {
        patch.paidAt = new Date().toISOString().slice(0, 10);
      } else if (body.status !== "paga") {
        patch.paidAt = undefined;
      }
    }

    if ("paidAt" in body) {
      const s = String(body.paidAt ?? "").slice(0, 10);
      patch.paidAt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    }
    if ("note" in body) {
      patch.note = body.note
        ? String(body.note)
            .replace(/[\r\n]+/g, " ")
            .slice(0, 500)
        : undefined;
    }
    if ("dueAt" in body) {
      const s = String(body.dueAt ?? "").slice(0, 10);
      patch.dueAt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    }

    const updated = await updateInvoice(id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    log.error("faturas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
