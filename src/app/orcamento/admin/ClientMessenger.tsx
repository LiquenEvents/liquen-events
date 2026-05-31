'use client';

import { useState } from 'react';
import type { Quote, QuoteMessage } from '../types';

interface Props {
  quote: Quote;
  onSent?: (messages: QuoteMessage[]) => void;
}

// Quick-reply templates. {nome} is replaced with the client's first name.
const TEMPLATES: { label: string; text: string }[] = [
  {
    label: 'Agradecer pedido',
    text: 'Olá {nome},\n\nObrigada pelo seu pedido! Recebemos os detalhes do seu evento e a nossa equipa vai analisá-los com todo o cuidado. Entraremos em contacto em breve com os próximos passos.\n\nCom os melhores cumprimentos,\nEquipa Líquen Events',
  },
  {
    label: 'Marcar reunião',
    text: 'Olá {nome},\n\nGostaríamos de marcar uma breve conversa para perceber melhor a sua visão para o evento. Tem disponibilidade esta semana? Diga-nos os dias e horas que lhe forem mais convenientes.\n\nAté breve,\nEquipa Líquen Events',
  },
  {
    label: 'Seguimento proposta',
    text: 'Olá {nome},\n\nQueríamos saber se teve oportunidade de analisar a nossa proposta e se podemos esclarecer alguma questão. Estamos ao dispor para ajustar qualquer detalhe.\n\nCom os melhores cumprimentos,\nEquipa Líquen Events',
  },
];

export default function ClientMessenger({ quote, onSent }: Props) {
  const [messages, setMessages] = useState<QuoteMessage[]>(quote.messages ?? []);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const firstName = (quote.name || '').trim().split(/\s+/)[0] || '';
  function applyTemplate(tpl: string) {
    setText(tpl.replace(/\{nome\}/g, firstName));
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      const next = data.quote?.messages ?? [...messages, { at: new Date().toISOString(), body }];
      setMessages(next);
      setText('');
      onSent?.(next);
      if (!data.emailed) setNote('Mensagem registada (e-mail não configurado — não foi enviada).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">Responder ao Cliente</p>
        <span className="text-foreground/20 text-[10px]">{quote.email}</span>
      </div>

      {/* History */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-2 mb-4 max-h-48 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className="rounded-sm bg-moss/8 border border-moss/15 px-3 py-2">
              <p className="text-foreground/55 text-xs leading-relaxed whitespace-pre-wrap">{m.body}</p>
              <p className="text-foreground/22 text-[9px] mt-1.5">
                {new Date(m.at).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Quick-reply templates */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => applyTemplate(t.text)}
            className="text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-full border border-foreground/12 text-foreground/40 hover:border-moss/40 hover:text-moss transition-colors"
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreva a mensagem que será enviada por e-mail ao cliente…"
        className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50 resize-none mb-3"
      />

      {error && <p className="text-moss/80 text-xs mb-3">{error}</p>}
      {note && <p className="text-foreground/40 text-xs mb-3">{note}</p>}

      <button
        onClick={send}
        disabled={sending || !text.trim()}
        className={`w-full py-2.5 rounded-sm text-[11px] tracking-[0.2em] uppercase transition-all ${
          sending || !text.trim()
            ? 'bg-moss/40 text-cream/50 cursor-not-allowed'
            : 'bg-moss text-cream hover:bg-moss-dark'
        }`}
      >
        {sending ? 'A enviar…' : 'Enviar E-mail →'}
      </button>
    </div>
  );
}
