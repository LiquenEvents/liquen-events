import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "../../../orcamento/types";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { quoteUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    // Public endpoint (confirmation page loads by reference id). Authenticated
    // staff get the full record; anyone else gets an explicit allowlist of the
    // event facts the confirmation page renders — never the client's personal
    // data nor internal CRM fields (adminNotes, activityLog, payments, guest
    // list, lost reason…), so an enumerated id can't leak anything sensitive.
    if (isAuthed(request)) {
      return NextResponse.json(quote);
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
  const body = await request.json();

  const allowed: (keyof Quote)[] = [
    "status",
    "quotedPrice",
    "adminNotes",
    "checklist",
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
    "contractRef",
    "archived",
  ];
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      picked[key] = body[key];
    }
  }

  // Allowlist says WHICH fields may change; the schema validates the VALUES
  // (status enum, numeric price, well-formed arrays) so nothing malformed is
  // ever persisted and later breaks exports or revenue calculations.
  const parsed = quoteUpdateSchema.safeParse(picked);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const updates = parsed.data as Partial<Quote>;

  try {
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
