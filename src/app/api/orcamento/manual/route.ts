import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "@/lib/orcamento/types";
import { createQuote, generateQuoteId } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Create a quote/event manually from the back-office (e.g. a client who
 * phoned or emailed). Admin-only. No client email is sent.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Parse defensively: a malformed or non-object JSON body must yield a clean
  // 400, not an uncaught 500 (an unguarded request.json() throws on bad JSON,
  // and a null/scalar body then blows up the property reads below with a
  // TypeError). Mirrors the public POST and the [id] PATCH route.
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  try {
    // Bound every free-text field (defense-in-depth against storage abuse), the
    // same way the public quote schema does — admin-only, but still validated.
    const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
    const name = str(b.name, 120).trim();
    if (!name) {
      return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });
    }

    // Price mirrors the bounds the public schema and admin PATCH enforce (finite,
    // 0..10M). A non-numeric entry ("abc" → NaN) or an out-of-range value must
    // never reach the store, or it corrupts revenue maths, exports and the
    // jsonb blob (NaN serialises to null silently). Absent/empty → undefined.
    const money = (v: unknown): number | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10_000_000) : undefined;
    };
    // Only a real QuoteStatus may be persisted — an arbitrary string would break
    // the admin list's status filters and the pipeline stats.
    const STATUSES: readonly Quote["status"][] = [
      "pendente",
      "em_revisao",
      "cotado",
      "aceite",
      "rejeitado",
    ];
    const status: Quote["status"] = STATUSES.includes(b.status) ? b.status : "em_revisao";

    const id = generateQuoteId();
    const quote: Quote = {
      // QuoteFormData defaults
      category: b.category ?? null,
      eventType: b.eventType ?? null,
      eventName: str(b.eventName, 160),
      date: str(b.date, 40),
      endDate: "",
      location: str(b.location, 200),
      locationType: "lisboa",
      guests: Math.min(Math.max(Math.floor(Number(b.guests) || 0), 0), 100000),
      duration: 4,
      isMultiDay: false,
      packageTier: "completo",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: str(b.notes, 5000),
      referralSource: str(b.referralSource, 120) || "Contacto direto",
      name,
      email: str(b.email, 200),
      phone: str(b.phone, 40),
      company: str(b.company, 160),
      nif: "",
      acceptTerms: true,
      acceptMarketing: false,
      // Quote meta
      id,
      submittedAt: new Date().toISOString(),
      status,
      priceBreakdown: {
        basePrice: 0,
        guestCost: 0,
        packageMultiplier: 1,
        locationSurcharge: 0,
        weekendSurcharge: 0,
        seasonSurcharge: 0,
        urgencySurcharge: 0,
        addonsCost: 0,
        subtotal: 0,
        iva: 0,
        total: 0,
        rangeMin: 0,
        rangeMax: 0,
        isEstimate: true,
      },
      quotedPrice: money(b.quotedPrice),
    };

    await createQuote(quote);
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    log.error("orcamento manual POST falhou", err);
    return NextResponse.json({ error: "Erro ao criar o pedido" }, { status: 500 });
  }
}
