'use client';

import { useEffect, useState } from 'react';
import { useToast } from './Toast';

type State = 'unsupported' | 'unconfigured' | 'default' | 'granted' | 'denied' | 'loading';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationBell() {
  const { toast } = useToast();
  const [state, setState] = useState<State>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported');
        return;
      }
      try {
        const res = await fetch('/api/push/subscribe', { cache: 'no-store' });
        const data = await res.json();
        if (!data.configured || !data.publicKey) {
          setState('unconfigured');
          return;
        }
        setPublicKey(data.publicKey);
        setState(Notification.permission as State);
      } catch {
        setState('unconfigured');
      }
    })();
  }, []);

  async function enable() {
    if (!publicKey) return;
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission as State);
        toast('Notificações não autorizadas', 'info');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });

      setState('granted');
      toast('Notificações ativadas neste dispositivo', 'success');
    } catch (e) {
      console.error(e);
      setState('default');
      toast('Não foi possível ativar', 'error');
    }
  }

  if (state === 'loading' || state === 'unsupported' || state === 'unconfigured') {
    // Hidden when unsupported/unconfigured to keep the UI clean.
    return null;
  }

  if (state === 'granted') {
    return (
      <button
        onClick={async () => {
          try {
            const res = await fetch('/api/cron/reminders', { cache: 'no-store' });
            const data = await res.json();
            toast(data.sent > 0 ? 'Resumo enviado para os teus dispositivos' : 'Sem novidades para notificar agora', data.sent > 0 ? 'success' : 'info');
          } catch {
            toast('Não foi possível enviar', 'error');
          }
        }}
        className="flex items-center gap-2 px-3 py-2 text-moss text-[10px] tracking-[0.15em] uppercase rounded-md hover:bg-moss/8 transition-colors"
        title="Notificações ativas — clique para enviar o resumo agora"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
        </svg>
        Ativas
      </button>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={state === 'denied'}
      title={state === 'denied' ? 'Notificações bloqueadas no navegador' : 'Ativar notificações neste dispositivo'}
      className="flex items-center gap-2 px-3 py-2 border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.15em] uppercase rounded-md hover:border-moss/40 hover:text-moss transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
      </svg>
      {state === 'denied' ? 'Bloqueadas' : 'Ativar notificações'}
    </button>
  );
}
