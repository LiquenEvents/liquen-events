"use client";

import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Quote, QuoteStatus, ActivityEntry } from "@/lib/orcamento/types";
import type { RecentQuote } from "./CommandPalette";
import { formatPrice } from "@/lib/orcamento/pricing";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import CommandPalette, { type Command } from "./CommandPalette";
import ShortcutsModal from "./ShortcutsModal";
import AjudaGlossario from "./AjudaGlossario";
import NewQuoteModal from "./NewQuoteModal";
import NotificationBell from "./NotificationBell";
import {
  downloadCsv,
  quotesToCsvRows,
  dateStamp,
  printRunSheet,
  printEventDossier,
  downloadEventIcs,
} from "./export";
import { eventCountdown, randomId, eur } from "./util";
import { useFocusTrap } from "./useFocusTrap";
import EmptyState from "./EmptyState";
import LifecycleStepper from "./LifecycleStepper";
import { NAV, type View } from "./nav";
import { Button, Card, SectionCard } from "./ui";
import { MoreMenu } from "./MoreMenu";
import {
  Overview,
  Kanban,
  Clientes,
  Calendario,
  Propostas,
  Tarefas,
  Fornecedores,
  StatsDashboard,
  Inbox,
  ProposalBuilder,
  ProposalStudio,
  ProductionPlan,
  EmailTemplates,
  Faturas,
  Contratos,
  Inventario,
  Seguimentos,
  ClientMessenger,
  EventChecklist,
  EventTimeline,
  PaymentsPanel,
  EventCosts,
  GuestList,
  TagsField,
  FollowUpField,
  ActivityLog,
  EventTasks,
} from "./lazy";

// Quantos pedidos a lista renderiza de cada vez ("Mostrar mais" carrega o resto).
const LIST_PAGE_SIZE = 50;

// Code-split views + detail-panel tools live in ./lazy — only the view the
// user opens ships its JS, keeping the back-office's initial load lean.

const STATUS_OPTIONS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novo", color: "bg-foreground/10 text-foreground/50" },
  { id: "em_revisao", label: "Em revisão", color: "bg-moss/15 text-moss" },
  { id: "cotado", label: "Proposta enviada", color: "bg-moss/25 text-moss" },
  { id: "aceite", label: "Ganho", color: "bg-moss/35 text-moss" },
  { id: "rejeitado", label: "Perdido", color: "bg-foreground/8 text-foreground/30" },
];

