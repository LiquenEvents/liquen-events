import { NextRequest, NextResponse } from 'next/server';
import type { Quote } from '../../../orcamento/types';
import { createQuote } from '@/lib/quotes-store';
import { isAuthed } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function generateId(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LIQ-${now}-${rand}`;
}

/**
 * Create a quote/event manually from the back-office (e.g. a client who
 * phoned or emailed). Admin-only. No client email is sent.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const b = await request.json();
    const name = String(b.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'O nome é obrigatório.' }, { status: 400 });
    }

    const id = generateId();
    const quote: Quote = {
      // QuoteFormData defaults
      category: b.category ?? null,
      eventType: b.eventType ?? null,
      eventName: b.eventName ?? '',
      date: b.date ?? '',
      endDate: '',
      location: b.location ?? '',
      locationType: 'lisboa',
      guests: Number(b.guests) || 0,
      duration: 4,
      isMultiDay: false,
      packageTier: 'completo',
      addons: [],
      budgetRange: null,
      urgency: 'standard',
      notes: b.notes ?? '',
      referralSource: b.referralSource ?? 'Contacto direto',
      name,
      email: b.email ?? '',
      phone: b.phone ?? '',
      company: b.company ?? '',
      nif: '',
      acceptTerms: true,
      acceptMarketing: false,
      // Quote meta
      id,
      submittedAt: new Date().toISOString(),
      status: b.status ?? 'em_revisao',
      priceBreakdown: {
        basePrice: 0, guestCost: 0, packageMultiplier: 1, locationSurcharge: 0,
        weekendSurcharge: 0, seasonSurcharge: 0, urgencySurcharge: 0, addonsCost: 0,
        subtotal: 0, iva: 0, total: 0, rangeMin: 0, rangeMax: 0, isEstimate: true,
      },
      quotedPrice: b.quotedPrice ? Number(b.quotedPrice) : undefined,
    };

    await createQuote(quote);
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    console.error('[orcamento manual POST]', err);
    return NextResponse.json({ error: 'Erro ao criar o pedido' }, { status: 500 });
  }
}
