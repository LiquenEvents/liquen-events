import { NextRequest, NextResponse } from 'next/server';
import type { Quote, QuoteFormData, PriceBreakdown } from '../../orcamento/types';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from '../../orcamento/data';
import { sendMail, esc } from '@/lib/mail';
import { createQuote, listQuotes } from '@/lib/quotes-store';
import { isAuthed } from '@/lib/admin-auth';
import { sendPushToAll } from '@/lib/push';
import { rateLimit, clientIp, sweep } from '@/lib/rate-limit';
import { quotePayloadSchema, firstError } from '@/lib/validation';
import { log } from '@/lib/logger';

function generateId(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LIQ-${now}-${rand}`;
}

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

function buildEmail(id: string, form: QuoteFormData, breakdown?: PriceBreakdown): string {
  const cat = CATEGORIES.find((c) => c.id === form.category)?.label ?? '—';
  const et = form.category && form.eventType
    ? EVENT_TYPES_BY_CATEGORY[form.category]?.find((e) => e.id === form.eventType)?.label ?? '—'
    : '—';
  const pkg = PACKAGES.find((p) => p.id === form.packageTier)?.label ?? form.packageTier;

  const row = (label: string, value: unknown) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#777;font-size:13px;white-space:nowrap">${label}</td><td style="padding:6px 0;color:#111;font-size:13px;font-weight:600">${esc(value) || '—'}</td></tr>`;

  const addons = form.addons?.length
    ? form.addons.map((a) => `${esc(a.name)} (${esc(a.tier)})`).join(', ')
    : '—';

  const estimate = breakdown
    ? `${eur(breakdown.rangeMin)} – ${eur(breakdown.rangeMax)}${breakdown.isEstimate ? ' (estimativa)' : ''}`
    : '—';

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="font-size:18px;margin:0 0 4px">Novo pedido de orçamento</h2>
    <p style="color:#888;font-size:12px;margin:0 0 20px">Referência <strong style="color:#4a7c59">${esc(id)}</strong> · ${new Date().toLocaleString('pt-PT')}</p>
    <table style="border-collapse:collapse;width:100%">
      ${row('Nome', form.name)}
      ${row('Email', form.email)}
      ${row('Telefone', form.phone)}
      ${form.company ? row('Empresa', form.company) : ''}
      ${form.nif ? row('NIF', form.nif) : ''}
      <tr><td colspan="2" style="padding:12px 0 4px"><hr style="border:none;border-top:1px solid #eee"></td></tr>
      ${row('Categoria', cat)}
      ${row('Tipo de evento', et)}
      ${row('Data', form.date)}
      ${row('Convidados', form.guests)}
      ${row('Local', form.location || form.locationType)}
      ${row('Pacote', pkg)}
      ${row('Extras', addons)}
      ${row('Orçamento estimado', estimate)}
      ${form.notes ? row('Notas', form.notes) : ''}
    </table>
  </div>`;
}

export async function POST(request: NextRequest) {
  try {
    sweep();
    const limited = rateLimit(`orcamento:${clientIp(request)}`, 5, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Demasiados pedidos. Tente novamente dentro de momentos.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = quotePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const { form, breakdown } = parsed.data as unknown as { form: QuoteFormData; breakdown: PriceBreakdown };

    const id = generateId();

    const quote: Quote = {
      ...form,
      id,
      submittedAt: new Date().toISOString(),
      status: 'pendente',
      priceBreakdown: breakdown,
    };

    // Notify the team by email (primary delivery, works on serverless).
    try {
      await sendMail({
        subject: `Orçamento ${id} — ${form.name}`,
        html: buildEmail(id, form, breakdown),
        replyTo: form.email,
      });
    } catch (mailErr) {
      log.error('orcamento: email falhou', mailErr, { id });
    }

    // Persist (Supabase when configured; local file in dev).
    try {
      await createQuote(quote);
    } catch (storeErr) {
      log.error('orcamento: persistência falhou', storeErr, { id });
    }

    // Push notification to the team's devices.
    try {
      await sendPushToAll({
        title: 'Novo pedido de orçamento',
        body: `${form.name}${form.guests ? ` · ${form.guests} convidados` : ''}`,
        url: '/orcamento/admin',
        tag: 'novo-orcamento',
      });
    } catch (pushErr) {
      log.error('orcamento: push falhou', pushErr, { id });
    }

    return NextResponse.json({ id, status: 'ok' });
  } catch (err) {
    log.error('orcamento POST falhou', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const quotes = await listQuotes();
    return NextResponse.json(quotes);
  } catch (err) {
    log.error('orcamento GET falhou', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