// Short, human-readable form of the long internal id (e.g.
// "LIQ-MRR1L78R-438B649E86343C27" → "LIQ-MRR1L78R…C27"). The full id stays
// available via title/tooltip; this is only for display.
function shortRef(id: string): string {
  const parts = id.split("-");
  const last4 = id.slice(-4);
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}…${last4}`;
  return id.length > 10 ? `${id.slice(0, 8)}…${last4}` : id;
}

// Single-key destinations for the "g then <key>" navigation chord.
const VIEW_KEYS: Record<string, View> = {
  o: "overview",
  p: "pedidos",
  k: "kanban",
  c: "clientes",
  a: "calendario",
  r: "propostas",
  t: "tarefas",
  f: "fornecedores",
  e: "estatisticas",
  i: "inbox",
};
const VIEW_STORAGE_KEY = "liquen-admin-view";

interface Props {
  initialQuotes: Quote[];
  userName?: string;
}

export default function AdminClient({ initialQuotes, userName = "Catarina" }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "old" | "value" | "followup" | "eventdate">("recent");
  const [saving, setSaving] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<QuoteStatus>("pendente");
  const [editAssigned, setEditAssigned] = useState("");
  const [editLostReason, setEditLostReason] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editGuests, setEditGuests] = useState("");
  const [editLocation, setEditLocation] = useState("");
  // Which section of the (long) detail panel is showing.
  const [detailTab, setDetailTab] = useState<"resumo" | "producao" | "financeiro" | "comunicacao">(
    "resumo",
  );
  // Comunicação tab shows one proposal tool by default (ProposalStudio); the
  // simpler price-table tool (ProposalBuilder) stays collapsed behind a link.
  const [showBuilder, setShowBuilder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [ajudaOpen, setAjudaOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  // Below xl the detail panel is a modal slide-over (overlay + scrim); at xl+ it
  // is an inline sticky column. Only the overlay should behave as a dialog (focus
  // trap, aria-modal, scroll lock) — the inline panel must not trap focus.
  const [isDetailOverlay, setIsDetailOverlay] = useState(false);
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  // Focus trap for the mobile detail drawer — active only while it's the overlay.
  const drawerRef = useFocusTrap<HTMLDivElement>(!!selected && isDetailOverlay);
  // Focus management for the inline (desktop, non-overlay) detail workspace. The
  // mobile overlay already traps + restores focus via useFocusTrap; for the inline
  // panel we manually move focus to the panel heading on open and hand it back to
  // the element that opened it on close, so keyboard users are never stranded.
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  // Current locale, read from the path (/{lang}/orcamento/admin), to build the
  // deep link into a quote's full-screen Dossier route.
  const pathname = usePathname();
  const lang = pathname?.split("/").filter(Boolean)[0] || "pt";

  // Does the detail panel have edits (status/price/notes) not yet saved? Used to
  // warn before switching/closing a quote so work is never silently lost.
  const isDirty =
    !!selected &&
    (editStatus !== selected.status ||
      editNotes !== (selected.adminNotes ?? "") ||
      editPrice !== (selected.quotedPrice ? String(selected.quotedPrice) : "") ||
      editAssigned !== (selected.assignedTo ?? "") ||
      editLostReason !== (selected.lostReason ?? "") ||
      editDate !== (selected.date ?? "") ||
      editGuests !== String(selected.guests ?? "") ||
      editLocation !== (selected.location ?? ""));
  // Latest value mirrored into a ref for listeners bound earlier (e.g. Escape).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Full-screen tool surface: hide public nav, grain & chrome.
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  // Restore the last view the user was on (per device). Done in an effect so it
  // never causes an SSR/hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
      if (saved && NAV.some((n) => n.id === saved)) setView(saved);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("liquen-recent-quotes");
      if (raw) setRecentQuotes(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Restore the Pedidos status filter + sort the team last used (per device).
  useEffect(() => {
    try {
      const f = localStorage.getItem("liquen-admin-filter");
      if (f === "all" || STATUS_OPTIONS.some((s) => s.id === f))
        setFilterStatus(f as QuoteStatus | "all");
      const so = localStorage.getItem("liquen-admin-sort");
      if (
        so === "recent" ||
        so === "old" ||
        so === "value" ||
        so === "followup" ||
        so === "eventdate"
      )
        setSort(so);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("liquen-admin-filter", filterStatus);
      localStorage.setItem("liquen-admin-sort", sort);
    } catch {
      /* ignore */
    }
  }, [filterStatus, sort]);

  // Jump straight to Pedidos and focus the search box.
  const focusSearch = useCallback(() => {
    setView("pedidos");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  // Global keyboard shortcuts. ⌘K works anywhere; the rest are ignored while
  // typing so they never fight with form fields.
  useEffect(() => {
    let lastG = 0; // timestamp of the last "g" press, for the "g then key" chord
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();

      // "g" arms the chord; the next key within 900ms picks a destination.
      if (k === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 900 && VIEW_KEYS[k]) {
        e.preventDefault();
        setView(VIEW_KEYS[k]);
        lastG = 0;
        return;
      }
      lastG = 0;

      if (k === "n") {
        e.preventDefault();
        setNewQuoteOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === "Escape") {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusSearch]);

  // Escape dismisses the open drawer/nav — but only when no modal is capturing
  // it (the palette / new-quote / shortcuts dialogs handle their own Escape).
  useEffect(() => {
    if (paletteOpen || newQuoteOpen || shortcutsOpen || ajudaOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (navOpen) setNavOpen(false);
      else if (selected) {
        if (
          !dirtyRef.current ||
          window.confirm("Tem alterações por guardar neste pedido. Descartar?")
        ) {
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [paletteOpen, newQuoteOpen, shortcutsOpen, ajudaOpen, navOpen, selected]);

  // Lock background scroll while the mobile nav drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // Track whether the detail panel is currently a modal overlay (below xl) so the
  // dialog/focus-trap behaviour is gated to that state. matchMedia may be absent
  // (SSR / jsdom) — guard so this stays a no-op there, defaulting to inline.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsDetailOverlay(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Lock background scroll while the detail drawer is open as a mobile overlay
  // (mirrors the nav-drawer lock above). The inline xl panel never locks.
  useEffect(() => {
    if (!selected || !isDetailOverlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected, isDetailOverlay]);

  // Inline (desktop) detail: move focus into the workspace heading when a pedido
  // opens and restore it to the opener when it closes. Skipped while the panel is
  // the mobile overlay, where useFocusTrap owns focus instead.
  useEffect(() => {
    if (!selected || isDetailOverlay) return;
    const opener = detailOpenerRef.current;
    // Defer to after paint so the heading exists and layout has settled.
    const id = requestAnimationFrame(() => detailTitleRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      opener?.focus?.();
    };
  }, [selected, isDetailOverlay]);

  const paletteCommands: Command[] = useMemo(
    () => [
      {
        id: "action-new-quote",
        label: "Novo pedido (registo manual)",
        group: "Ações",
        run: () => setNewQuoteOpen(true),
      },
      {
        id: "action-export",
        label: "Exportar pedidos (CSV)",
        group: "Ações",
        run: () => {
          downloadCsv(`pedidos-${dateStamp()}`, quotesToCsvRows(quotes));
          toast(
            `${quotes.length} pedido${quotes.length !== 1 ? "s" : ""} exportado${quotes.length !== 1 ? "s" : ""}`,
            "success",
          );
        },
      },
      {
        id: "action-backup",
        label: "Descarregar backup",
        group: "Ações",
        run: () => {
          window.location.href = "/api/backup";
        },
      },
      ...NAV.map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        group: "Navegar",
        run: () => setView(item.id),
      })),
    ],
    [quotes, toast],
  );

  // Returns true to proceed; if there are unsaved edits, asks for confirmation.
  function discardGuard(): boolean {
    if (!isDirty) return true;
    return window.confirm("Tem alterações por guardar neste pedido. Descartar?");
  }
  function closeDetail() {
    if (discardGuard()) setSelected(null);
  }

  function openQuote(q: Quote) {
    if (!discardGuard()) return;
    // Remember who opened the detail so focus can return there on close.
    if (typeof document !== "undefined") {
      detailOpenerRef.current = document.activeElement as HTMLElement | null;
    }
    setView("pedidos");
    setSelected(q);
    // Track in recently-viewed list (localStorage)
    try {
      const entry: RecentQuote = { id: q.id, name: q.name, email: q.email, status: q.status };
      const prev: RecentQuote[] = JSON.parse(localStorage.getItem("liquen-recent-quotes") ?? "[]");
      const next = [entry, ...prev.filter((r) => r.id !== q.id)].slice(0, 6);
      localStorage.setItem("liquen-recent-quotes", JSON.stringify(next));
      setRecentQuotes(next);
    } catch {
      /* ignore */
    }
    setEditPrice(q.quotedPrice ? String(q.quotedPrice) : "");
    setEditNotes(q.adminNotes ?? "");
    setEditStatus(q.status);
    setEditAssigned(q.assignedTo ?? "");
    setEditLostReason(q.lostReason ?? "");
    setEditDate(q.date ?? "");
    setEditGuests(String(q.guests ?? ""));
    setEditLocation(q.location ?? "");
    setDetailTab("resumo");
  }

  // Clone an event's details into a fresh quote (e.g. a returning client).
  // The date is intentionally left blank — it's a new event to schedule.
  async function duplicateQuote(q: Quote) {
    if (!discardGuard()) return;
    try {
      const res = await fetch("/api/orcamento/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: q.name,
          email: q.email,
          phone: q.phone,
          company: q.company,
          category: q.category,
          eventType: q.eventType,
          eventName: q.eventName,
          location: q.location,
          guests: q.guests,
          notes: q.notes,
          referralSource: q.referralSource || "Cliente recorrente",
          status: "em_revisao",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.quote) throw new Error();
      setQuotes((prev) => [data.quote, ...prev]);
      setSelected(data.quote);
      setEditPrice("");
      setEditNotes("");
      setEditStatus(data.quote.status);
      setEditAssigned(data.quote.assignedTo ?? "");
      setEditLostReason("");
      setEditDate(data.quote.date ?? "");
      setEditGuests(String(data.quote.guests ?? ""));
      setEditLocation(data.quote.location ?? "");
      setDetailTab("resumo");
      toast("Pedido duplicado — defina a nova data", "success");
    } catch {
      toast("Não foi possível duplicar o pedido", "error");
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/orcamento", { headers: { "x-admin-refresh": "1" } });
      const data = await res.json();
      if (Array.isArray(data)) {
        setQuotes(data);
        toast(`Atualizado — ${data.length} pedido${data.length !== 1 ? "s" : ""}`, "success");
      }
    } catch {
      toast("Não foi possível atualizar. Verifique a ligação.", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/orcamento/admin";
  }

  async function appendActivity(quoteId: string, entries: ActivityEntry[]) {
    if (entries.length === 0) return;
    const q = quotes.find((x) => x.id === quoteId);
    if (!q) return;
    const activityLog = [...(q.activityLog ?? []), ...entries];
    try {
      const res = await fetch(`/api/orcamento/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityLog }),
      });
      if (res.ok) {
        const updated = await res.json();
        setQuotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } catch {
      /* best-effort */
    }
  }

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    try {
      const newEntries: ActivityEntry[] = [];
      const now = new Date().toISOString();

      if (editStatus !== selected.status) {
        const from = STATUS_OPTIONS.find((s) => s.id === selected.status)?.label ?? selected.status;
        const to = STATUS_OPTIONS.find((s) => s.id === editStatus)?.label ?? editStatus;
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "status_change",
          actor: userName,
          summary: `${from} → ${to}`,
        });
      }
      const newPrice = editPrice ? parseFloat(editPrice) : undefined;
      if (newPrice !== undefined && newPrice !== (selected.quotedPrice ?? 0)) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "price_set",
          actor: userName,
          summary: `Preço: ${eur(newPrice)}`,
        });
      }
      if (editNotes.trim() !== (selected.adminNotes ?? "").trim() && editNotes.trim()) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: "Notas internas atualizadas",
        });
      }
      if (editAssigned.trim() !== (selected.assignedTo ?? "").trim()) {
        const to = editAssigned.trim();
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "assigned",
          actor: userName,
          summary: to ? `Atribuído a ${to}` : "Responsável removido",
        });
      }

      const newDate = editDate || undefined;
      const newGuests = editGuests ? parseInt(editGuests, 10) : selected.guests;
      const newLocation = editLocation.trim() || selected.location;

      if (newDate !== (selected.date ?? undefined) && newDate) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Data do evento alterada para ${new Date(newDate + "T12:00:00").toLocaleDateString("pt-PT")}`,
        });
      }
      if (newGuests !== selected.guests) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Convidados: ${selected.guests} → ${newGuests}`,
        });
      }
      if ((editLocation.trim() || "") !== (selected.location ?? "") && editLocation.trim()) {
        newEntries.push({
          id: randomId(),
          at: now,
          kind: "note_added",
          actor: userName,
          summary: `Local: ${editLocation.trim()}`,
        });
      }

      const body: Record<string, unknown> = {
        status: editStatus,
        quotedPrice: editPrice ? parseFloat(editPrice) : undefined,
        adminNotes: editNotes,
        assignedTo: editAssigned.trim() || undefined,
        lostReason: editLostReason.trim() || undefined,
        date: newDate,
        guests: newGuests,
        location: newLocation,
      };
      if (newEntries.length > 0) {
        body.activityLog = [...(selected.activityLog ?? []), ...newEntries];
      }

      const res = await fetch(`/api/orcamento/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      const updated = await res.json();
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setSelected(updated);
      setEditAssigned(updated.assignedTo ?? "");
      setEditLostReason(updated.lostReason ?? "");
      setEditDate(updated.date ?? "");
      setEditGuests(String(updated.guests ?? ""));
      setEditLocation(updated.location ?? "");
      toast("Pedido atualizado", "success");
    } catch {
      toast("Não foi possível guardar as alterações", "error");
    } finally {
      setSaving(false);
    }
  }

  // Apply a status to every selected pedido in one go.
  async function applyBulkStatus(status: QuoteStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/orcamento/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      );
      const updated = new Map<string, Quote>(results.filter(Boolean).map((u: Quote) => [u.id, u]));
      if (updated.size > 0) {
        setQuotes((prev) => prev.map((q) => updated.get(q.id) ?? q));
        setSelected((prev) => (prev && updated.has(prev.id) ? updated.get(prev.id)! : prev));
      }
      const ok = updated.size;
      const failed = ids.length - ok;
      toast(
        failed === 0
          ? `${ok} pedido${ok !== 1 ? "s" : ""} atualizado${ok !== 1 ? "s" : ""}`
          : `${ok} atualizado(s), ${failed} falhou(ram)`,
        failed === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  // Permanently delete every selected pedido (hard delete, not archive). One
  // confirm covers the whole batch; each id is DELETEd, then the successful
  // ones are dropped from local state and the selection is cleared.
  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    if (
      !window.confirm(
        `Apagar ${ids.length} pedidos definitivamente? Esta ação não pode ser anulada.`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/orcamento/${id}`, { method: "DELETE" })
            .then((r) => (r.ok ? id : null))
            .catch(() => null),
        ),
      );
      const removed = new Set(results.filter((x): x is string => x !== null));
      if (removed.size > 0) {
        setQuotes((prev) => prev.filter((q) => !removed.has(q.id)));
        setSelected((prev) => (prev && removed.has(prev.id) ? null : prev));
      }
      const ok = removed.size;
      const failed = ids.length - ok;
      toast(
        failed === 0
          ? `${ok} pedido${ok !== 1 ? "s" : ""} apagado${ok !== 1 ? "s" : ""}`
          : `${ok} apagado(s), ${failed} falhou(ram)`,
        failed === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  const archivedCount = useMemo(() => quotes.filter((q) => q.archived).length, [quotes]);

  // Archived quotes are soft-deleted: keep them out of the analytical surfaces
  // (overview, pipeline, clientes, calendário, estatísticas) so a junk or
  // duplicate lead never pollutes the numbers. They stay reachable via the
  // "Arquivados" toggle on Pedidos and the command palette.
  const activeQuotes = useMemo(() => quotes.filter((q) => !q.archived), [quotes]);

  // Keep the search input instant while the expensive filter+sort over all leads
  // runs at lower priority: typing updates `search` immediately, but the O(n)
  // filter/O(n log n) sort + list re-render key off the deferred value, so a
  // keystroke never blocks on the whole-list recompute (janky at hundreds).
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let list = quotes.filter((x) => (showArchived ? x.archived : !x.archived));
    if (!showArchived && filterStatus !== "all") {
      list = list.filter((x) => x.status === filterStatus);
    }
    if (filterCategory !== "all") {
      list = list.filter((x) => x.category === filterCategory);
    }
    if (mineOnly) {
      list = list.filter((x) => x.assignedTo === userName);
    }
    if (tagFilter) {
      list = list.filter((x) => (x.tags ?? []).includes(tagFilter));
    }
    if (q) {
      list = list.filter((x) =>
        [
          x.name,
          x.email,
          x.phone,
          x.company,
          x.location,
          x.id,
          x.assignedTo,
          x.contractRef,
          ...(x.tags ?? []),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const sorted = [...list];
    if (sort === "recent")
      sorted.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
    else if (sort === "old")
      sorted.sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt));
    else if (sort === "followup")
      // Leads needing a follow-up float to the top, soonest/most-overdue first;
      // those without a follow-up date fall to the bottom (most recent among them).
      sorted.sort((a, b) => {
        const av = a.followUpAt ?? "9999-99-99";
        const bv = b.followUpAt ?? "9999-99-99";
        if (av !== bv) return av < bv ? -1 : 1;
        return +new Date(b.submittedAt) - +new Date(a.submittedAt);
      });
    else if (sort === "eventdate")
      // Upcoming events first (soonest at the top); undated quotes sink to the
      // bottom, most recent among them.
      sorted.sort((a, b) => {
        const av = a.date || "9999-99-99";
        const bv = b.date || "9999-99-99";
        if (av !== bv) return av < bv ? -1 : 1;
        return +new Date(b.submittedAt) - +new Date(a.submittedAt);
      });
    else
      sorted.sort(
        (a, b) =>
          (b.quotedPrice ?? b.priceBreakdown?.total ?? 0) -
          (a.quotedPrice ?? a.priceBreakdown?.total ?? 0),
      );
    return sorted;
  }, [
    quotes,
    filterStatus,
    filterCategory,
    tagFilter,
    deferredSearch,
    sort,
    showArchived,
    mineOnly,
    userName,
  ]);

  // Paginação incremental da lista: com centenas de pedidos, renderizar tudo
  // degrada a página. Só o RENDER é paginado — exportar CSV, "selecionar
  // todos" e contagens continuam a operar sobre a lista filtrada completa.
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
  }, [search, filterStatus, filterCategory, tagFilter, sort, showArchived, mineOnly]);
  const visibleQuotes = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const pendingCount = activeQuotes.filter(
    (q) => q.status === "pendente" || q.status === "em_revisao",
  ).length;

  // Every tag in use across all quotes — feeds the tag editor suggestions and
  // the Pedidos tag filter.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) for (const t of q.tags ?? []) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [quotes]);

  const todayKey = new Date().toISOString().slice(0, 10);

  function statusBadge(status: QuoteStatus) {
    const s = STATUS_OPTIONS.find((o) => o.id === status);
    return (
      <span
        className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${s?.color ?? "bg-foreground/8 text-foreground/30"}`}
      >
        {s?.label ?? status}
      </span>
    );
  }

  const VIEW_TITLES: Record<View, string> = {
    overview: "Visão Geral",
    pedidos: "Pedidos",
    kanban: "Pipeline",
    clientes: "Clientes",
    calendario: "Calendário",
    propostas: "Propostas",
    tarefas: "Tarefas",
    fornecedores: "Fornecedores",
    inventario: "Inventário",
    seguimentos: "Seguimentos",
    estatisticas: "Estatísticas",
    faturas: "Faturas",
    contratos: "Contratos",
    "modelos-email": "Modelos de email",
    inbox: "Inbox",
  };

  const VIEW_SUB: Record<View, string> = {
    overview: "O resumo do seu dia",
    pedidos: "Pedidos de orçamento recebidos",
    kanban: "Arraste os pedidos entre fases",
    clientes: "Histórico por cliente",
    calendario: "Os seus eventos no tempo",
    propostas: "Todas as propostas enviadas",
    tarefas: "Organização interna da equipa",
    fornecedores: "Parceiros e contactos",
    inventario: "Adereços e materiais de decoração",
    seguimentos: "Seguimentos automáticos a fazer",
    estatisticas: "Métricas e desempenho",
    faturas: "Livro de faturação e pagamentos",
    contratos: "Aceitações de condições e estado de cada contrato",
    "modelos-email": "Emails reutilizáveis da equipa",
    inbox: "Mensagens recebidas",
  };

  return (
    <>
      <div className="min-h-screen bg-surface flex">
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <AjudaGlossario open={ajudaOpen} onClose={() => setAjudaOpen(false)} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          navCommands={paletteCommands}
          quotes={quotes}
          onOpenQuote={openQuote}
          recentQuotes={recentQuotes}
        />
        <NewQuoteModal
          open={newQuoteOpen}
          onClose={() => setNewQuoteOpen(false)}
          existingQuotes={quotes}
          onCreated={(q) => {
            setQuotes((prev) => [q, ...prev]);
            openQuote(q);
          }}
        />
        {/* ── Sidebar ── */}
        <aside
          className={`fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-[#1b2119] flex flex-col transition-transform duration-300 shadow-2xl lg:shadow-none ${
            navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          {/* Mobile close */}
          <button
            className="lg:hidden absolute top-5 right-4 w-8 h-8 flex items-center justify-center text-white/35 hover:text-white/70 rounded-lg hover:bg-white/8 transition-colors"
            onClick={() => setNavOpen(false)}
            aria-label="Fechar menu"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>

          {/* Brand — official Líquen wordmark (white lockup for the dark sidebar) */}
          <div className="px-5 pt-8 pb-5 flex flex-col items-center text-center">
            <Image
              src="/logo-liquen-branco.png"
              alt="Líquen Events"
              width={300}
              height={179}
              preload
              className="h-24 w-auto object-contain"
            />
            <p className="text-white/25 text-[9px] tracking-[0.35em] uppercase mt-3">Back Office</p>
          </div>
          <div className="mx-4 h-px bg-white/[0.07] mb-1" />

          {/* Nav */}
          <nav className="flex-1 px-2.5 py-3 flex flex-col gap-0.5 overflow-y-auto">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setNavOpen(false);
                }}
                aria-current={view === item.id ? "page" : undefined}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[11px] tracking-[0.08em] uppercase font-medium transition-all duration-150 ${
                  view === item.id
                    ? "bg-white/12 text-white"
                    : "text-white/38 hover:text-white/80 hover:bg-white/[0.06]"
                }`}
              >
                <span
                  className={`shrink-0 transition-colors duration-150 ${
                    view === item.id ? "text-[#8aad85]" : "text-white/28 group-hover:text-white/60"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
                {item.id === "pedidos" && pendingCount > 0 && (
                  <span className="ml-auto min-w-[18px] text-center text-[9px] bg-[#4d6350] text-white/90 rounded-full px-1.5 py-0.5 tabular-nums leading-none">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* User */}
          <div className="px-2.5 pb-5 pt-3 border-t border-white/[0.07]">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.06] mb-2">
              <div className="w-8 h-8 rounded-full bg-[#4d6350] flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-white/10">
                {userName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white/80 text-xs font-medium truncate">{userName}</p>
                <p className="text-white/30 text-[10px] truncate">Administração</p>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-white/28 text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-white/60 hover:bg-white/6 transition-colors"
                title="Atalhos de teclado"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" strokeLinecap="round" />
                </svg>
                Atalhos
              </button>
              {/* Plain <a> on purpose: this hits an API route that streams a
                  file download, not a page — next/link would be wrong here. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/backup"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-white/28 text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-white/60 hover:bg-white/6 transition-colors"
                title="Exportar backup"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Backup
              </a>
              <button
                onClick={logout}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-white/28 text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-white/60 hover:bg-white/6 transition-colors"
                title="Terminar sessão"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Sair
              </button>
            </div>
          </div>
        </aside>

        {/* Backdrop (mobile nav drawer) */}
        {navOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden backdrop-blur-[2px]"
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* ── Mobile bottom navigation ──
            Hidden while a quote detail drawer is open: it's a focused, modal
            surface, so the tab bar would only overlap its footer and distract. */}
        <nav
          className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#1b2119] border-t border-white/[0.07] transition-transform duration-300 ${
            selected ? "translate-y-full" : "translate-y-0"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch">
            {(
              [
                { id: "overview", label: "Visão Geral" },
                { id: "pedidos", label: "Pedidos" },
                { id: "kanban", label: "Pipeline" },
                { id: "calendario", label: "Calendário" },
              ] as const
            ).map((item) => {
              const navItem = NAV.find((n) => n.id === item.id)!;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 transition-colors ${
                    isActive ? "text-[#8aad85]" : "text-white/32"
                  }`}
                >
                  {item.id === "pedidos" && pendingCount > 0 && (
                    <span className="absolute top-2.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-[#637a5f]" />
                  )}
                  <span
                    className={`transition-transform duration-150 ${isActive ? "scale-110" : ""}`}
                  >
                    {navItem.icon}
                  </span>
                  <span className="text-[8px] tracking-wide uppercase font-medium">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setNavOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 transition-colors ${
                !["overview", "pedidos", "kanban", "calendario"].includes(view)
                  ? "text-[#8aad85]"
                  : "text-white/32"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-[8px] tracking-wide uppercase font-medium">Mais</span>
            </button>
          </div>
        </nav>

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 flex flex-col pb-16 lg:pb-0">
          {/* Top bar */}
          <header className="sticky top-0 z-20 bg-white/92 backdrop-blur-xl border-b border-foreground/[0.07] px-4 sm:px-6 lg:px-10 py-4 flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-foreground/35 text-[9px] tracking-[0.35em] uppercase mb-1.5 font-medium">
                {VIEW_SUB[view]}
              </p>
              <h1
                className="text-foreground/88 font-bold leading-none"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.6vw, 30px)" }}
              >
                {VIEW_TITLES[view]}
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={() => setAjudaOpen(true)}
                aria-label="Ajuda e glossário"
                title="Ajuda e glossário"
                className="w-9 h-9 flex items-center justify-center text-foreground/30 rounded-lg hover:bg-foreground/[0.06] hover:text-foreground/55 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path
                    d="M9.4 9a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1.3.9-1.3 1.7v.3"
                    strokeLinecap="round"
                  />
                  <path d="M12 17h.01" strokeLinecap="round" />
                </svg>
              </button>
              <NotificationBell />
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] border border-foreground/[0.08] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-foreground/[0.07] hover:text-foreground/60 transition-colors"
                title="Pesquisar (Ctrl K)"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                <span className="hidden md:inline">Pesquisar</span>
                <kbd className="text-[8px] border border-foreground/12 rounded px-1 py-0.5 ml-0.5">
                  ⌘K
                </kbd>
              </button>
              <button
                onClick={refresh}
                disabled={refreshing}
                aria-label="Atualizar pedidos"
                className="group flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] border border-foreground/[0.08] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-foreground/[0.07] hover:text-[#4d6350] transition-colors"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className={
                    refreshing
                      ? "animate-spin"
                      : "group-hover:rotate-180 transition-transform duration-500"
                  }
                >
                  <path
                    d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="hidden sm:inline">{refreshing ? "A atualizar" : "Atualizar"}</span>
              </button>
              <button
                onClick={() => setNewQuoteOpen(true)}
                aria-label="Novo pedido"
                className="flex items-center gap-2 px-4 py-2 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-lg hover:bg-[#2a3227] transition-colors shadow-sm"
                title="Criar pedido manualmente"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline">Novo</span>
              </button>
            </div>
          </header>

          {/* ── Overview ── */}
          {view === "overview" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Overview
                quotes={activeQuotes}
                userName={userName}
                onOpen={openQuote}
                onGoStats={() => setView("estatisticas")}
                onGo={(v) => setView(v)}
                onNew={() => setNewQuoteOpen(true)}
              />
            </div>
          )}

          {/* ── Pipeline (Kanban) ── */}
          {view === "kanban" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Kanban
                quotes={activeQuotes}
                onOpen={openQuote}
                userName={userName}
                onStatusChange={(id, status) => {
                  setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
                  setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
                }}
              />
            </div>
          )}

          {/* ── Clientes ── */}
          {view === "clientes" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Clientes quotes={activeQuotes} onOpen={openQuote} />
            </div>
          )}

          {/* ── Calendário ── */}
          {view === "calendario" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Calendario quotes={activeQuotes} onOpen={openQuote} />
            </div>
          )}

          {/* ── Propostas ── */}
          {view === "propostas" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Propostas
                quotes={quotes}
                onOpenQuote={openQuote}
                onQuoteUpdated={(q) => {
                  setQuotes((prev) => prev.map((x) => (x.id === q.id ? q : x)));
                  setSelected((prev) => (prev?.id === q.id ? q : prev));
                }}
              />
            </div>
          )}

          {/* ── Tarefas ── */}
          {view === "tarefas" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Tarefas defaultAssignee={userName} />
            </div>
          )}

          {/* ── Fornecedores ── */}
          {view === "fornecedores" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Fornecedores />
            </div>
          )}

          {/* ── Estatísticas ── */}
          {view === "estatisticas" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <StatsDashboard quotes={activeQuotes} />
            </div>
          )}

          {/* ── Inventário ── */}
          {view === "inventario" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Inventario />
            </div>
          )}

          {/* ── Seguimentos automáticos ── */}
          {view === "seguimentos" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Seguimentos
                onOpenQuote={(id) => {
                  const q = quotes.find((x) => x.id === id);
                  if (q) openQuote(q);
                }}
              />
            </div>
          )}

          {/* ── Faturas ── */}
          {view === "faturas" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Faturas quotes={quotes} />
            </div>
          )}

          {/* ── Contratos ── */}
          {view === "contratos" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Contratos />
            </div>
          )}

          {/* ── Modelos de email ── */}
          {view === "modelos-email" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <EmailTemplates />
            </div>
          )}

          {/* ── Inbox ── */}
          {view === "inbox" && (
            <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-12 view-in">
              <Inbox />
            </div>
          )}

          {/* ── Pedidos ── */}
          <div
            className={`px-4 sm:px-6 lg:px-12 py-6 lg:py-12 ${view === "pedidos" ? "view-in" : "hidden"}`}
          >
            {/* Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/28"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Procurar pedidos por nome, email, local ou ID"
                  placeholder="Procurar por nome, email, local, ID…  ( / )"
                  className="w-full bg-white border border-foreground/[0.09] rounded-xl pl-10 pr-3 py-2.5 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-foreground/25 shadow-sm transition-colors"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setMineOnly((v) => !v)}
                  title={`Mostrar apenas pedidos atribuídos a ${userName}`}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs border shadow-sm transition-all ${
                    mineOnly
                      ? "bg-[#4d6350] border-[#4d6350] text-white"
                      : "bg-white border-foreground/[0.09] text-foreground/45 hover:text-foreground/65"
                  }`}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  Atribuídos a mim
                </button>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  aria-label="Filtrar por categoria"
                  className="bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                >
                  <option value="all">Todas as categorias</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  aria-label="Ordenar pedidos"
                  className="flex-1 lg:flex-none bg-white border border-foreground/[0.09] rounded-xl px-3 py-2.5 text-xs text-foreground/70 focus:outline-none focus:border-foreground/25 shadow-sm"
                >
                  <option value="recent">Mais recentes</option>
                  <option value="old">Mais antigos</option>
                  <option value="value">Maior valor</option>
                  <option value="followup">Seguimentos primeiro</option>
                  <option value="eventdate">Data do evento</option>
                </select>
                <button
                  onClick={() => {
                    downloadCsv(`pedidos-${dateStamp()}`, quotesToCsvRows(filtered));
                    toast(
                      `${filtered.length} pedido${filtered.length !== 1 ? "s" : ""} exportado${filtered.length !== 1 ? "s" : ""}`,
                      "success",
                    );
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm whitespace-nowrap"
                  title="Exportar a lista atual para CSV (Excel)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Exportar
                </button>
              </div>
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap gap-1.5 mb-8">
              {!showArchived && (
                <>
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filterStatus === "all" ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
                  >
                    Todos · {quotes.filter((q) => !q.archived).length}
                  </button>
                  {STATUS_OPTIONS.map((s) => {
                    const count = quotes.filter((q) => !q.archived && q.status === s.id).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setFilterStatus(s.id)}
                        className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${filterStatus === s.id ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
                      >
                        {s.label} · {count}
                      </button>
                    );
                  })}
                </>
              )}
              {archivedCount > 0 && (
                <button
                  onClick={() => {
                    setShowArchived((v) => !v);
                    setFilterStatus("all");
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${showArchived ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/30 hover:bg-foreground/[0.07]"}`}
                >
                  Arquivados · {archivedCount}
                </button>
              )}
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-8 -mt-4">
                <span className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase mr-1">
                  Etiquetas
                </span>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                    className={`px-3 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all duration-150 ${
                      tagFilter === t
                        ? "bg-[#4d6350] text-white shadow-sm"
                        : "bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/18"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {tagFilter && (
                  <button
                    onClick={() => setTagFilter(null)}
                    className="text-foreground/35 text-[10px] hover:text-foreground/60 transition-colors ml-1"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.06]">
                <span className="text-[#4d6350] text-xs font-semibold">
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
                </span>
                {selectedIds.size < filtered.length && (
                  <button
                    onClick={() => setSelectedIds(new Set(filtered.map((q) => q.id)))}
                    className="text-foreground/40 text-xs hover:text-[#4d6350] transition-colors"
                  >
                    Selecionar todos ({filtered.length})
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                    Marcar como
                  </span>
                  <select
                    disabled={bulkBusy}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value as QuoteStatus;
                      if (v) applyBulkStatus(v);
                    }}
                    aria-label="Marcar pedidos selecionados como"
                    className="bo-input px-2 py-1.5 text-xs text-foreground/70 disabled:opacity-50"
                  >
                    <option value="">{bulkBusy ? "A aplicar…" : "—"}</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() =>
                    downloadCsv(
                      `pedidos-selecao-${dateStamp()}`,
                      quotesToCsvRows(filtered.filter((q) => selectedIds.has(q.id))),
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-foreground/[0.12] text-foreground/45 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-[#4d6350] transition-colors shadow-sm"
                >
                  Exportar seleção
                </button>
                {(() => {
                  const emails = filtered
                    .filter((q) => selectedIds.has(q.id) && q.email)
                    .map((q) => q.email);
                  if (emails.length === 0) return null;
                  return (
                    <a
                      href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-foreground/[0.12] text-foreground/45 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-[#4d6350] transition-colors shadow-sm"
                      title={`Compor email para ${emails.length} cliente(s) (em bcc)`}
                    >
                      Email ({emails.length})
                    </a>
                  );
                })()}
                {/* Hard delete for the whole selection — restrained terracotta,
                    always behind a single confirm; disabled while a batch runs. */}
                <button
                  onClick={deleteSelected}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#b5654a]/25 text-[#b5654a]/80 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[#b5654a]/10 hover:text-[#b5654a] transition-colors shadow-sm disabled:opacity-50"
                >
                  Apagar ({selectedIds.size})
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-foreground/40 text-xs hover:text-foreground/70 transition-colors"
                >
                  Limpar
                </button>
              </div>
            )}

            {/* When a pedido is open, the list collapses to a slim rail and the
                detail takes over the remaining width as a spacious workspace.
                With nothing selected the list spreads full-width. */}
            <div
              className={`grid grid-cols-1 gap-8 ${
                selected ? "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]" : "xl:grid-cols-1"
              }`}
            >
              {/* List */}
              <div className="flex min-w-0 flex-col gap-3">
                {filtered.length === 0 && (
                  <div className="bo-card">
                    <EmptyState
                      icon={
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        >
                          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                          <rect x="9" y="3" width="6" height="4" rx="1" />
                          <path d="M9 12h6M9 16h4" strokeLinecap="round" />
                        </svg>
                      }
                      title={
                        search.trim() || filterStatus !== "all"
                          ? "Nenhum pedido corresponde"
                          : "Sem pedidos ainda"
                      }
                      hint={
                        search.trim() || filterStatus !== "all"
                          ? "Limpe a pesquisa ou o filtro para ver todos os pedidos."
                          : "Os pedidos de orçamento do site aparecem aqui. Pode também criar um manualmente."
                      }
                      action={
                        search.trim() || filterStatus !== "all"
                          ? undefined
                          : { label: "+ Novo pedido", onClick: () => setNewQuoteOpen(true) }
                      }
                    />
                  </div>
                )}
                {visibleQuotes.map((q) => {
                  const cat = CATEGORIES.find((c) => c.id === q.category);
                  const et =
                    q.category && q.eventType
                      ? EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType)
                      : null;
                  const isSel = selectedIds.has(q.id);
                  // Lead parado: status ativo sem atividade há 14+ dias
                  const lastActivity = q.lastUpdated ?? q.submittedAt;
                  const daysSince = Math.floor(
                    (Date.now() - new Date(lastActivity).getTime()) / 86400000,
                  );
                  const isStale =
                    (q.status === "pendente" ||
                      q.status === "em_revisao" ||
                      q.status === "cotado") &&
                    daysSince >= 14;
                  return (
                    <div key={q.id} className="relative">
                      <label
                        className="absolute left-2 top-3.5 z-10 flex items-center justify-center min-w-[24px] min-h-[24px] cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(q.id)}
                          className="w-4 h-4 accent-[#4d6350] cursor-pointer"
                          aria-label={`Selecionar pedido de ${q.name}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openQuote(q)}
                        className={`w-full text-left p-5 pl-12 rounded-xl border transition-all duration-200 ${
                          selected?.id === q.id
                            ? "border-[#4d6350]/45 bg-[#4d6350]/[0.05] shadow-sm"
                            : isSel
                              ? "border-[#4d6350]/30 bg-[#4d6350]/[0.03]"
                              : "border-foreground/[0.08] hover:border-foreground/[0.18] bg-white shadow-sm hover:shadow-md"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <p className="text-foreground/75 text-sm font-semibold truncate">
                              {q.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-foreground/70 text-xs truncate">{q.email}</p>
                              {q.assignedTo && (
                                <span className="shrink-0 text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-[#4d6350]/10 text-[#4d6350] font-medium whitespace-nowrap">
                                  {q.assignedTo}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {statusBadge(q.status)}
                            {isStale && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] tracking-[0.1em] uppercase font-semibold bg-amber-500/10 text-amber-600"
                                title={`Sem atividade há ${daysSince} dias`}
                              >
                                <span className="w-1 h-1 rounded-full bg-current" />
                                {daysSince}d parado
                              </span>
                            )}
                            {q.followUpAt &&
                              q.followUpAt <= todayKey &&
                              q.status !== "aceite" &&
                              q.status !== "rejeitado" && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] tracking-[0.1em] uppercase font-semibold ${
                                    q.followUpAt < todayKey
                                      ? "bg-[#b5654a]/15 text-[#b5654a]"
                                      : "bg-[#637a5f]/15 text-[#4d6350]"
                                  }`}
                                  title={
                                    q.followUpAt < todayKey
                                      ? "Seguimento em atraso"
                                      : "Seguimento hoje"
                                  }
                                >
                                  <span className="w-1 h-1 rounded-full bg-current" />
                                  Seguir
                                </span>
                              )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-foreground/70 text-[10px]">
                          <span>{cat?.label ?? "—"}</span>
                          {et && (
                            <>
                              <span className="w-px h-2.5 bg-foreground/12" />
                              <span>{et.label}</span>
                            </>
                          )}
                          <span className="w-px h-2.5 bg-foreground/12" />
                          <span>{q.guests} convidados</span>
                          {(() => {
                            const cd = eventCountdown(q.date);
                            if (!cd || cd.tone === "past") return null;
                            return (
                              <>
                                <span className="w-px h-2.5 bg-foreground/12" />
                                <span
                                  className={
                                    cd.tone === "today" || cd.tone === "soon"
                                      ? "text-[#b5654a] font-medium"
                                      : "text-foreground/70"
                                  }
                                >
                                  {cd.label}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                        {q.tags && q.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {q.tags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 rounded-full bg-[#4d6350]/10 text-[#4d6350] text-[9px] font-medium tracking-wide"
                              >
                                {t}
                              </span>
                            ))}
                            {q.tags.length > 4 && (
                              <span className="text-foreground/30 text-[9px] px-1">
                                +{q.tags.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-foreground/[0.07]">
                          <span
                            className="text-foreground/40 text-[9px] font-mono tracking-tight"
                            title={q.id}
                          >
                            Ref. {shortRef(q.id)}
                          </span>
                          <div className="flex items-center gap-3">
                            {q.quotedPrice ? (
                              <span className="text-[#4d6350] text-xs font-semibold">
                                {formatPrice(q.quotedPrice)}
                              </span>
                            ) : q.priceBreakdown?.total ? (
                              <span className="text-foreground/70 text-xs">
                                ≈ {formatPrice(q.priceBreakdown.rangeMin)}–
                                {formatPrice(q.priceBreakdown.rangeMax)}
                              </span>
                            ) : null}
                            <span className="text-foreground/70 text-[10px]">
                              {new Date(q.submittedAt).toLocaleDateString("pt-PT", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + LIST_PAGE_SIZE)}
                    className="w-full py-3.5 text-[11px] tracking-[0.2em] uppercase text-foreground/45 hover:text-foreground/70 bg-white border border-foreground/[0.08] rounded-xl hover:border-foreground/20 transition-colors"
                  >
                    Mostrar mais ({filtered.length - visibleCount} restante
                    {filtered.length - visibleCount !== 1 ? "s" : ""})
                  </button>
                )}
              </div>

              {/* Detail — in-grid sticky panel on desktop, slide-over drawer on mobile */}
              {selected ? (
                <>
                  <div className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={closeDetail} />
                  <div
                    ref={drawerRef}
                    role={isDetailOverlay ? "dialog" : undefined}
                    aria-modal={isDetailOverlay ? true : undefined}
                    aria-labelledby={isDetailOverlay ? "detail-drawer-title" : undefined}
                    className="fixed xl:static inset-y-0 right-0 z-50 xl:z-auto w-full max-w-md sm:max-w-xl lg:max-w-3xl xl:max-w-none xl:w-auto bg-white border-l xl:border border-foreground/[0.08] xl:rounded-2xl xl:sticky xl:top-24 max-h-screen xl:max-h-[calc(100vh-7rem)] overflow-y-auto shadow-2xl xl:shadow-[0_1px_2px_rgba(42,38,32,0.04)]"
                  >
                    <div className="sticky top-0 z-10 border-b border-foreground/[0.08] bg-white/95 px-5 pt-5 backdrop-blur-sm sm:px-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2
                            id="detail-drawer-title"
                            ref={detailTitleRef}
                            tabIndex={-1}
                            className="truncate font-display text-xl leading-tight text-foreground/90 focus:outline-none sm:text-2xl"
                          >
                            {selected.name}
                          </h2>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                            {statusBadge(selected.status)}
                            <span
                              className="font-mono text-[10px] tracking-tight text-foreground/40"
                              title={selected.id}
                            >
                              Ref. {shortRef(selected.id)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {/* Reversible archive — kept visible as a primary action. */}
                          <Button
                            variant={selected.archived ? "subtle" : "secondary"}
                            size="sm"
                            onClick={async () => {
                              const next = !selected.archived;
                              const confirm_ =
                                !next ||
                                window.confirm(
                                  `Arquivar "${selected.name}"? Ficará oculto da lista principal.`,
                                );
                              if (!confirm_) return;
                              const res = await fetch(`/api/orcamento/${selected.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ archived: next }),
                              });
                              if (res.ok) {
                                const updated = await res.json();
                                setQuotes((prev) =>
                                  prev.map((q) => (q.id === updated.id ? updated : q)),
                                );
                                setSelected(updated);
                                toast(next ? "Pedido arquivado" : "Pedido restaurado", "success");
                              }
                            }}
                            title={selected.archived ? "Restaurar pedido" : "Arquivar pedido"}
                            iconLeft={
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M21 8v13H3V8M23 3H1v5h22V3zM10 12h4" />
                              </svg>
                            }
                          >
                            <span className="hidden sm:inline">
                              {selected.archived ? "Restaurar" : "Arquivar"}
                            </span>
                          </Button>
                          {/* Full-screen cockpit for this event — the one place that
                              unifies proposta/contrato/faturas/produção. Primary. */}
                          <Link
                            href={`/${lang}/orcamento/admin/evento/${selected.id}`}
                            className="inline-flex h-8 items-center gap-2 rounded-xl bg-[#4d6350]/10 px-3 text-xs font-medium tracking-[0.02em] text-[#4d6350] motion-safe:transition-colors hover:bg-[#4d6350]/[0.16]"
                            title="Abrir o Dossier do evento (vista completa: ciclo de vida, financeiro, produção)"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              aria-hidden="true"
                            >
                              <rect x="3" y="3" width="7" height="9" rx="1" />
                              <rect x="14" y="3" width="7" height="5" rx="1" />
                              <rect x="14" y="12" width="7" height="9" rx="1" />
                              <rect x="3" y="16" width="7" height="5" rx="1" />
                            </svg>
                            <span className="hidden sm:inline">Dossier</span>
                          </Link>
                          {/* Secondary / print actions tucked into an overflow menu
                              so the header stays calm. */}
                          <MoreMenu
                            items={[
                              {
                                label: "Duplicar pedido",
                                hint: "Clonar para um cliente recorrente",
                                onClick: () => duplicateQuote(selected),
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    aria-hidden="true"
                                  >
                                    <rect x="9" y="9" width="11" height="11" rx="2" />
                                    <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                                  </svg>
                                ),
                              },
                              {
                                label: "Guião do dia",
                                hint: "Imprimir a folha de operações",
                                onClick: () => printRunSheet(selected),
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <rect x="6" y="14" width="12" height="7" rx="1" />
                                  </svg>
                                ),
                              },
                              {
                                label: "Dossier PDF",
                                hint: "Imprimir o dossier completo do evento",
                                onClick: () => printEventDossier(selected),
                                icon: (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" strokeLinecap="round" />
                                  </svg>
                                ),
                              },
                              ...(selected.date
                                ? [
                                    {
                                      label: "Adicionar ao calendário",
                                      hint: "Descarregar .ics (Google/Apple/Outlook)",
                                      onClick: () => downloadEventIcs(selected),
                                      icon: (
                                        <svg
                                          width="16"
                                          height="16"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1.7"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                                          <path d="M12 13v5M9.5 15.5 12 18l2.5-2.5" />
                                        </svg>
                                      ),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                          {/* Destructive action — separated from the rest and behind
                              a confirm. */}
                          <span className="mx-0.5 h-6 w-px bg-foreground/10" aria-hidden="true" />
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  "Apagar definitivamente este pedido? Esta ação não pode ser anulada.",
                                )
                              )
                                return;
                              try {
                                const res = await fetch(`/api/orcamento/${selected.id}`, {
                                  method: "DELETE",
                                });
                                if (!res.ok) throw new Error("delete failed");
                                setQuotes((prev) => prev.filter((q) => q.id !== selected.id));
                                setSelected(null);
                                toast("Pedido apagado", "success");
                              } catch {
                                toast("Não foi possível apagar o pedido", "error");
                              }
                            }}
                            title="Apagar pedido definitivamente"
                            iconLeft={
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                              </svg>
                            }
                          >
                            <span className="hidden sm:inline">Apagar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={closeDetail}
                            aria-label="Fechar"
                            className="px-2"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </Button>
                        </div>
                      </div>
                      {/* Section tabs — keep the workspace navigable. Arrow keys
                          move between tabs (WAI-ARIA tablist pattern). */}
                      <div
                        role="tablist"
                        aria-label="Secções do pedido"
                        className="mt-5 flex gap-1 overflow-x-auto"
                      >
                        {(
                          [
                            ["resumo", "Resumo"],
                            ["producao", "Produção"],
                            ["financeiro", "Financeiro"],
                            ["comunicacao", "Comunicação"],
                          ] as const
                        ).map(([id, label], i, arr) => {
                          const active = detailTab === id;
                          return (
                            <button
                              key={id}
                              id={`detail-tab-${id}`}
                              role="tab"
                              aria-selected={active}
                              aria-controls={`detail-panel-${id}`}
                              tabIndex={active ? 0 : -1}
                              onClick={() => setDetailTab(id)}
                              onKeyDown={(e) => {
                                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                                e.preventDefault();
                                const dir = e.key === "ArrowRight" ? 1 : -1;
                                const next = arr[(i + dir + arr.length) % arr.length][0];
                                setDetailTab(next);
                                // Move focus to the newly-selected tab (roving tabindex).
                                const tabs =
                                  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                                    '[role="tab"]',
                                  );
                                tabs?.[(i + dir + arr.length) % arr.length]?.focus();
                              }}
                              className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-xs font-medium uppercase tracking-[0.06em] motion-safe:transition-colors focus:outline-none focus-visible:bg-[#4d6350]/[0.06] ${
                                active
                                  ? "border-[#4d6350] text-foreground/85"
                                  : "border-transparent text-foreground/40 hover:text-foreground/65"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="px-5 py-6 sm:px-7 sm:py-8">
                      {/* Ciclo de vida — prominente no topo do espaço de trabalho,
                          para se ver logo em que fase o pedido está. */}
                      <div className="mb-8">
                        <LifecycleStepper quote={selected} />
                      </div>
                      <div className="grid grid-cols-1 gap-8 2xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:items-start">
                        {/* Coluna principal — as ferramentas do separador ativo */}
                        <div className="flex min-w-0 flex-col gap-6">
                          {detailTab === "resumo" && (
                            <div
                              role="tabpanel"
                              id="detail-panel-resumo"
                              aria-labelledby="detail-tab-resumo"
                              tabIndex={0}
                              className="flex flex-col gap-6 focus:outline-none"
                            >
                              {/* Snapshot e contacto vivem agora na barra de contexto
                              persistente (à direita em ecrãs largos), visível em
                              todos os separadores. */}
                              {/* Event */}
                              <div>
                                <p className="bo-eyebrow mb-3">Evento</p>
                                {/* Read-only facts */}
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                  {[
                                    {
                                      l: "Tipo",
                                      v: CATEGORIES.find((c) => c.id === selected.category)?.label,
                                    },
                                    {
                                      l: "Sub-tipo",
                                      v:
                                        selected.category && selected.eventType
                                          ? EVENT_TYPES_BY_CATEGORY[selected.category]?.find(
                                              (e) => e.id === selected.eventType,
                                            )?.label
                                          : null,
                                    },
                                    {
                                      l: "Pacote",
                                      v: PACKAGES.find((p) => p.id === selected.packageTier)?.label,
                                    },
                                    {
                                      l: "Duração",
                                      v: selected.duration ? `${selected.duration}h` : "—",
                                    },
                                    { l: "Extras", v: `${selected.addons?.length ?? 0} serviços` },
                                  ].map(({ l, v }) => (
                                    <div key={l}>
                                      <p className="text-foreground/60 text-[9px] tracking-wide uppercase mb-0.5">
                                        {l}
                                      </p>
                                      <p className="text-foreground/72 text-xs">{v ?? "—"}</p>
                                    </div>
                                  ))}
                                </div>
                                {/* Editable logistics */}
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-foreground/[0.06]">
                                  <div>
                                    <label className="text-foreground/60 text-[9px] tracking-wide uppercase block mb-1">
                                      Data
                                    </label>
                                    <input
                                      type="date"
                                      value={editDate}
                                      onChange={(e) => setEditDate(e.target.value)}
                                      className="bo-input px-2 py-1.5 text-xs text-foreground/70 w-full"
                                    />
                                    {editDate &&
                                      (() => {
                                        const cd = eventCountdown(editDate);
                                        return cd ? (
                                          <p
                                            className={`text-[10px] mt-0.5 ${cd.tone === "soon" || cd.tone === "today" ? "text-[#b5654a]" : "text-foreground/30"}`}
                                          >
                                            {cd.label}
                                          </p>
                                        ) : null;
                                      })()}
                                  </div>
                                  <div>
                                    <label className="text-foreground/60 text-[9px] tracking-wide uppercase block mb-1">
                                      Convidados
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={editGuests}
                                      onChange={(e) => setEditGuests(e.target.value)}
                                      className="bo-input px-2 py-1.5 text-xs text-foreground/70 w-full"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="text-foreground/60 text-[9px] tracking-wide uppercase block mb-1">
                                      Local
                                    </label>
                                    <input
                                      value={editLocation}
                                      onChange={(e) => setEditLocation(e.target.value)}
                                      placeholder="Local do evento…"
                                      className="bo-input px-2 py-1.5 text-xs text-foreground/70 w-full"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Client notes */}
                              {selected.notes && (
                                <div>
                                  <p className="bo-eyebrow mb-2">Notas do Cliente</p>
                                  <p className="text-foreground/72 text-xs leading-relaxed bg-foreground/4 p-3 rounded-sm">
                                    {selected.notes}
                                  </p>
                                </div>
                              )}

                              {/* Estimate */}
                              {selected.priceBreakdown && (
                                <div>
                                  <p className="bo-eyebrow mb-3">Estimativa Calculada</p>
                                  <div className="bg-foreground/4 rounded-sm p-3 flex flex-col gap-1.5">
                                    {selected.priceBreakdown.addonsCost > 0 && (
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-foreground/60">Extras</span>
                                        <span className="text-foreground/72">
                                          {formatPrice(selected.priceBreakdown.addonsCost)}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex justify-between text-[10px] pt-1 border-t border-foreground/8">
                                      <span className="text-foreground/60">Subtotal</span>
                                      <span className="text-foreground/72">
                                        {formatPrice(selected.priceBreakdown.subtotal)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-foreground/60">IVA 23%</span>
                                      <span className="text-foreground/72">
                                        {formatPrice(selected.priceBreakdown.iva)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-xs font-medium pt-1 border-t border-foreground/8">
                                      <span className="text-foreground/60">Total</span>
                                      <span className="text-[#4d6350] font-semibold">
                                        {formatPrice(selected.priceBreakdown.total)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Admin actions */}
                              <div className="border-t border-foreground/10 pt-5">
                                <p className="bo-eyebrow mb-4">Gestão do Pedido</p>
                                <div className="flex flex-col gap-4">
                                  <TagsField
                                    key={`tags-${selected.id}`}
                                    quote={selected}
                                    suggestions={allTags}
                                    onChange={(tags) => {
                                      setQuotes((prev) =>
                                        prev.map((q) =>
                                          q.id === selected.id ? { ...q, tags } : q,
                                        ),
                                      );
                                      setSelected((prev) => (prev ? { ...prev, tags } : prev));
                                    }}
                                  />
                                  <FollowUpField
                                    key={`fu-${selected.id}`}
                                    quote={selected}
                                    onChange={(followUpAt) => {
                                      setQuotes((prev) =>
                                        prev.map((q) =>
                                          q.id === selected.id ? { ...q, followUpAt } : q,
                                        ),
                                      );
                                      setSelected((prev) =>
                                        prev ? { ...prev, followUpAt } : prev,
                                      );
                                    }}
                                  />
                                  <div>
                                    <label className="block text-[10px] text-foreground/70 tracking-[0.3em] uppercase mb-2">
                                      Responsável
                                    </label>
                                    <input
                                      type="text"
                                      value={editAssigned}
                                      onChange={(e) => setEditAssigned(e.target.value)}
                                      placeholder="Nome do membro da equipa…"
                                      className="bo-input px-3 py-2 text-sm text-foreground/70"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-foreground/70 tracking-[0.3em] uppercase mb-2">
                                      Estado
                                    </label>
                                    <select
                                      value={editStatus}
                                      onChange={(e) => setEditStatus(e.target.value as QuoteStatus)}
                                      className="bo-input px-3 py-2 text-sm text-foreground/70"
                                    >
                                      {STATUS_OPTIONS.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  {editStatus === "rejeitado" && (
                                    <div>
                                      <label className="block text-[10px] text-foreground/70 tracking-[0.3em] uppercase mb-2">
                                        Motivo de perda
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={editLostReason}
                                        onChange={(e) => setEditLostReason(e.target.value)}
                                        placeholder="Ex.: Orçamento acima do esperado, escolheram outro fornecedor…"
                                        className="bo-input px-3 py-2 text-sm text-foreground/70 resize-none"
                                      />
                                    </div>
                                  )}
                                  {selected.status === "rejeitado" &&
                                    selected.lostReason &&
                                    editStatus !== "rejeitado" && (
                                      <div className="px-3 py-2 rounded-lg bg-foreground/[0.04] border border-foreground/[0.07]">
                                        <p className="text-[9px] tracking-[0.2em] uppercase text-foreground/60 mb-1">
                                          Motivo de perda anterior
                                        </p>
                                        <p className="text-xs text-foreground/72">
                                          {selected.lostReason}
                                        </p>
                                      </div>
                                    )}
                                  <div>
                                    <label className="block text-[10px] text-foreground/70 tracking-[0.3em] uppercase mb-2">
                                      Preço final (sem IVA) €
                                    </label>
                                    <input
                                      type="number"
                                      value={editPrice}
                                      onChange={(e) => setEditPrice(e.target.value)}
                                      placeholder="Ex: 12500"
                                      className="bo-input px-3 py-2 text-sm text-foreground/70"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-foreground/70 tracking-[0.3em] uppercase mb-2">
                                      Notas Internas
                                    </label>
                                    <textarea
                                      rows={3}
                                      value={editNotes}
                                      onChange={(e) => setEditNotes(e.target.value)}
                                      placeholder="Notas internas sobre este pedido…"
                                      className="bo-input px-3 py-2 text-sm text-foreground/70 resize-none"
                                    />
                                  </div>
                                  {isDirty && !saving && (
                                    <p
                                      role="status"
                                      className="flex items-center gap-1.5 text-[10px] tracking-wide text-gold-text -mb-1"
                                    >
                                      <span className="w-1 h-1 rounded-full bg-gold/80" />
                                      Alterações por guardar
                                    </p>
                                  )}
                                  <button
                                    onClick={saveChanges}
                                    disabled={saving || !isDirty}
                                    className={`w-full py-3 rounded-xl text-[11px] tracking-[0.18em] uppercase transition-all ${saving || !isDirty ? "bg-[#1b2119]/30 text-white/50 cursor-not-allowed" : "bg-[#1b2119] text-white/90 hover:bg-[#2a3227]"}`}
                                  >
                                    {saving ? "A guardar…" : "Guardar Alterações →"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {detailTab === "producao" && (
                            <div
                              role="tabpanel"
                              id="detail-panel-producao"
                              aria-labelledby="detail-tab-producao"
                              tabIndex={0}
                              className="flex flex-col gap-6 focus:outline-none"
                            >
                              {/* Tasks linked to this event */}
                              <EventTasks
                                key={`tasks-${selected.id}`}
                                quote={selected}
                                userName={userName}
                              />

                              {/* Production checklist */}
                              <EventChecklist
                                key={`cl-${selected.id}`}
                                quote={selected}
                                onChange={(checklist) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, checklist } : q,
                                    ),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, checklist } : prev));
                                }}
                              />

                              {/* Decor production plan (sourcing → strike) */}
                              <ProductionPlan
                                key={`prod-${selected.id}`}
                                quote={selected}
                                onChange={(productionPlan) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, productionPlan } : q,
                                    ),
                                  );
                                  setSelected((prev) =>
                                    prev ? { ...prev, productionPlan } : prev,
                                  );
                                }}
                              />

                              {/* Day-of run sheet */}
                              <EventTimeline
                                key={`tl-${selected.id}`}
                                quote={selected}
                                onChange={(timeline) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, timeline } : q,
                                    ),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, timeline } : prev));
                                }}
                              />

                              {/* Guest list / RSVP */}
                              <GuestList
                                key={`guests-${selected.id}`}
                                quote={selected}
                                onChange={(guestList) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, guestList } : q,
                                    ),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, guestList } : prev));
                                }}
                              />
                            </div>
                          )}

                          {detailTab === "financeiro" && (
                            <div
                              role="tabpanel"
                              id="detail-panel-financeiro"
                              aria-labelledby="detail-tab-financeiro"
                              tabIndex={0}
                              className="flex flex-col gap-6 focus:outline-none"
                            >
                              {/* Payments & invoicing */}
                              <PaymentsPanel
                                key={`pay-${selected.id}`}
                                quote={selected}
                                showLedger
                                onChange={(payments) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, payments } : q,
                                    ),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, payments } : prev));
                                }}
                              />

                              {/* Suppliers booked for this event + budget vs actual cost */}
                              <EventCosts
                                key={`costs-${selected.id}`}
                                quote={selected}
                                onChange={(eventSuppliers) => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, eventSuppliers } : q,
                                    ),
                                  );
                                  setSelected((prev) =>
                                    prev ? { ...prev, eventSuppliers } : prev,
                                  );
                                }}
                              />
                            </div>
                          )}

                          {detailTab === "comunicacao" && (
                            <div
                              role="tabpanel"
                              id="detail-panel-comunicacao"
                              aria-labelledby="detail-tab-comunicacao"
                              tabIndex={0}
                              className="flex flex-col gap-6 focus:outline-none"
                            >
                              <p className="text-foreground/50 text-[11px] leading-relaxed">
                                Crie e envie a proposta ao cliente. Comece por aqui.
                              </p>
                              <ProposalStudio
                                key={`studio-${selected.id}`}
                                quote={selected}
                                onSent={() => {
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, status: "cotado" } : q,
                                    ),
                                  );
                                  setSelected((prev) =>
                                    prev ? { ...prev, status: "cotado" } : prev,
                                  );
                                  setEditStatus("cotado");
                                  appendActivity(selected.id, [
                                    {
                                      id: randomId(),
                                      at: new Date().toISOString(),
                                      kind: "proposal_sent",
                                      actor: userName,
                                      summary: "Proposta enviada ao cliente (Studio)",
                                    },
                                  ]);
                                }}
                              />
                              {!showBuilder ? (
                                <button
                                  type="button"
                                  onClick={() => setShowBuilder(true)}
                                  className="self-start text-[#4d6350] text-[11px] tracking-[0.08em] hover:opacity-75 transition-opacity underline underline-offset-2"
                                >
                                  Outra forma de propor (tabela de preços simples)
                                </button>
                              ) : (
                                <ProposalBuilder
                                  quote={selected}
                                  onSent={(total) => {
                                    setQuotes((prev) =>
                                      prev.map((q) =>
                                        q.id === selected.id
                                          ? { ...q, status: "cotado", quotedPrice: total }
                                          : q,
                                      ),
                                    );
                                    setSelected((prev) =>
                                      prev
                                        ? { ...prev, status: "cotado", quotedPrice: total }
                                        : prev,
                                    );
                                    setEditStatus("cotado");
                                    appendActivity(selected.id, [
                                      {
                                        id: randomId(),
                                        at: new Date().toISOString(),
                                        kind: "proposal_sent",
                                        actor: userName,
                                        summary: `Proposta enviada — ${eur(total)}`,
                                      },
                                    ]);
                                  }}
                                />
                              )}

                              <ClientMessenger
                                key={selected.id}
                                quote={selected}
                                onSent={(messages) => {
                                  const prev_count = selected.messages?.length ?? 0;
                                  setQuotes((prev) =>
                                    prev.map((q) =>
                                      q.id === selected.id ? { ...q, messages } : q,
                                    ),
                                  );
                                  setSelected((prev) => (prev ? { ...prev, messages } : prev));
                                  if (messages.length > prev_count) {
                                    appendActivity(selected.id, [
                                      {
                                        id: randomId(),
                                        at: new Date().toISOString(),
                                        kind: "message_sent",
                                        actor: userName,
                                        summary: "Mensagem enviada ao cliente",
                                      },
                                    ]);
                                  }
                                }}
                              />

                              <ActivityLog
                                quote={selected}
                                actor={userName}
                                onAddEntry={(entry) => appendActivity(selected.id, [entry])}
                              />
                            </div>
                          )}
                        </div>

                        {/* Barra de contexto — persistente em todos os separadores:
                            quem é o cliente, quanto vale, como o contactar. Fixa em
                            ecrãs muito largos; empilha por baixo abaixo de 2xl. */}
                        <aside
                          aria-label="Contexto do pedido"
                          className="flex min-w-0 flex-col gap-5 2xl:sticky 2xl:top-6"
                        >
                          {/* Snapshot — factos-chave num relance */}
                          <Card padding="sm">
                            <p className="bo-eyebrow mb-3">Resumo</p>
                            {(() => {
                              const revenue =
                                selected.quotedPrice ?? selected.priceBreakdown?.total ?? 0;
                              const costs = (selected.eventSuppliers ?? []).reduce(
                                (s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0),
                                0,
                              );
                              const margin = revenue - costs;
                              const cd = eventCountdown(selected.date);
                              const cells: { l: string; v: string; tone?: string }[] = [
                                { l: "Valor", v: revenue ? formatPrice(revenue) : "—" },
                              ];
                              if (costs > 0)
                                cells.push({
                                  l: "Margem",
                                  v: formatPrice(margin),
                                  tone: margin >= 0 ? "text-[#4d6350]" : "text-[#b5654a]",
                                });
                              if (cd)
                                cells.push({
                                  l: "Evento",
                                  v: cd.label,
                                  tone:
                                    cd.tone === "soon" || cd.tone === "today"
                                      ? "text-[#b5654a]"
                                      : undefined,
                                });
                              return (
                                <div className="grid grid-cols-1 gap-2">
                                  {cells.map((c) => (
                                    <div
                                      key={c.l}
                                      className="flex items-center justify-between rounded-lg bg-foreground/[0.04] px-3 py-2.5"
                                    >
                                      <span className="text-[9px] uppercase tracking-[0.2em] text-foreground/50">
                                        {c.l}
                                      </span>
                                      <span
                                        className={`text-sm font-semibold ${c.tone ?? "text-foreground/80"}`}
                                      >
                                        {c.v}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </Card>

                          {/* Contacto */}
                          <SectionCard eyebrow="Contacto" padding="sm">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <a
                                  href={`mailto:${selected.email}`}
                                  className="text-[#4d6350] text-xs hover:underline truncate"
                                >
                                  {selected.email}
                                </a>
                                <button
                                  onClick={() => {
                                    navigator.clipboard?.writeText(selected.email);
                                    toast("Email copiado", "success");
                                  }}
                                  className="text-foreground/25 hover:text-foreground/55 transition-colors shrink-0"
                                  title="Copiar email"
                                  aria-label="Copiar email"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                  >
                                    <rect x="9" y="9" width="11" height="11" rx="2" />
                                    <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                                  </svg>
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={`tel:${selected.phone}`}
                                  className="text-foreground/70 text-xs hover:text-foreground/90"
                                >
                                  {selected.phone}
                                </a>
                                {selected.phone && (
                                  <a
                                    href={`https://wa.me/${selected.phone.replace(/[^\d]/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[#4d6350] text-[10px] tracking-[0.08em] uppercase hover:opacity-80 transition-opacity shrink-0"
                                    title="Abrir conversa no WhatsApp"
                                  >
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-.96.24-3.23-.67-2.73-1.08-4.46-3.86-4.6-4.04-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.95-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.15.27.67 1.1 1.44 1.78.99.88 1.82 1.16 2.08 1.29.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.58.75 1.85.88.27.13.45.2.52.31.07.11.07.64-.17 1.32Z" />
                                    </svg>
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                              {selected.company && (
                                <p className="text-foreground/70 text-xs">{selected.company}</p>
                              )}
                              {selected.nif && (
                                <p className="text-foreground/70 text-xs">NIF: {selected.nif}</p>
                              )}
                            </div>
                          </SectionCard>

                          <p className="px-1 text-[10px] text-foreground/50">
                            Submetido em{" "}
                            {new Date(selected.submittedAt).toLocaleString("pt-PT", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </aside>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
