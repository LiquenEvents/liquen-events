"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { waHref } from "@/data";
import { blurFor } from "@/lib/blur";
import RatingBadge from "@/components/RatingBadge";
import { useTranslations } from "@/components/LocaleProvider";
import { localizeHref } from "@/lib/i18n";
import { PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";

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

type Cat = "empresas" | "particulares" | null;

// Local draft so a visitor who navigates away and returns doesn't lose what
// they typed. Stored on the visitor's own device; cleared on a successful send.
const DRAFT_KEY = "liquen-orcamento-draft";

interface EventOption {
  label: string;
  category: Cat;
  eventType: string | null;
}

const EVENT_TYPES: EventOption[] = [
  { label: "Casamento", category: "particulares", eventType: "casamentos" },
  { label: "Corporativo", category: "empresas", eventType: "conferencias" },
  { label: "Aniversário", category: "particulares", eventType: "aniversarios" },
  { label: "Batizado / Comunhão", category: "particulares", eventType: "batizados" },
  { label: "Jantar de Gala", category: "particulares", eventType: "jantares_gala" },
  { label: "Outro", category: null, eventType: null },
];

export default function OrcamentoForm() {
  const { locale, t } = useTranslations();
  const to = t.orcamento;
  const router = useRouter();
  const [eventType, setEventType] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [data, setData] = useState("");
  const [pessoas, setPessoas] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — fica vazio
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ nome?: boolean; email?: boolean }>({});
  // Set once the user tries to submit an incomplete form — drives the visible,
  // announced error identification (WCAG 3.3.1) instead of a silent disabled button.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Refs for focus management on invalid submit + the event-type radiogroup.
  const nomeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Data mínima = hoje (não faz sentido pedir orçamento para uma data passada).
  const [minDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Restaura o rascunho guardado (uma vez, após montar — evita mismatch de SSR).
  const firstSave = useRef(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const d = JSON.parse(saved) as Record<string, string>;
      if (d.eventType) setEventType(d.eventType);
      if (d.nome) setNome(d.nome);
      if (d.email) setEmail(d.email);
      if (d.telefone) setTelefone(d.telefone);
      if (d.data) setData(d.data);
      if (d.pessoas) setPessoas(d.pessoas);
      if (d.mensagem) setMensagem(d.mensagem);
    } catch {
      /* localStorage indisponível — segue sem rascunho */
    }
  }, []);

  // Grava o rascunho a cada alteração. Salta a 1ª execução para não escrever o
  // estado vazio inicial por cima de um rascunho ainda por restaurar acima.
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ eventType, nome, email, telefone, data, pessoas, mensagem }),
      );
    } catch {
      /* ignora */
    }
  }, [eventType, nome, email, telefone, data, pessoas, mensagem]);

  const nomeErr = touched.nome && nome.trim().length < 2 ? to.errNome : "";
  const emailErr = touched.email && !/\S+@\S+\.\S+/.test(email) ? to.errEmail : "";
  const tipoErr = attemptedSubmit && eventType === "" ? to.errTipo : "";
  const ready = nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && eventType !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || website) return;
    // Incomplete: reveal + announce what's missing (the submit stays operable so
    // keyboard/AT users get a reason, not a silently disabled control).
    if (!ready) {
      setTouched({ nome: true, email: true });
      setAttemptedSubmit(true);
      // Move focus to the first invalid control so the reason is discoverable
      // (WCAG 3.3.1 error identification + 2.4.3 focus order).
      if (eventType === "") radioRefs.current[0]?.focus();
      else if (nome.trim().length < 2) nomeRef.current?.focus();
      else emailRef.current?.focus();
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
      date: data,
      guests: Number(pessoas) || 0,
      notes: mensagem.trim(),
    };

    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O honeypot segue no payload para o servidor também poder descartar
        // bots que preencham o campo (a guarda no cliente é contornável).
        body: JSON.stringify({ form, website }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.id) throw new Error(json?.error || "falha");

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
      // Pedido enviado: limpa o rascunho local para não reaparecer depois.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignora */
      }
      router.push(localizeHref(`/orcamento/confirmacao/${json.id}`, locale));
    } catch (e) {
      // Surface the server's specific message (e.g. the "try again / contact us"
      // text when delivery genuinely failed) instead of the generic fallback.
      const msg = e instanceof Error ? e.message : "";
      setError(msg && msg !== "falha" ? msg : to.error);
      setSending(false);
    }
  }

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

  const inputCls =
    // border-b at /55 clears the 3:1 non-text-contrast floor so the field is
    // identifiable (WCAG 1.4.11); focus switches to solid moss.
    "w-full bg-transparent border-b border-foreground/55 pb-3.5 text-base text-foreground placeholder-foreground/65 focus:outline-none focus:border-moss transition-colors duration-300";
  const labelCls =
    "block text-[10px] text-foreground/68 tracking-[0.4em] uppercase mb-3.5 transition-colors duration-300 group-focus-within:text-moss-light";
  const hintCls = "mt-2 text-[11px] tracking-wide text-gold-text";

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr]">
      {/* ── Painel imagem (esquerda) ── */}
      <aside className="relative hidden lg:block overflow-hidden">
        <Image
          src="/imagens/DaniGui_JantarFesta_1.jpg"
          {...blurFor("/imagens/DaniGui_JantarFesta_1.jpg")}
          alt={t.common.imageAlt.orcamentoPanel}
          fill
          preload
          sizes="(max-width: 1024px) 0vw, 45vw"
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
              className="text-cream font-bold leading-[0.92] tracking-tight mb-8"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 4vw, 68px)" }}
            >
              {to.titleLine1}
              <br />
              <span className="text-moss-light">{to.titleMoss}</span>
            </p>
            <p className="text-cream/75 text-sm leading-[1.8] max-w-xs">{to.lead}</p>
            <p className="mt-5 text-cream/55 text-[10px] tracking-[0.28em] uppercase">
              {to.processHint}
            </p>
            <div className="mt-8">
              <RatingBadge
                label={t.common.reviewsLabel}
                ptFormat={locale === "pt"}
                starClassName="text-gold"
                textClassName="text-cream/75"
              />
            </div>
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
            className="lg:sr-only text-foreground font-bold leading-[0.95] tracking-tight mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 9vw, 52px)" }}
          >
            {to.titleLine1} <span className="text-moss">{to.titleMoss}</span>
          </h1>

          {/* Reassurance on mobile: the desktop image panel carries the
              "no commitment / 24h / reviews" cues, but it's hidden below lg —
              so mobile users (the majority) would otherwise reach a bare form.
              Restore the strongest trust + process signals right where hesitation
              peaks, without breaking the minimal look. */}
          <div className="lg:hidden mb-12 flex flex-col gap-4">
            <p className="text-foreground/70 text-sm leading-relaxed">{to.lead}</p>
            <p className="text-foreground/55 text-[10px] tracking-[0.28em] uppercase">
              {to.processHint}
            </p>
            <RatingBadge
              label={t.common.reviewsLabel}
              ptFormat={locale === "pt"}
              starClassName="text-gold"
              textClassName="text-foreground/70"
            />
          </div>

          <form onSubmit={submit} aria-busy={sending} className="flex flex-col gap-11">
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
              <legend id="of-tipo-legend" className={labelCls}>
                {to.labelTipo}
                <span aria-hidden className="text-gold-text">
                  &nbsp;*
                </span>
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
                      className={`px-4 py-3 rounded-full text-xs tracking-[0.12em] uppercase border transition-all duration-200 ${
                        active
                          ? "bg-moss border-moss text-white shadow-lg shadow-moss/20"
                          : "border-foreground/15 text-foreground/68 hover:border-foreground/35 hover:text-foreground/80"
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

            {/* Data + Nº de pessoas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <div className="group">
                <label htmlFor="of-data" className={labelCls}>
                  {to.labelData}
                </label>
                <input
                  id="of-data"
                  type="date"
                  min={minDate}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={`${inputCls} [color-scheme:light]`}
                />
              </div>
              <div className="group">
                <label htmlFor="of-pessoas" className={labelCls}>
                  {to.labelPessoas}
                </label>
                <input
                  id="of-pessoas"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100000}
                  value={pessoas}
                  onChange={(e) => setPessoas(e.target.value)}
                  className={inputCls}
                  placeholder={to.phPessoas}
                />
              </div>
            </div>

            {/* Nome + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <div className="group">
                <label htmlFor="of-nome" className={labelCls}>
                  {to.labelNome}
                  <span aria-hidden className="text-gold-text">
                    &nbsp;*
                  </span>
                </label>
                <input
                  id="of-nome"
                  ref={nomeRef}
                  type="text"
                  autoComplete="name"
                  aria-required="true"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, nome: true }))}
                  aria-invalid={!!nomeErr}
                  aria-describedby={nomeErr ? "of-nome-err" : undefined}
                  className={`${inputCls} ${nomeErr ? "border-gold/60" : ""}`}
                  placeholder={to.phNome}
                />
                {nomeErr && (
                  <p id="of-nome-err" role="alert" className={hintCls}>
                    {nomeErr}
                  </p>
                )}
              </div>
              <div className="group">
                <label htmlFor="of-email" className={labelCls}>
                  {to.labelEmail}
                  <span aria-hidden className="text-gold-text">
                    &nbsp;*
                  </span>
                </label>
                <input
                  id="of-email"
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  aria-required="true"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  aria-invalid={!!emailErr}
                  aria-describedby={emailErr ? "of-email-err" : undefined}
                  className={`${inputCls} ${emailErr ? "border-gold/60" : ""}`}
                  placeholder={to.phEmail}
                />
                {emailErr && (
                  <p id="of-email-err" role="alert" className={hintCls}>
                    {emailErr}
                  </p>
                )}
              </div>
            </div>

            {/* Telefone */}
            <div className="group">
              <label htmlFor="of-telefone" className={labelCls}>
                {to.labelTelefone}
              </label>
              <input
                id="of-telefone"
                type="tel"
                autoComplete="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className={inputCls}
                placeholder={to.phTelefone}
              />
            </div>

            {/* Mensagem */}
            <div className="group">
              <label htmlFor="of-mensagem" className={labelCls}>
                {to.labelMensagem}
              </label>
              <textarea
                id="of-mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                className={`${inputCls} resize-none`}
                placeholder={to.phMensagem}
              />
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
                href={waHref(t.common.whatsappPrefill)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-foreground/68 hover:text-moss transition-colors"
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                {to.ouWhatsApp}
              </a>
            </div>

            {error && (
              <div role="alert" className="p-4 border border-moss/30 bg-moss/8 rounded-sm">
                <p className="text-moss-dark text-sm">{error}</p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
