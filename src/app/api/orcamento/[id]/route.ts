import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "@/lib/orcamento/types";
import { getQuote, updateQuote, deleteQuote } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quoteUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

// The store is server-only and reaches for node:crypto — pin the Node runtime.
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Public endpoint (confirmation page loads by reference id). Authenticated
    // staff get the full record; anyone else gets an explicit allowlist of the
    // event facts the confirmation page renders — never the client's personal
    // data nor internal CRM fields (adminNotes, activityLog, payments, guest
    // list, lost reason…), so an enumerated id can't leak anything sensitive.
    // The id's random suffix has 64 bits of entropy, but rate limiting still
    // slows down brute-force scanning to a crawl for the unauthenticated path.
    if (!isAuthed(request)) {
      sweep();
      const limited = await rateLimit(`orcamento-get:${clientIp(request)}`, 20, 60_000);
      if (!limited.ok) {
        return NextResponse.json(
          { error: "Demasiados pedidos. Tente novamente dentro de momentos." },
          { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
        );
      }
    }

    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
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
    "productionPlan",
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

// Hard delete — for junk/test leads. This is deliberately distinct from
// archiving (PATCH { archived: true }), a reversible soft-delete that keeps the
// record. Deleting only removes the quote itself: related invoices and
// contracts are fiscal records and are intentionally left untouched. (Draft
// proposals are left too — proposals-store exposes no clean delete helper.)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteQuote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("orcamento DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
