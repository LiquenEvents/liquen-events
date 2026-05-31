'use client';

import { useState } from 'react';
import { randomId, eur2 } from './util';
import { useToast } from './Toast';
import type { Quote, Payment, PaymentKind } from '../types';

const KIND_LABEL: Record<PaymentKind, string> = { sinal: 'Sinal', pagamento: 'Pagamento', saldo: 'Saldo final' };

interface Props {
  quote: Quote;
  onChange: (payments: Payment[]) => void;
}

export default function PaymentsPanel({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>(quote.payments ?? []);
  const [kind, setKind] = useState<PaymentKind>('sinal');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);

  const total = quote.quotedPrice ?? quote.priceBreakdown?.total ?? 0;
  const paidSum = payments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, total - paidSum);

  function persist(next: Payment[]) {
    setPayments(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payments: next }),
    });
  }

  function add() {
    const a = parseFloat(amount);
    if (!a || a <= 0) return;
    persist([...payments, { id: randomId(), kind, amount: a, date, paid: false }]);
    setAmount('');
  }
  function togglePaid(id: string) {
    persist(payments.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));
  }
  function remove(id: string) {
    persist(payments.filter((p) => p.id !== id));
  }

  async function invoice(p: Payment, email: boolean) {
    setBusy(p.id);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/fatura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: p.kind, amount: p.amount, date: p.date, paid: p.paid, email }),
      });
      const data = await res.json();
      if (data.pdfBase64 && !email) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${data.pdfBase64}`;
        a.download = `Recibo-${data.number.replace(/\//g, '-')}.pdf`;
        a.click();
      }
      if (email) {
        toast(
          data.emailed ? `Recibo enviado para ${quote.email}` : 'Recibo gerado (e-mail não configurado)',
          data.emailed ? 'success' : 'info'
        );
      } else {
        toast('Recibo descarregado', 'success');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-4">Pagamentos &amp; Faturação</p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { l: 'Total', v: eur2(total), c: 'text-foreground/70' },
          { l: 'Recebido', v: eur2(paidSum), c: 'text-moss' },
          { l: 'Em falta', v: eur2(outstanding), c: outstanding > 0 ? 'text-[#b5654a]' : 'text-foreground/40' },
        ].map((k) => (
          <div key={k.l} className="bg-foreground/4 rounded-md p-2.5 text-center">
            <p className={`text-sm font-medium ${k.c}`}>{k.v}</p>
            <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">{k.l}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {payments.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-4">
          {payments.map((p) => (
            <div key={p.id} className="group flex items-center gap-2.5 bg-surface/40 border border-foreground/8 rounded-md px-3 py-2">
              <button onClick={() => togglePaid(p.id)} className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${p.paid ? 'bg-moss border-moss' : 'border-foreground/25 hover:border-moss/60'}`} title={p.paid ? 'Pago' : 'Marcar como pago'}>
                {p.paid && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-foreground/65 text-xs">{KIND_LABEL[p.kind]} · <span className="text-foreground/40">{new Date(p.date + 'T12:00:00').toLocaleDateString('pt-PT')}</span></p>
              </div>
              <span className={`text-xs font-medium shrink-0 ${p.paid ? 'text-moss' : 'text-foreground/50'}`}>{eur2(p.amount)}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => invoice(p, false)} disabled={busy === p.id} title="Descarregar recibo PDF" className="text-foreground/30 hover:text-moss transition-colors p-1">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button onClick={() => invoice(p, true)} disabled={busy === p.id} title="Enviar recibo por e-mail" className="text-foreground/30 hover:text-moss transition-colors p-1">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 7l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
                </button>
                <button onClick={() => remove(p.id)} className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 transition-all p-1" aria-label="Remover">×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add */}
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)} className="bg-surface border border-foreground/15 rounded-md px-2 py-1.5 text-xs text-foreground/55 focus:outline-none focus:border-moss/45">
          <option value="sinal">Sinal</option>
          <option value="pagamento">Pagamento</option>
          <option value="saldo">Saldo final</option>
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor €" className="w-24 bg-surface border border-foreground/15 rounded-md px-2 py-1.5 text-xs text-foreground/70 focus:outline-none focus:border-moss/45" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-surface border border-foreground/15 rounded-md px-2 py-1.5 text-xs text-foreground/55 focus:outline-none focus:border-moss/45" />
        <button onClick={add} className="px-3 py-1.5 rounded-md border border-foreground/15 text-foreground/45 text-xs hover:border-moss/40 hover:text-moss transition-colors">+ Registar</button>
      </div>
    </div>
  );
}
