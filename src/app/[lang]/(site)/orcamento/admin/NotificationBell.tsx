"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import { log } from "@/lib/logger";
import { Button } from "./ui";

function BellIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  );
}

/**
 * `unconfigured` é uma RESPOSTA do servidor («não há chaves VAPID montadas»).
 * `indisponivel` é uma AVARIA («a rota não respondeu, ou respondeu em erro»).
 *
 * Eram a mesma coisa, e é isso que este ficheiro corrige: o sino desaparecia da
 * barra nos dois casos, sem uma linha em lado nenhum, e a leitura natural de um
 * sino ausente é «isto ainda não está montado». A rota podia estar a rebentar
 * há semanas — com os pedidos de orçamento a entrar sem avisar ninguém — e não
 * havia por onde desconfiar.
 */
type State =
  | "unsupported"
  | "unconfigured"
  | "indisponivel"
  | "default"
  | "granted"
  | "denied"
  | "loading";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationBell() {
  const { toast } = useToast();
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setState("unsupported");
        return;
      }
      try {
        const res = await fetch("/api/push/subscribe", { cache: "no-store" });
        if (!res.ok) {
          log.error("push: a rota das notificações respondeu em erro", null, {
            estado: res.status,
          });
          setState("indisponivel");
          return;
        }
        const data = (await res.json()) as { configured?: boolean; publicKey?: string | null };
        if (!data.configured || !data.publicKey) {
          // Resposta legítima: não está montado. Não é erro, e não se regista —
          // um aviso que aparece todos os dias é um aviso que se aprende a ignorar.
          setState("unconfigured");
          return;
        }
        setPublicKey(data.publicKey);
        setState(Notification.permission as State);
      } catch (e) {
        log.error("push: não consegui perguntar ao servidor pelas notificações", e);
        setState("indisponivel");
      }
    })();
  }, []);

  async function enable() {
    if (!publicKey) return;
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission as State);
        toast("Notificações não autorizadas", "info");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });

      setState("granted");
      toast("Notificações ativadas neste dispositivo", "success");
    } catch (e) {
      log.error("push: registo de notificações falhou", e);
      setState("default");
      toast("Não foi possível ativar", "error");
    }
  }

  if (
    state === "loading" ||
    state === "unsupported" ||
    state === "unconfigured" ||
    state === "indisponivel"
  ) {
    // Hidden when unsupported/unconfigured to keep the UI clean. Com a rota em
    // baixo também se esconde — não há botão que resolva —, mas aí o registo já
    // levou o motivo, que era o que faltava.
    return null;
  }

  if (state === "granted") {
    return (
      <Button
        variant="subtle"
        size="sm"
        iconLeft={<BellIcon />}
        onClick={async () => {
          /**
           * TRÊS DESFECHOS, E ANTES DIZIAM-SE TODOS COM DUAS FRASES.
           *
           * `res.json()` era lido sem olhar ao `res.ok`: um 500 dava um corpo
           * `{ error: … }`, o `data.sent > 0` era falso, e saía «Sem novidades
           * para notificar agora» — a frase mais tranquilizadora do painel,
           * dita exactamente quando o sistema tinha falhado.
           *
           * «Não havia nada a dizer» e «havia e não chegou a lado nenhum» são
           * coisas diferentes, e é a diferença entre elas que decide se alguém
           * vai ver o que entrou hoje.
           */
          try {
            const res = await fetch("/api/cron/reminders", { cache: "no-store" });
            const data = (await res.json().catch(() => ({}))) as {
              sent?: number;
              falhados?: number;
            };
            if (!res.ok) {
              log.error("push: o resumo não pôde ser pedido", null, { estado: res.status });
              toast("Não foi possível enviar o resumo", "error");
              return;
            }
            if ((data.sent ?? 0) > 0) {
              toast("Resumo enviado para os teus dispositivos", "success");
            } else if ((data.falhados ?? 0) > 0) {
              toast("O resumo não chegou a nenhum dispositivo", "error");
            } else {
              toast("Sem novidades para notificar agora", "info");
            }
          } catch (e) {
            log.error("push: o resumo não pôde ser pedido", e);
            toast("Não foi possível enviar o resumo", "error");
          }
        }}
        title="Notificações ativas — clique para enviar o resumo agora"
      >
        <span className="hidden sm:inline">Ativas</span>
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      iconLeft={<BellIcon />}
      onClick={enable}
      disabled={state === "denied"}
      title={
        state === "denied"
          ? "Notificações bloqueadas no navegador"
          : "Ativar notificações neste dispositivo"
      }
    >
      <span className="hidden sm:inline">
        {state === "denied" ? "Bloqueadas" : "Ativar notificações"}
      </span>
    </Button>
  );
}
