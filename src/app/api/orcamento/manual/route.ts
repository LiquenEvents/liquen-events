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

  try {
    const b = await request.json();
    // Bound every free-text field (defense-in-depth against storage abuse), the
    // same way the public quote schema does — admin-only, but still validated.
    const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
    const name = str(b.name, 120).trim();
    if (!name) {
      return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });
    }

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
      guests: Math.min(Math.max(Number(b.guests) || 0, 0), 100000),
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
      status: b.status ?? "em_revisao",
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
      quotedPrice: b.quotedPrice ? Number(b.quotedPrice) : undefined,
    };

    await createQuote(quote);
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    log.error("orcamento manual POST falhou", err);
    return NextResponse.json({ error: "Erro ao criar o pedido" }, { status: 500 });
  }
}
