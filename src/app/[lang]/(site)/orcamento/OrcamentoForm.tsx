"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { waHref } from "@/data";
import { useTranslations } from "@/components/LocaleProvider";
import { localizeHref } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n";
import { PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";
import { track } from "@/lib/track";
import { LEAD_SOURCE_KEY } from "@/components/LeadSourceCapture";
import { lerClique, serializar } from "@/lib/ads/click-id";
import { QUOTE_EVENT_OPTIONS } from "@/lib/orcamento/data";
import { PONTOS_DECORACAO } from "@/lib/orcamento/decoracao";

/**
 * Pedido de orçamento — formulário simples e direto.
 *
 * Substitui o antigo wizard com calculadora de preços por um pedido limpo:
 * tipo de evento, data, nº de pessoas e mensagem (+ contacto, indispensável
 * para responder). Submete para o mesmo endpoint `/api/orcamento` (email +
 * dashboard + push) — sem alterações no backend. O tipo escolhido é mapeado
 * para a taxonomia existente para que o email e o back-office mostrem rótulos
 * corretos; "Outro" viaja apenas como `eventName`.
 */

// Local draft so a visitor who navigates away and returns doesn't lose what
// they typed. Stored in sessionStorage (tab-scoped) so this personal data is
// gone when the tab closes — no lingering contact details on a shared/public
// device; also cleared on a successful send.
const DRAFT_KEY = "liquen-orcamento-draft";

// A stable id for THIS enquiry, so a retried submit (lost response → resubmit,
// even across a reload) is deduplicated server-side into one lead + one email
// instead of two. It survives reloads (localStorage) and is regenerated only
// after a successful send.
// Read the first-touch acquisition source recorded by LeadSourceCapture on
// entry (empty for direct visits or when sessionStorage is unavailable).
function readLeadSource(): string {
  try {
    return sessionStorage.getItem(LEAD_SOURCE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Identificador do clique pago guardado à entrada, na forma compacta. */
function lerAdClick(): string {
  const c = lerClique();
  return c ? serializar(c) : "";
}

const SUBMISSION_KEY = "liquen-orcamento-sid";
function ensureSubmissionId(): string {
  try {
    let sid = localStorage.getItem(SUBMISSION_KEY);
    if (!sid) {
      sid =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(SUBMISSION_KEY, sid);
    }
    return sid;
  } catch {
    // No localStorage (private mode / blocked): fall back to a per-call id — no
    // cross-reload dedup, but the request still carries a valid submissionId.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// Single source of truth, shared with the confirmation page so both resolve the
// same option index (and therefore the same localized label).
const EVENT_TYPES = QUOTE_EVENT_OPTIONS;

// Floating-label field wrapper. The control is passed as children (keeping all
// its own attrs/refs/aria); the label overlays it and floats up on focus/value
// via CSS (.ff / .ff-label in globals.css). `floatAlways` forces the floated
// state for the native date input, whose :placeholder-shown is unreliable.
function FloatingField({
  htmlFor,
  label,
  required,
  floatAlways,
  error,
  errorId,
  className,
  children,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  floatAlways?: boolean;
  error?: string;
  errorId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`ff group${floatAlways ? " ff--float" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
      <label htmlFor={htmlFor} className="ff-label font-normal">
        {label}
        {required && (
          <span aria-hidden className="text-gold-text">
            &nbsp;*
          </span>
        )}
      </label>
      {error && errorId && (
        <p id={errorId} role="alert" className="mt-2 text-[11px] tracking-wide text-gold-text">
          {error}
        </p>
      )}
    </div>
  );
}

// `panelBlur` (the left-panel image's blur placeholder) is resolved on the
// SERVER page and passed in as a single string, so this client component never
// imports blurFor / blur-map.json — that ~107KB map used to bundle into this
// route just to place one decorative image's placeholder.
export default function OrcamentoForm({
  panelBlur,
  orcamento,
}: {
  panelBlur: string;
  orcamento: Dict["orcamento"];
}) {
  // locale + common come from the site-wide chrome context; the heavier
  // `orcamento` namespace is passed in from the /orcamento server page so it
  // doesn't ride the global LocaleProvider slice on every page.
  const { locale, t } = useTranslations();
  const to = orcamento;
  const router = useRouter();
  const [eventType, setEventType] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [data, setData] = useState("");
  const [dateFlexible, setDateFlexible] = useState(false);
  const [pessoas, setPessoas] = useState("");
  const [guestsFlexible, setGuestsFlexible] = useState(false);
  const [local, setLocal] = useState("");
  const [mensagem, setMensagem] = useState("");
  // Pontos de decoração — só existem no casamento, e são sempre OPCIONAIS.
  // Nunca entram na validação: quem não faz ideia do que quer segue em frente
  // sem marcar nada, que é exactamente o estado em que muita gente chega.
  const [decor, setDecor] = useState<string[]>([]);
  const alternarDecor = (id: string) =>
    setDecor((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  const [website, setWebsite] = useState(""); // honeypot — fica vazio
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every field is required, so every field needs its own "has the visitor
  // been here yet" flag — errors must appear after leaving a field, never while
  // it's still being typed into for the first time.
  type Field = "nome" | "email" | "telefone" | "data" | "pessoas" | "local" | "mensagem";
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const markTouched = (f: Field) => setTouched((prev) => (prev[f] ? prev : { ...prev, [f]: true }));
  // Set once the user tries to submit an incomplete form — drives the visible,
  // announced error identification (WCAG 3.3.1) instead of a silent disabled button.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Fire a single "QuoteStart" analytics event on the first interaction, so the
  // owner can measure form-start → submit (abandonment). No-ops without Plausible.
  const startedRef = useRef(false);
  const markStart = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("QuoteStart");
    }
  };
  // Refs for focus management on invalid submit + the event-type radiogroup.
  const nomeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dataRef = useRef<HTMLInputElement>(null);
  const pessoasRef = useRef<HTMLInputElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const telefoneRef = useRef<HTMLInputElement>(null);
  const mensagemRef = useRef<HTMLTextAreaElement>(null);
  // Data mínima = hoje (não faz sentido pedir orçamento para uma data passada).
  const [minDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Restaura o rascunho guardado (uma vez, após montar — evita mismatch de SSR).
  const firstSave = useRef(true);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const d = JSON.parse(saved) as Record<string, string>;
      // The draft lives in sessionStorage, so it is already gone when the tab
      // closes — the personal contact data can't linger on a shared/public
      // device. The 7-day stamp is kept as a secondary guard within a very
      // long-lived tab.
      const ts = Number(d._ts);
      if (ts && Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (d.eventType) setEventType(d.eventType);
      if (d.nome) setNome(d.nome);
      if (d.email) setEmail(d.email);
      if (d.telefone) setTelefone(d.telefone);
      if (d.data) setData(d.data);
      if (d.dateFlexible) setDateFlexible(d.dateFlexible === "1");
      if (d.guestsFlexible) setGuestsFlexible(d.guestsFlexible === "1");
      if (d.pessoas) setPessoas(d.pessoas);
      if (d.local) setLocal(d.local);
      if (d.mensagem) setMensagem(d.mensagem);
      if (d.decor) setDecor(d.decor.split(",").filter(Boolean));
    } catch {
      /* localStorage indisponível — segue sem rascunho */
    }
  }, []);

  // Deep-link pre-selection: a service page can link to /orcamento?tipo=casamentos
  // so the visitor arrives with the event type already chosen instead of
  // re-picking what they just came from. Declared AFTER the draft restore so an
  // explicit link wins over a stale draft; unknown values are ignored. Reads
  // window.location directly (no useSearchParams) to avoid a CSR bailout.
  useEffect(() => {
    try {
      const tipo = new URLSearchParams(window.location.search).get("tipo");
      if (!tipo) return;
      const opt = EVENT_TYPES.find((o) => o.eventType === tipo);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (opt) setEventType(opt.label);
    } catch {
      /* sem query string acessível — segue sem pré-seleção */
    }
  }, []);

  // Grava o rascunho a cada alteração. Salta a 1ª execução para não escrever o
  // estado vazio inicial por cima de um rascunho ainda por restaurar acima.
  // Debounced (~500ms): keystrokes on the 9 fields no longer each trigger a
  // synchronous JSON.stringify + localStorage write on the main thread — only
  // the last change in a burst persists, keeping typing snappy (INP).
  //
  // The latest draft is mirrored into a ref every render so it can be flushed
  // SYNCHRONOUSLY when the page is being hidden/unloaded — otherwise a fast
  // navigate-away (or tab close) mid-debounce would drop the pending write and
  // lose the draft the user expects to survive the round-trip.
  const draftRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    draftRef.current = {
      eventType,
      nome,
      email,
      telefone,
      data,
      dateFlexible: dateFlexible ? "1" : "",
      guestsFlexible: guestsFlexible ? "1" : "",
      pessoas,
      local,
      mensagem,
      // Guardado como lista separada por vírgulas porque o rascunho inteiro é
      // um `Record<string, string>` — e os identificadores do catálogo não
      // têm vírgulas.
      decor: decor.join(","),
    };
  }, [
    eventType,
    nome,
    email,
    telefone,
    data,
    dateFlexible,
    pessoas,
    guestsFlexible,
    local,
    mensagem,
    decor,
  ]);
  // Once the quote is submitted the draft is intentionally cleared; block any
  // later lifecycle flush (the router.push unmount below) from resurrecting it.
  const submittedRef = useRef(false);
  const flushDraft = useCallback(() => {
    if (firstSave.current || submittedRef.current) return; // nothing to persist
    const d = draftRef.current;
    if (!d) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, _ts: Date.now() }));
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const timer = setTimeout(flushDraft, 500);
    return () => clearTimeout(timer);
  }, [
    eventType,
    nome,
    email,
    telefone,
    data,
    dateFlexible,
    pessoas,
    guestsFlexible,
    local,
    mensagem,
    decor,
    flushDraft,
  ]);

  // Persist immediately when the page is hidden or torn down (navigation, tab
  // close, bfcache). `visibilitychange → hidden` and `pagehide` are the only
  // reliably-fired lifecycle events for this; the effect cleanup covers the
  // client-side route change that unmounts the form before either fires.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushDraft);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushDraft);
      flushDraft();
    };
  }, [flushDraft]);

  // One predicate per field, so the error text, the focus target and the
  // submit gate can never disagree about what "valid" means.
  const okTipo = eventType !== "";
  // Os pontos de decoração são a linguagem do casamento — a cerimónia, o
  // cocktail, o seating plan. Num aniversário ou num corporativo não querem
  // dizer nada, por isso a secção nem chega a existir.
  const ehCasamento = EVENT_TYPES.find((o) => o.label === eventType)?.eventType === "casamentos";
  const okNome = nome.trim().length >= 2;
  const okEmail = /\S+@\S+\.\S+/.test(email);
  // 9 digits is the Portuguese national number; an international one arrives
  // longer, so accept anything from 9 digits up.
  const okTelefone = telefone.replace(/\D/g, "").length >= 9;
  // "Ainda a definir" IS an answer — the field is satisfied either way.
  const okData = dateFlexible || data !== "";
  const okPessoas = guestsFlexible || Number(pessoas) > 0;
  const okLocal = local.trim().length >= 2;
  const okMensagem = mensagem.trim().length > 0;

  const show = (t: boolean | undefined) => Boolean(t) || attemptedSubmit;
  const nomeErr = show(touched.nome) && !okNome ? to.errNome : "";
  const emailErr = show(touched.email) && !okEmail ? to.errEmail : "";
  const telefoneErr = show(touched.telefone) && !okTelefone ? to.errTelefone : "";
  const dataErr = show(touched.data) && !okData ? to.errData : "";
  const pessoasErr = show(touched.pessoas) && !okPessoas ? to.errPessoas : "";
  const localErr = show(touched.local) && !okLocal ? to.errLocal : "";
  const mensagemErr = show(touched.mensagem) && !okMensagem ? to.errMensagem : "";
  const tipoErr = attemptedSubmit && !okTipo ? to.errTipo : "";
  const ready =
    okTipo && okNome && okEmail && okTelefone && okData && okPessoas && okLocal && okMensagem;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Don't gate the submit on the honeypot here: if anything ever populates the
    // hidden `website` field, a bare `return` would make the button appear dead
    // with no feedback and lose a real lead. The field still rides the payload so
    // the SERVER can silently discard bots — that's the sole enforcement point.
    if (sending) return;
    // Incomplete: reveal + announce what's missing (the submit stays operable so
    // keyboard/AT users get a reason, not a silently disabled control).
    if (!ready) {
      setTouched({
        nome: true,
        email: true,
        telefone: true,
        data: true,
        pessoas: true,
        local: true,
        mensagem: true,
      });
      setAttemptedSubmit(true);
      // Move focus to the first invalid control, in the order the fields are
      // laid out, so the reason is discoverable rather than somewhere off
      // screen (WCAG 3.3.1 error identification + 2.4.3 focus order).
      const first: [boolean, { focus: () => void } | null][] = [
        [okTipo, radioRefs.current[0]],
        [okData, dataRef.current],
        [okPessoas, pessoasRef.current],
        [okLocal, localRef.current],
        [okNome, nomeRef.current],
        [okEmail, emailRef.current],
        [okTelefone, telefoneRef.current],
        [okMensagem, mensagemRef.current],
      ];
      first.find(([ok]) => !ok)?.[1]?.focus();
      return;
    }
    setSending(true);
    setError(null);

    const opt = EVENT_TYPES.find((o) => o.label === eventType);
    const form = {
      name: nome.trim(),
      email: email.trim(),
      phone: telefone.trim(),
      category: opt?.category ?? null,
      eventType: opt?.eventType ?? null,
      eventName: eventType,
      date: dateFlexible ? "" : data,
      guests: guestsFlexible ? 0 : Number(pessoas) || 0,
      location: local.trim(),
      // Só viajam quando o pedido É um casamento. Sem esta guarda, marcar
      // pontos e depois mudar de ideias para "Aniversário" enviava uma
      // decoração de casamento agarrada a uma festa que não é uma — e a
      // proposta nascia semeada com o que ninguém pediu.
      decorPoints: opt?.eventType === "casamentos" ? decor : [],
      // Capture the "no fixed date yet" signal for the team (a high-value
      // early-stage lead segment) by folding it into the notes.
      notes: [
        dateFlexible ? `(${to.dateFlexibleLabel})` : "",
        guestsFlexible ? `(${to.labelPessoas}: ${to.guestsFlexibleLabel})` : "",
        mensagem.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
      // First-touch acquisition source (UTM/referrer), captured on entry by
      // LeadSourceCapture. Feeds the admin's conversion-by-source aggregation;
      // empty for direct visits.
      referralSource: readLeadSource(),
      // Identificador do clique pago, se esta pessoa veio de um anúncio. É o
      // que permite devolver à Google o valor real do casamento quando ele
      // fechar, em vez de ela optimizar para formulários preenchidos.
      adClick: lerAdClick(),
    };

    // Abort a hung request instead of spinning forever on a stalled connection
    // (3G that opens the socket but never responds). Without this the submit
    // button spins with no error and no recovery — the worst failure mode on
    // the site's primary conversion. maxDuration server-side is 30s.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O honeypot segue no payload para o servidor também poder descartar
        // bots que preencham o campo (a guarda no cliente é contornável).
        // submissionId torna o envio idempotente (reenvio após resposta perdida
        // = um só lead + um só email).
        body: JSON.stringify({ form, website, submissionId: ensureSubmissionId() }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.id) throw new Error(json?.error || "falha");

      track("QuoteSubmit", { tipo: opt?.eventType ?? eventType });

      // Hand-off para a página de confirmação (funciona em qualquer host).
      try {
        sessionStorage.setItem(
          `liquen-quote-${json.id}`,
          JSON.stringify({
            id: json.id,
            status: "pendente",
            submittedAt: new Date().toISOString(),
            ...form,
          }),
        );
      } catch {
        /* sessionStorage indisponível — a confirmação usa o fallback genérico */
      }
      // Pedido enviado: limpa o rascunho local para não reaparecer depois, e
      // trava o flush de ciclo de vida para o unmount da navegação não o repor.
      submittedRef.current = true;
      try {
        sessionStorage.removeItem(DRAFT_KEY);
        // Retire this enquiry's idempotency id so a genuinely NEW enquiry later
        // gets a fresh one (and doesn't dedup against the just-sent lead).
        localStorage.removeItem(SUBMISSION_KEY);
      } catch {
        /* ignora */
      }
      router.push(localizeHref(`/orcamento/confirmacao/${json.id}`, locale));
    } catch (e) {
      // Surface the server's specific message (e.g. the "try again / contact us"
      // text when delivery genuinely failed) instead of the generic fallback.
      // A timeout/network abort has no server message, so it falls back to the
      // generic retry copy rather than leaking a raw "AbortError" string.
      let msg = to.error;
      if (e instanceof Error && e.name !== "AbortError" && e.message && e.message !== "falha") {
        msg = e.message;
      }
      setError(msg);
      setSending(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  // WhatsApp fallback message, composed from whatever the visitor has already
  // typed, so switching channel mid-form doesn't discard their context (the
  // team receives the details instead of an empty "Olá"). Recomputed each
  // render, so the link always reflects the current field state.
  function waMessage(): string {
    const idx = EVENT_TYPES.findIndex((o) => o.label === eventType);
    const tipoLabel = idx >= 0 ? (to.eventTypeLabels[idx] ?? eventType) : "";
    const lines = [t.common.whatsappPrefill];
    if (tipoLabel) lines.push(`${to.labelTipo}: ${tipoLabel}`);
    if (dateFlexible) lines.push(to.dateFlexibleLabel);
    else if (data) lines.push(`${to.labelData}: ${data}`);
    if (guestsFlexible) lines.push(`${to.labelPessoas}: ${to.guestsFlexibleLabel}`);
    else if (pessoas) lines.push(`${to.labelPessoas}: ${pessoas}`);
    if (local.trim()) lines.push(`${to.labelLocal}: ${local.trim()}`);
    if (nome.trim()) lines.push(`${to.labelNome}: ${nome.trim()}`);
    return lines.join("\n");
  }
  // Memoise the WhatsApp link so it isn't rebuilt + URL-encoded on every
  // keystroke (the link sits idle off to the side); only recompute when a field
  // that feeds it changes.
  const waLink = useMemo(
    () => waHref(waMessage()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventType, dateFlexible, data, pessoas, guestsFlexible, local, nome, to, t],
  );

  // Arrow-key navigation for the event-type radiogroup (WAI-ARIA radio pattern).
  const onRadioKey = (e: React.KeyboardEvent) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const cur = EVENT_TYPES.findIndex((o) => o.label === eventType);
    const from = cur === -1 ? 0 : cur;
    const next = (from + dir + EVENT_TYPES.length) % EVENT_TYPES.length;
    setEventType(EVENT_TYPES[next].label);
    radioRefs.current[next]?.focus();
  };

  // Floating-label input: `.ff-input` (globals.css) owns the vertical padding so
  // the label has room to float, and the placeholder colour is handled there
  // (hidden until focus). `field-line` draws the hairline moss underline in on
  // focus; border-b at /55 clears the 3:1 non-text-contrast floor (WCAG 1.4.11)
  // and focus switches it to solid moss.
  const ffInputCls =
    "ff-input field-line w-full bg-transparent border-b border-foreground/45 text-sm text-foreground focus:outline-none focus:border-moss";
  const labelCls =
    "block text-[10.5px] font-medium text-foreground/60 tracking-[0.16em] uppercase mb-3 transition-colors duration-300 group-focus-within:text-moss-dark";
  const hintCls = "mt-2 text-[11px] tracking-wide text-gold-text";

  // lg:pt-20 clears the tall at-rest navbar (≈164px logo lockup vs the global
  // main pt-24=96px), so the left image panel starts BELOW the header instead of
  // the logo sitting on top of the photo.
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] lg:pt-20">
      {/* ── Painel imagem (esquerda) ── */}
      <aside className="relative hidden lg:block overflow-hidden">
        <Image
          src="/imagens/DaniGui_JantarFesta_1.jpg"
          placeholder="blur"
          blurDataURL={panelBlur}
          alt={t.common.imageAlt.orcamentoPanel}
          fill
          sizes="(max-width: 1024px) 0vw, 45vw"
          quality={75}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/35 to-[#080808]/55" />
        <div className="absolute inset-0 flex flex-col justify-between p-12 xl:p-16">
          <Link
            href={localizeHref("/", locale)}
            className="text-cream/70 text-[11px] tracking-[0.3em] uppercase hover:text-cream transition-colors inline-flex items-center gap-2 w-fit"
          >
            ← {to.back}
          </Link>
          <div>
            <p className="text-cream/70 text-[10px] tracking-[0.5em] uppercase mb-7 flex items-center gap-3">
              <span className="w-6 h-px bg-gold/60 flex-shrink-0" />
              {to.eyebrow}
            </p>
            {/* Decorative panel heading — the page's real <h1> lives in the
                form column (present at every breakpoint). aria-hidden so AT
                doesn't read the title twice on desktop. */}
            <p
              aria-hidden
              className="text-cream font-bold uppercase tracking-display leading-[0.92] mb-8"
              style={{ fontSize: "clamp(40px, 4vw, 68px)" }}
            >
              {to.titleLine1}
              <br />
              <span className="text-moss-light">{to.titleMoss}</span>
            </p>
            <p className="text-cream/75 text-sm leading-[1.8] max-w-xs">{to.lead}</p>
            <p className="mt-5 text-cream/55 text-[10px] tracking-[0.28em] uppercase">
              {to.processHint}
            </p>
          </div>
        </div>
      </aside>

      {/* ── Formulário (direita) ── */}
      {/* Not a <main>: the root layout already provides the page's single <main>
          landmark, so this stays a plain <div> to avoid a nested/duplicate one. */}
      <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 xl:px-24 py-16 lg:py-20">
        <div className="w-full max-w-xl mx-auto">
          {/* Back link — mobile only; the desktop panel has its own. */}
          <Link
            href={localizeHref("/", locale)}
            className="lg:hidden text-foreground/68 text-[11px] tracking-[0.3em] uppercase hover:text-moss transition-colors inline-flex items-center gap-2 mb-8"
          >
            ← {to.back}
          </Link>
          {/* The page's single <h1>: visible + styled on mobile, sr-only on
              desktop (where the left panel shows the display title). Always in
              the a11y tree, so heading navigation works at every breakpoint. */}
          <h1
            className="lg:sr-only text-foreground font-bold uppercase tracking-display leading-[0.95] mb-6"
            style={{ fontSize: "clamp(34px, 9vw, 52px)" }}
          >
            {to.titleLine1} <span className="text-moss">{to.titleMoss}</span>
          </h1>

          <form
            onSubmit={submit}
            onFocusCapture={markStart}
            aria-busy={sending}
            noValidate
            className="orc-reveal flex flex-col gap-9"
          >
            {/* Required-fields key, before the fields so the '*' is explained
                first (WCAG 3.3.2 Labels or Instructions). */}
            <p className="text-foreground/68 text-[11px] leading-relaxed -mb-4">
              {to.requiredNote}
            </p>
            {/* Honeypot — a bot fills it, a human never sees it. The data-*ignore
                hints stop password managers (1Password / LastPass) from
                autofilling it, which was silently dropping real submissions. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            {/* Tipo de evento */}
            <fieldset className="group">
              {/* No per-field asterisk: with every field required it marked
                  nothing, and the note above the form says it once. */}
              <legend id="of-tipo-legend" className={labelCls}>
                {to.labelTipo}
              </legend>
              {/* A single-select toggle group is semantically a radiogroup —
                  aria-required/invalid on a <fieldset> aren't exposed by AT, so
                  the role + roving tabindex + arrow keys live here instead. */}
              <div
                role="radiogroup"
                aria-labelledby="of-tipo-legend"
                aria-required="true"
                aria-invalid={!!tipoErr}
                aria-describedby={tipoErr ? "of-tipo-err" : undefined}
                onKeyDown={onRadioKey}
                className="flex flex-wrap gap-3"
              >
                {EVENT_TYPES.map((o, i) => {
                  const active = eventType === o.label;
                  const focusable = eventType === "" ? i === 0 : active;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      ref={(el) => {
                        radioRefs.current[i] = el;
                      }}
                      role="radio"
                      aria-checked={active}
                      tabIndex={focusable ? 0 : -1}
                      onClick={() => setEventType(o.label)}
                      className={`px-4 py-2 pointer-coarse:min-h-11 rounded-full text-[10px] tracking-[0.12em] uppercase border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97] ${
                        active
                          ? "bg-moss border-moss text-white shadow-sm shadow-moss/20"
                          : "border-foreground/12 text-foreground/55 hover:border-moss/40 hover:text-foreground/85"
                      }`}
                    >
                      {to.eventTypeLabels[i] ?? o.label}
                    </button>
                  );
                })}
              </div>
              {tipoErr && (
                <p id="of-tipo-err" role="alert" className={hintCls}>
                  {tipoErr}
                </p>
              )}
            </fieldset>

            {/* Pontos de decoração — só no casamento.
                Sem preços de propósito: uma lista com valores ao lado
                transforma um pedido de casamento numa loja, e o preço destes
                pontos depende sempre do espaço, da paleta e do número de
                mesas. O que se pergunta aqui é ONDE querem decoração, não
                quanto estão dispostos a pagar. */}
            {ehCasamento && (
              <fieldset className="group">
                <legend id="of-decor-legend" className={labelCls}>
                  {to.labelDecor}
                </legend>
                <p className="mt-2 mb-4 text-[12px] leading-relaxed text-foreground/50">
                  {to.hintDecor}
                </p>
                <div
                  role="group"
                  aria-labelledby="of-decor-legend"
                  className="flex flex-wrap gap-3"
                >
                  {PONTOS_DECORACAO.map((p) => {
                    const active = decor.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          markStart();
                          alternarDecor(p.id);
                        }}
                        className={`px-4 py-2 pointer-coarse:min-h-11 rounded-full text-[10px] tracking-[0.12em] uppercase border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97] ${
                          active
                            ? "bg-moss border-moss text-white shadow-sm shadow-moss/20"
                            : "border-foreground/12 text-foreground/55 hover:border-moss/40 hover:text-foreground/85"
                        }`}
                      >
                        {locale.startsWith("en") ? p.en : p.pt}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Data + Nº de pessoas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <div>
                <FloatingField
                  htmlFor="of-data"
                  label={to.labelData}
                  floatAlways
                  error={dataErr}
                  errorId="of-data-err"
                >
                  <input
                    id="of-data"
                    ref={dataRef}
                    type="date"
                    min={minDate}
                    value={data}
                    disabled={dateFlexible}
                    onBlur={() => markTouched("data")}
                    aria-invalid={dataErr ? true : undefined}
                    aria-describedby={dataErr ? "of-data-err" : undefined}
                    onChange={(e) => setData(e.target.value)}
                    className={`${ffInputCls} [color-scheme:light] ${dateFlexible ? "opacity-40" : ""}`}
                  />
                </FloatingField>
                <label className="mt-2 inline-flex items-center gap-2.5 py-1.5 min-h-[24px] cursor-pointer text-foreground/68 hover:text-foreground/85 transition-colors">
                  <input
                    type="checkbox"
                    checked={dateFlexible}
                    onChange={(e) => {
                      setDateFlexible(e.target.checked);
                      markTouched("data");
                    }}
                    className="w-4 h-4 accent-moss cursor-pointer"
                  />
                  <span className="text-[11px] tracking-wide">{to.dateFlexibleLabel}</span>
                </label>
              </div>
              {/* Same escape hatch as the date: "how many" is often the last
                  thing a couple settles, and forcing a number would either lose
                  the lead or invite a made-up one — which is worse, because the
                  proposal would then be built on it. */}
              <div>
                <FloatingField
                  htmlFor="of-pessoas"
                  label={to.labelPessoas}
                  error={pessoasErr}
                  errorId="of-pessoas-err"
                >
                  <input
                    id="of-pessoas"
                    ref={pessoasRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pessoas}
                    disabled={guestsFlexible}
                    onBlur={() => markTouched("pessoas")}
                    aria-invalid={pessoasErr ? true : undefined}
                    aria-describedby={pessoasErr ? "of-pessoas-err" : undefined}
                    onChange={(e) => setPessoas(e.target.value.replace(/[^0-9]/g, ""))}
                    className={`${ffInputCls} ${guestsFlexible ? "opacity-40" : ""}`}
                    placeholder={to.phPessoas}
                  />
                </FloatingField>
                <label className="mt-2 inline-flex items-center gap-2.5 py-1.5 min-h-[24px] cursor-pointer text-foreground/68 hover:text-foreground/85 transition-colors">
                  <input
                    type="checkbox"
                    checked={guestsFlexible}
                    onChange={(e) => {
                      setGuestsFlexible(e.target.checked);
                      markTouched("pessoas");
                    }}
                    className="w-4 h-4 accent-moss cursor-pointer"
                  />
                  <span className="text-[11px] tracking-wide">{to.guestsFlexibleLabel}</span>
                </label>
              </div>
            </div>

            {/* Local / região */}
            <FloatingField
              htmlFor="of-local"
              label={to.labelLocal}
              error={localErr}
              errorId="of-local-err"
            >
              <input
                id="of-local"
                ref={localRef}
                type="text"
                autoComplete="address-level2"
                value={local}
                onBlur={() => markTouched("local")}
                aria-invalid={localErr ? true : undefined}
                aria-describedby={localErr ? "of-local-err" : undefined}
                onChange={(e) => setLocal(e.target.value)}
                className={ffInputCls}
                placeholder={to.phLocal}
              />
            </FloatingField>

            {/* Nome + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <FloatingField
                htmlFor="of-nome"
                label={to.labelNome}
                error={nomeErr}
                errorId="of-nome-err"
              >
                <input
                  id="of-nome"
                  ref={nomeRef}
                  type="text"
                  autoComplete="name"
                  aria-required="true"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => markTouched("nome")}
                  aria-invalid={!!nomeErr}
                  aria-describedby={nomeErr ? "of-nome-err" : undefined}
                  className={`${ffInputCls} ${
                    nomeErr ? "border-gold/60" : nome.trim().length >= 2 ? "border-moss/50" : ""
                  }`}
                  placeholder={to.phNome}
                />
              </FloatingField>
              <FloatingField
                htmlFor="of-email"
                label={to.labelEmail}
                error={emailErr}
                errorId="of-email-err"
              >
                <input
                  id="of-email"
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  aria-required="true"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  aria-invalid={!!emailErr}
                  aria-describedby={emailErr ? "of-email-err" : undefined}
                  className={`${ffInputCls} ${
                    emailErr ? "border-gold/60" : /\S+@\S+\.\S+/.test(email) ? "border-moss/50" : ""
                  }`}
                  placeholder={to.phEmail}
                />
              </FloatingField>
            </div>

            {/* Telefone */}
            <FloatingField
              htmlFor="of-telefone"
              label={to.labelTelefone}
              error={telefoneErr}
              errorId="of-telefone-err"
            >
              <input
                id="of-telefone"
                ref={telefoneRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefone}
                onBlur={() => markTouched("telefone")}
                aria-invalid={telefoneErr ? true : undefined}
                aria-describedby={telefoneErr ? "of-telefone-err" : undefined}
                onChange={(e) => setTelefone(e.target.value)}
                className={ffInputCls}
                placeholder={to.phTelefone}
              />
            </FloatingField>

            {/* Mensagem — the field the proposal is actually built from.
                A quote can be priced from the date and the headcount; it can
                only be DESIGNED from what the client pictures. It used to be
                labelled "Mensagem" with no reason to fill it, so most arrived
                empty and every proposal started from a blank page. It now asks
                a question, says plainly what the answer buys, and is tall
                enough to look like somewhere to write — and required, like
                every other field, so no proposal ever starts from nothing. */}
            <div>
              <FloatingField
                htmlFor="of-mensagem"
                label={to.labelMensagem}
                error={mensagemErr}
                errorId="of-mensagem-err"
              >
                <textarea
                  id="of-mensagem"
                  ref={mensagemRef}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  onBlur={() => markTouched("mensagem")}
                  rows={6}
                  aria-invalid={mensagemErr ? true : undefined}
                  aria-describedby={
                    mensagemErr ? "of-mensagem-err of-mensagem-hint" : "of-mensagem-hint"
                  }
                  className={`${ffInputCls} resize-y min-h-[132px]`}
                  placeholder={to.phMensagem}
                />
              </FloatingField>
              <p
                id="of-mensagem-hint"
                className="mt-2.5 text-[12px] leading-relaxed text-foreground/70"
              >
                {to.hintMensagem}
              </p>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4 pt-1">
              {/* aria-disabled (not `disabled`) so activating it while sending
                  doesn't yank focus off the button to <body> — the handler
                  already no-ops on re-entry. */}
              <button
                type="submit"
                aria-disabled={sending}
                className={`${PRIMARY_BUTTON_CLASS} ${sending ? "opacity-30 cursor-wait" : ""}`}
              >
                {sending ? (
                  <>
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border border-cream/30 border-t-cream animate-spin"
                      aria-hidden
                    />
                    {to.enviando}
                  </>
                ) : (
                  <>
                    {to.enviar} <span aria-hidden>→</span>
                  </>
                )}
              </button>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("WhatsAppClick", { source: "form" })}
                className="inline-flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-foreground/68 hover:text-moss transition-colors"
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                {to.ouWhatsApp}
                <span className="sr-only"> ({t.common.newWindow})</span>
              </a>
            </div>

            {/* Reassurance + privacy at the point of decision — the moment
                hesitation peaks. Reuses facts already shown up top. */}
            <p className="mt-6 text-[11px] leading-relaxed text-foreground/70 max-w-md">
              {to.submitReassure}
              <br />
              {to.privacyPre}
              <Link
                href={localizeHref("/privacidade", locale)}
                className="underline underline-offset-2 hover:text-foreground/80 transition-colors"
              >
                {to.privacyLinkLabel}
              </Link>
              {to.privacyPost}
            </p>

            {error && (
              // Failure state — deliberately NOT moss/green (that's the brand's
              // success colour). Uses the same gold as the field-level errors so
              // "something went wrong" reads as a problem, not a confirmation.
              <div
                role="alert"
                className="flex items-start gap-3 p-4 border-l-2 border-gold bg-gold/[0.06] rounded-sm"
              >
                <span aria-hidden className="text-gold-text text-base leading-none mt-px">
                  !
                </span>
                <p className="text-gold-text text-sm">{error}</p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
