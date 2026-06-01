import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "../../../orcamento/types";
import { createQuote } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { manualQuoteSchema, firstError } from "@/lib/validation";
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

  try {
    const raw = await request.json().catch(() => null);
    const parsed = manualQuoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const b = parsed.data;

    const id = `LIQ-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const quote: Quote = {
      category: b.category ?? null,
      eventType: (b.eventType as Quote["eventType"]) ?? null,
      eventName: b.eventName,
      date: b.date,
      endDate: "",
      location: b.location,
      locationType: "lisboa",
      guests: b.guests,
      duration: 4,
      isMultiDay: false,
      packageTier: "completo",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: b.notes,
      referralSource: b.referralSource,
      name: b.name,
      email: b.email,
      phone: b.phone,
      company: b.company,
      nif: "",
      acceptTerms: true,
      acceptMarketing: false,
      id,
      submittedAt: new Date().toISOString(),
      status: b.status,
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
      quotedPrice: b.quotedPrice,
    };

    await createQuote(quote);
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    log.error("[orcamento manual POST]", err);
    return NextResponse.json({ error: "Erro ao criar o pedido" }, { status: 500 });
  }
}
