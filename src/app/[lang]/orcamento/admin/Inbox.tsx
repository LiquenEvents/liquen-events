"use client";

/**
 * Inbox — a real email-client surface for the Líquen back office, built on the
 * SAFE inbox backend:
 *   • GET  /api/inbox?limit=&q=&before=   → messages enriched with their overlay
 *   • GET  /api/inbox/[uid]               → the full message body
 *   • POST /api/inbox/[uid]/flags         → reversible \Seen / \Flagged
 *   • POST /api/inbox/link                → overlay: link-to-pedido, label, pin, archive
 *   • POST /api/inbox/reply               → send a reply
 *
 * Master list + reading pane, calm ChatGPT-app styling on the Líquen palette.
 *
 * SAFETY: nothing here can permanently delete an e-mail. "Apagar" is not
 * offered; the destructive-looking action is "Arquivar", which maps to the
 * reversible overlay archive (a hide timestamp) — confirmed before it runs and
 * undoable right after. Flags (\Seen/\Flagged) are reversible IMAP standards.
 *
 * Client component: imports only client-safe TYPES; talks to the API routes.
 * Rendered prop-less by AdminClient — that interface stays stable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { InboxItemEnriched, InboxMessage, MessageLink } from "@/lib/inbox-types";
import type { Quote } from "@/lib/orcamento/types";
import { SITE } from "@/lib/site";
import { useToast } from "./Toast";
import { Button, Segmented } from "./ui";
import InboxList from "./InboxList";
import InboxThread, { type ThreadQuote } from "./InboxThread";
import { IconInbox, IconSearch, type InboxFilter } from "./InboxShared";

const PAGE_SIZE = 40;

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "porler", label: "Por ler" },
  { value: "estrela", label: "Com estrela" },
  { value: "ligados", label: "Ligados a pedido" },
  { value: "arquivo", label: "Arquivo" },
];

export default function Inbox() {
  const { toast } = useToast();
  const pathname = usePathname();
  const lang = pathname?.split("/").filter(Boolean)[0] || "pt";

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [items, setItems] = useState<InboxItemEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("todos");

  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [openMsg, setOpenMsg] = useState<InboxMessage | null>(null);
  const [openLink, setOpenLink] = useState<MessageLink | undefined>(undefined);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [creating, setCreating] = useState(false);

  // Star (\Flagged) state isn't returned by the list endpoint, so we track it
  // optimistically per session, seeded/updated as messages are flagged.
  const [flaggedUids, setFlaggedUids] = useState<Set<number>>(new Set());

  // Quotes power the "Associar a um pedido" picker and the "ligado a: <cliente>"
  // chip (resolving overlay quoteId → client name).
  const [quotes, setQuotes] = useState<Quote[]>([]);

  // Undo affordance after an archive.
  const [undo, setUndo] = useState<{ messageId: string; from: string } | null>(null);

  const quoteName = useCallback((id: string) => quotes.find((x) => x.id === id)?.name, [quotes]);

  const threadQuotes: ThreadQuote[] = useMemo(
    () => quotes.map((x) => ({ id: x.id, name: x.name, email: x.email })),
    [quotes],
  );

  // ── Data loading ──

  const load = useCallback(async (opts: { q?: string; before?: number } = {}) => {
    const isMore = opts.before != null;
    if (isMore) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (opts.q) params.set("q", opts.q);
      if (opts.before != null) params.set("before", String(opts.before));
      const res = await fetch(`/api/inbox?${params}`, { cache: "no-store" });
      const data = await res.json();
      setConfigured(data.configured);
      const batch: InboxItemEnriched[] = data.messages ?? [];
      if (isMore) {
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.uid));
          return [...prev, ...batch.filter((m) => !seen.has(m.uid))];
        });
      } else {
        setItems(batch);
      }
      setReachedEnd(batch.length < PAGE_SIZE);
      if (data.error) setError(data.error);
    } catch {
      setError("Não foi possível carregar o e-mail.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Debounce the search box, then re-query the server (?q=).
  useEffect(() => {
    const t = setTimeout(() => setCommittedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    load({ q: committedQ || undefined });
  }, [committedQ, load]);

  // Best-effort load of quotes for the picker/chip (never blocks the inbox).
  useEffect(() => {
    let alive = true;
    fetch("/api/orcamento", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (alive && Array.isArray(data)) setQuotes(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ── Local mutations ──

  const patchItem = useCallback((uid: number, partial: Partial<InboxItemEnriched>) => {
    setItems((prev) => prev.map((m) => (m.uid === uid ? { ...m, ...partial } : m)));
  }, []);

  const patchLinkByMessageId = useCallback(
    (messageId: string, link: MessageLink) => {
      setItems((prev) => prev.map((m) => (m.messageId === messageId ? { ...m, link } : m)));
      if (openMsg?.messageId === messageId) setOpenLink(link);
    },
    [openMsg],
  );

  // ── Actions ──

  const openMessage = useCallback(
    async (uid: number) => {
      setSelectedUid(uid);
      setLoadingMsg(true);
      setOpenMsg(null);
      const item = items.find((m) => m.uid === uid);
      setOpenLink(item?.link);
      try {
        const res = await fetch(`/api/inbox/${uid}`, { cache: "no-store" });
        if (res.ok) {
          const msg: InboxMessage = await res.json();
          setOpenMsg(msg);
          // Opening marks \Seen on the server — mirror that locally.
          patchItem(uid, { seen: true });
        } else {
          toast("Não foi possível abrir a mensagem.", "error");
        }
      } catch {
        toast("Não foi possível abrir a mensagem.", "error");
      } finally {
        setLoadingMsg(false);
      }
    },
    [items, patchItem, toast],
  );

  const setSeen = useCallback(
    async (uid: number, seen: boolean) => {
      patchItem(uid, { seen }); // optimistic
      try {
        const res = await fetch(`/api/inbox/${uid}/flags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seen }),
        });
        if (!res.ok) throw new Error();
      } catch {
        patchItem(uid, { seen: !seen });
        toast("Não foi possível atualizar o estado de leitura.", "error");
      }
    },
    [patchItem, toast],
  );

  const toggleStar = useCallback(
    async (item: InboxItemEnriched) => {
      const next = !flaggedUids.has(item.uid);
      setFlaggedUids((prev) => {
        const s = new Set(prev);
        if (next) s.add(item.uid);
        else s.delete(item.uid);
        return s;
      });
      try {
        const res = await fetch(`/api/inbox/${item.uid}/flags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flagged: next }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setFlaggedUids((prev) => {
          const s = new Set(prev);
          if (next) s.delete(item.uid);
          else s.add(item.uid);
          return s;
        });
        toast("Não foi possível atualizar a estrela.", "error");
      }
    },
    [flaggedUids, toast],
  );

  // One overlay mutation → POST /api/inbox/link, then patch local state.
  const overlay = useCallback(
    async (
      messageId: string,
      body: Record<string, unknown>,
      errMsg: string,
    ): Promise<MessageLink | null> => {
      try {
        const res = await fetch("/api/inbox/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, ...body }),
        });
        const data = await res.json();
        if (!res.ok || !data.link) throw new Error();
        patchLinkByMessageId(messageId, data.link);
        return data.link as MessageLink;
      } catch {
        toast(errMsg, "error");
        return null;
      }
    },
    [patchLinkByMessageId, toast],
  );

  const linkQuote = useCallback(
    async (messageId: string, quoteId: string | null) => {
      const link = await overlay(messageId, { quoteId }, "Não foi possível ligar ao pedido.");
      if (link) toast(quoteId ? "E-mail ligado ao pedido." : "Ligação removida.", "success");
    },
    [overlay, toast],
  );

  const toggleLabel = useCallback(
    (messageId: string, label: string) => {
      void overlay(messageId, { toggleLabel: label }, "Não foi possível atualizar a etiqueta.");
    },
    [overlay],
  );

  const setPinned = useCallback(
    (messageId: string, pinned: boolean) => {
      void overlay(messageId, { pinned }, "Não foi possível fixar.");
    },
    [overlay],
  );

  const archive = useCallback(
    async (item: InboxItemEnriched) => {
      if (
        !window.confirm(
          `Arquivar o e-mail de ${item.from}? Fica escondido, mas pode desarquivar a qualquer momento.`,
        )
      )
        return;
      const link = await overlay(item.messageId, { archived: true }, "Não foi possível arquivar.");
      if (link) {
        setUndo({ messageId: item.messageId, from: item.from });
        toast("E-mail arquivado.", "success");
        // Move selection off the archived message unless we're viewing the archive.
        if (filter !== "arquivo" && selectedUid === item.uid) {
          setSelectedUid(null);
          setOpenMsg(null);
        }
      }
    },
    [overlay, toast, filter, selectedUid],
  );

  const unarchive = useCallback(
    async (messageId: string) => {
      const link = await overlay(messageId, { archived: false }, "Não foi possível desarquivar.");
      if (link) {
        toast("E-mail desarquivado.", "success");
        setUndo((u) => (u?.messageId === messageId ? null : u));
      }
    },
    [overlay, toast],
  );

  const createQuoteFromEmail = useCallback(async () => {
    if (!openMsg || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/orcamento/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: openMsg.from || openMsg.fromAddress || "Contacto por e-mail",
          email: openMsg.fromAddress,
          notes: `Criado a partir do e-mail: "${openMsg.subject}"`,
          referralSource: "E-mail",
          status: "em_revisao",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.quote) throw new Error();
      const quote: Quote = data.quote;
      setQuotes((prev) => [quote, ...prev]);
      // Link the e-mail to the freshly created pedido (best-effort).
      if (openMsg.messageId) {
        await overlay(openMsg.messageId, { quoteId: quote.id }, "");
      }
      toast("Pedido criado e ligado a este e-mail.", "success");
    } catch {
      toast("Não foi possível criar o pedido.", "error");
    } finally {
      setCreating(false);
    }
  }, [openMsg, creating, overlay, toast]);

  const sendReply = useCallback(
    async (text: string): Promise<boolean> => {
      if (!openMsg) return false;
      try {
        const res = await fetch("/api/inbox/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: openMsg.fromAddress,
            subject: openMsg.subject.startsWith("Re:") ? openMsg.subject : `Re: ${openMsg.subject}`,
            message: text,
          }),
        });
        if (!res.ok) throw new Error();
        toast("Resposta enviada.", "success");
        return true;
      } catch {
        toast("Não foi possível enviar a resposta.", "error");
        return false;
      }
    },
    [openMsg, toast],
  );

  // ── Derived: filtered + ordered list ──

  const shown = useMemo(() => {
    const base = items.filter((m) => {
      const archived = !!m.link?.archivedAt;
      if (filter === "arquivo") return archived;
      if (archived) return false;
      if (filter === "porler") return !m.seen;
      if (filter === "estrela") return flaggedUids.has(m.uid);
      if (filter === "ligados") return !!m.link?.quoteId;
      return true;
    });
    // Pinned first, then newest first.
    return [...base].sort((a, b) => {
      const pa = a.link?.pinned ? 1 : 0;
      const pb = b.link?.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return +new Date(b.date) - +new Date(a.date);
    });
  }, [items, filter, flaggedUids]);

  const counts = useMemo(() => {
    let unread = 0;
    let archived = 0;
    for (const m of items) {
      if (m.link?.archivedAt) archived++;
      else if (!m.seen) unread++;
    }
    return { unread, archived };
  }, [items]);

  // ── Keyboard niceties: j/k move, Enter opens, e archives ──

  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const list = shownRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((m) => m.uid === selectedUid);
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        e.preventDefault();
        const next =
          idx === -1 ? 0 : Math.min(Math.max(idx + (k === "j" ? 1 : -1), 0), list.length - 1);
        setSelectedUid(list[next].uid);
      } else if (e.key === "Enter" && selectedUid != null) {
        e.preventDefault();
        openMessage(selectedUid);
      } else if (k === "e" && selectedUid != null) {
        const item = list.find((m) => m.uid === selectedUid);
        if (item && item.messageId && !item.link?.archivedAt) {
          e.preventDefault();
          archive(item);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, openMessage, archive]);

  // ── Not-configured guidance ──

  if (configured === false) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-foreground/[0.08] bg-white p-8 text-center shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4d6350]/[0.08] text-[#4d6350]">
          <IconInbox className="h-6 w-6" />
        </div>
        <p className="mb-3 text-sm font-medium text-foreground/75">Caixa de e-mail por ligar</p>
        <div className="space-y-2 text-left text-xs leading-relaxed text-foreground/50">
          <p>
            Para ler aqui os e-mails de <span className="text-[#4d6350]">{SITE.email}</span>:
          </p>
          <p>
            1. No Gmail, ative o <span className="text-foreground/70">IMAP</span> em Definições →
            Encaminhamento e POP/IMAP.
          </p>
          <p>
            2. Crie uma <span className="text-foreground/70">palavra-passe de app</span> (requer
            verificação em 2 passos) em myaccount.google.com → Segurança.
          </p>
          <p>
            3. Defina as variáveis de ambiente{" "}
            <code className="text-[#4d6350]">SMTP_HOST=smtp.gmail.com</code>,{" "}
            <code className="text-[#4d6350]">SMTP_USER</code> e{" "}
            <code className="text-[#4d6350]">SMTP_PASS</code>. A caixa liga-se automaticamente.
          </p>
        </div>
      </div>
    );
  }

  const selectedItem = selectedUid != null ? items.find((m) => m.uid === selectedUid) : undefined;

  // On phones the two panes collapse to a single view: the list, or — once a
  // message is opened — the thread full-screen with a "‹ Voltar". A message is
  // only ever opened by tapping a row, so a live selection means "show thread".
  const threadOpenMobile = selectedUid != null;
  const closeThread = () => {
    setSelectedUid(null);
    setOpenMsg(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Undo banner after archiving */}
      {undo && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.06] px-4 py-2.5">
          <p className="text-sm text-foreground/70">
            E-mail de <span className="font-medium">{undo.from}</span> arquivado.
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="subtle" size="sm" onClick={() => unarchive(undo.messageId)}>
              Anular
            </Button>
            <button
              type="button"
              onClick={() => setUndo(null)}
              aria-label="Dispensar"
              className="rounded-md px-1.5 text-foreground/40 hover:text-foreground/70"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        {/* ── Master list — hidden on phones while a thread is open ── */}
        <div className={`min-w-0 ${threadOpenMobile ? "hidden lg:block" : ""}`}>
          {/* Search + refresh */}
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <IconSearch className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Procurar remetente, assunto ou conteúdo…"
                className="bo-input py-2.5 pl-9 pr-3 text-sm text-foreground/80"
                aria-label="Procurar no e-mail"
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              loading={loading && items.length > 0}
              onClick={() => load({ q: committedQ || undefined })}
            >
              Atualizar
            </Button>
          </div>

          {/* Filters */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="overflow-x-auto">
              <Segmented
                ariaLabel="Filtrar mensagens"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={FILTERS}
              />
            </div>
            <p className="hidden shrink-0 text-[11px] text-foreground/45 sm:block">
              {counts.unread > 0 && <span className="text-[#4d6350]">{counts.unread} por ler</span>}
            </p>
          </div>

          {error && (
            <p role="status" className="mb-3 text-xs text-[#8a2a22]">
              {error}
            </p>
          )}

          <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
            {!loading && shown.length === 0 ? (
              <EmptyList filter={filter} hasAny={items.length > 0} />
            ) : (
              <>
                <InboxList
                  items={shown}
                  selectedUid={selectedUid}
                  loading={loading}
                  flaggedUids={flaggedUids}
                  quoteName={quoteName}
                  onOpen={openMessage}
                  onToggleStar={toggleStar}
                />
                {!reachedEnd && items.length > 0 && filter !== "arquivo" && (
                  <div className="border-t border-foreground/[0.06] p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={loadingMore}
                      onClick={() => {
                        const minUid = Math.min(...items.map((m) => m.uid));
                        load({ q: committedQ || undefined, before: minUid });
                      }}
                    >
                      Carregar mais
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Reading pane — full-screen on phones, hidden until a thread opens ── */}
        <div
          className={`lg:sticky lg:top-6 lg:self-start ${
            threadOpenMobile ? "" : "hidden lg:block"
          }`}
        >
          {/* Phone-only back affordance to return to the list */}
          <button
            type="button"
            onClick={closeThread}
            className="mb-3 inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-sm font-medium text-[#4d6350] transition-colors hover:bg-[#4d6350]/[0.08] lg:hidden"
          >
            <span aria-hidden className="text-base leading-none">
              ‹
            </span>
            Voltar
          </button>
          <InboxThread
            message={openMsg}
            link={openLink}
            seen={selectedItem?.seen ?? true}
            flagged={selectedUid != null && flaggedUids.has(selectedUid)}
            loadingMsg={loadingMsg}
            lang={lang}
            quotes={threadQuotes}
            quoteName={quoteName}
            canOverlay={!!openMsg?.messageId}
            creating={creating}
            onToggleSeen={() => {
              if (selectedUid != null) setSeen(selectedUid, !(selectedItem?.seen ?? true));
            }}
            onToggleStar={() => {
              if (selectedItem) toggleStar(selectedItem);
            }}
            onArchive={() => {
              if (selectedItem) archive(selectedItem);
            }}
            onUnarchive={() => {
              if (openMsg?.messageId) unarchive(openMsg.messageId);
            }}
            onSetPinned={(pinned) => {
              if (openMsg?.messageId) setPinned(openMsg.messageId, pinned);
            }}
            onToggleLabel={(label) => {
              if (openMsg?.messageId) toggleLabel(openMsg.messageId, label);
            }}
            onLinkQuote={(quoteId) => {
              if (openMsg?.messageId) linkQuote(openMsg.messageId, quoteId);
            }}
            onCreateQuote={createQuoteFromEmail}
            onReply={sendReply}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyList({ filter, hasAny }: { filter: InboxFilter; hasAny: boolean }) {
  const copy: Record<InboxFilter, { title: string; desc: string }> = {
    todos: {
      title: hasAny ? "Nada corresponde" : "Caixa de entrada vazia",
      desc: hasAny
        ? "Ajuste a pesquisa para ver mais mensagens."
        : "Quando chegar e-mail novo, aparece aqui.",
    },
    porler: { title: "Tudo lido", desc: "Não há mensagens por ler. Bom trabalho." },
    estrela: {
      title: "Sem estrelas",
      desc: "Marque um e-mail com estrela para o guardar aqui.",
    },
    ligados: {
      title: "Nenhum e-mail ligado",
      desc: "Associe um e-mail a um pedido para o ver nesta lista.",
    },
    arquivo: {
      title: "Arquivo vazio",
      desc: "Os e-mails que arquivar ficam guardados aqui — nunca são apagados.",
    },
  };
  const c = copy[filter];
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4d6350]/[0.08] text-[#4d6350]">
        <IconInbox className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground/75">{c.title}</p>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-foreground/45">{c.desc}</p>
    </div>
  );
}
