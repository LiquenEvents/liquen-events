'use client';

import { useEffect, useState, useCallback } from 'react';

interface Item {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: string;
  seen: boolean;
}
interface FullMessage extends Item {
  text: string;
}

export default function Inbox() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState<FullMessage | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/inbox', { cache: 'no-store' });
      const data = await res.json();
      setConfigured(data.configured);
      setItems(data.messages ?? []);
      if (data.error) setError(data.error);
    } catch {
      setError('Não foi possível carregar o e-mail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openMsg(uid: number) {
    setLoadingMsg(true);
    setOpen(null);
    setReply('');
    setSent(false);
    try {
      const res = await fetch(`/api/inbox/${uid}`, { cache: 'no-store' });
      if (res.ok) setOpen(await res.json());
    } finally {
      setLoadingMsg(false);
    }
  }

  async function sendReply() {
    if (!open || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: open.fromAddress,
          subject: open.subject.startsWith('Re:') ? open.subject : `Re: ${open.subject}`,
          message: reply,
        }),
      });
      if (res.ok) { setSent(true); setReply(''); }
    } finally {
      setSending(false);
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (configured === false) {
    return (
      <div className="border border-foreground/10 rounded-sm p-8 text-center">
        <p className="text-foreground/55 text-sm mb-2">Inbox não configurado</p>
        <p className="text-foreground/35 text-xs max-w-md mx-auto leading-relaxed">
          Para ler aqui os e-mails recebidos, defina as variáveis <code className="text-moss">IMAP_HOST</code>,
          <code className="text-moss"> IMAP_PORT</code>, <code className="text-moss">IMAP_USER</code> e
          <code className="text-moss"> IMAP_PASS</code> (no Gmail use a mesma palavra-passe de app do envio).
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-8">
      {/* List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">Caixa de entrada</p>
          <button
            onClick={load}
            className="px-3 py-1.5 border border-foreground/15 text-foreground/40 text-[10px] tracking-[0.2em] uppercase rounded-sm hover:border-foreground/30 transition-colors"
          >
            {loading ? '…' : 'Actualizar'}
          </button>
        </div>
        {error && <p className="text-moss/70 text-xs mb-3">{error}</p>}
        {loading && items.length === 0 ? (
          <p className="text-foreground/25 text-sm py-12 text-center">A carregar…</p>
        ) : items.length === 0 ? (
          <p className="text-foreground/25 text-sm py-12 text-center">Sem mensagens.</p>
        ) : (
          <div className="flex flex-col">
            {items.map((m) => (
              <button
                key={m.uid}
                onClick={() => openMsg(m.uid)}
                className={`text-left px-4 py-3 border-b border-foreground/8 transition-colors ${
                  open?.uid === m.uid ? 'bg-moss/6' : 'hover:bg-surface-raised/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span className={`text-sm truncate ${m.seen ? 'text-foreground/55' : 'text-foreground font-medium'}`}>
                    {m.from}
                  </span>
                  <span className="text-foreground/25 text-[10px] shrink-0">{fmt(m.date)}</span>
                </div>
                <p className="text-foreground/40 text-xs truncate">{m.subject}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail */}
      <div>
        {loadingMsg ? (
          <div className="border border-foreground/10 rounded-sm p-8 text-center text-foreground/25 text-sm">A abrir…</div>
        ) : open ? (
          <div className="border border-foreground/10 rounded-sm sticky top-8 max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-foreground/8">
              <p className="text-foreground/70 text-sm font-medium mb-0.5">{open.subject}</p>
              <p className="text-foreground/35 text-xs">{open.from} · {open.fromAddress}</p>
              <p className="text-foreground/22 text-[10px] mt-1">{fmt(open.date)}</p>
            </div>
            <div className="px-5 py-4 border-b border-foreground/8">
              <p className="text-foreground/55 text-xs leading-relaxed whitespace-pre-wrap">
                {open.text || '(sem conteúdo de texto)'}
              </p>
            </div>
            <div className="p-5">
              <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-3">Responder</p>
              {sent ? (
                <p className="text-moss text-xs">✓ Resposta enviada para {open.fromAddress}.</p>
              ) : (
                <>
                  <textarea
                    rows={4}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Escreva a resposta…"
                    className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50 resize-none mb-3"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className={`w-full py-2.5 rounded-sm text-[11px] tracking-[0.2em] uppercase transition-all ${
                      sending || !reply.trim() ? 'bg-moss/40 text-cream/50 cursor-not-allowed' : 'bg-moss text-cream hover:bg-moss-dark'
                    }`}
                  >
                    {sending ? 'A enviar…' : 'Enviar Resposta →'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-center border border-foreground/6 rounded-sm text-foreground/18 text-sm h-40">
            Seleccione uma mensagem
          </div>
        )}
      </div>
    </div>
  );
}
