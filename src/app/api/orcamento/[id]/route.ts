import { NextRequest, NextResponse } from 'next/server';
import type { Quote } from '../../../orcamento/types';
import { getQuote, updateQuote } from '@/lib/quotes-store';
import { isAuthed } from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
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
    console.error('[orcamento GET id]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const allowed: (keyof Quote)[] = ['status', 'quotedPrice', 'adminNotes', 'checklist', 'payments', 'timeline'];
  const updates: Partial<Quote> = {};
  for (const key of allowed) {
    if (key in body) {
      (updates as Record<string, unknown>)[key] = body[key];
    }
  }

  try {
    const updated = await updateQuote(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[orcamento PATCH]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
