"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { waHref } from "@/data";
import { useTranslations } from "@/components/LocaleProvider";

// ── Data ─────────────────────────────────────────────────────────

interface FormData {
  eventType: string;
  nome: string;
  email: string;
  telefone: string;
  data: string;
  convidados: string;
  orcamento: string;
  mensagem: string;
}

const EMPTY: FormData = {
  eventType: "",
  nome: "",
  email: "",
  telefone: "",
  data: "",
  convidados: "",
  orcamento: "",
  mensagem: "",
};

const eventCards = [
  {
    value: "Corporativo",
    desc: "Conferências, teambuildings, jantares",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"
        />
      </svg>
    ),
  },
  {
    value: "Casamento",
    desc: "O dia mais especial da vossa vida",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    ),
  },
  {
    value: "Aniversário",
    desc: "Festas e celebrações memoráveis",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25a3 3 0 11-6 0 3 3 0 016 0zm6 6a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    value: "Jantar de Gala",
    desc: "Eventos sociais de prestígio",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
        />
      </svg>
    ),
  },
  {
    value: "Outro",
    desc: "Evento personalizado à sua medida",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
];

// ── Helpers ───────────────────────────────────────────────────────

function Pill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 sm:py-2.5 rounded-sm text-xs tracking-[0.18em] uppercase border transition-all duration-200 ${
        selected
          ? "bg-moss border-moss text-cream"
          : "border-foreground/15 text-foreground/38 hover:border-foreground/30 hover:text-foreground/78"
      }`}
    >
      {label}
    </button>
  );
}

function NavBtn({
  onClick,
  disabled = false,
  children,
  variant = "primary",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const base =
    "inline-flex items-center gap-3 text-[11px] tracking-[0.28em] uppercase transition-all duration-300";
  const styles =
    variant === "primary"
      ? `${base} px-9 py-4 btn-shine bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 shadow-lg shadow-moss/15 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3`
      : `${base} text-foreground/72 hover:text-moss`;
  return (
    <button
      type={variant === "primary" ? "button" : "button"}
      onClick={onClick}
      disabled={disabled}
      className={styles}
    >
      {children}
    </button>
  );
}

function ProgressBar({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-0 mb-9 sm:mb-14">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                i + 1 < step
                  ? "bg-moss border-moss text-cream"
                  : i + 1 === step
                    ? "border-moss text-moss"
                    : "border-foreground/12 text-foreground/78"
              }`}
            >
              {i + 1 < step ? "✓" : i + 1}
            </div>
            <span
              className={`hidden sm:block text-[10px] tracking-[0.28em] uppercase transition-colors duration-300 whitespace-nowrap ${
                i + 1 <= step ? "text-foreground/68" : "text-foreground/18"
              }`}
            >
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div
              className={`flex-1 h-px mx-2 sm:mx-3 lg:mx-5 transition-all duration-500 ${
                i + 1 < step ? "bg-moss/40" : "bg-foreground/8"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────

export default function ContactForm() {
  const { t } = useTranslations();
  const tf = t.contacto.form;
  const [step, setStep] = useState(1);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [website, setWebsite] = useState(""); // honeypot — must stay empty

  function set(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.mensagem || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      if (!res.ok) throw new Error("falha");
      setSent(true);
    } catch {
      setError(tf.error);
    } finally {
      setSending(false);
    }
  }

  const inputCls =
    "w-full bg-transparent border-b border-foreground/15 pb-4 text-sm text-foreground placeholder-foreground/18 focus:outline-none focus:border-moss/55 transition-colors duration-300";

  const labelCls = "block text-[10px] text-foreground/68 tracking-[0.45em] uppercase mb-4";

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ height: "65svh", minHeight: "420px" }}>
        <Image
          src="/imagens/DJI_20250913190635_0120_D.jpg"
          alt="Evento Líquen Events"
          fill
          preload
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
        <div className="absolute inset-0 flex flex-col justify-end px-6 lg:px-16 pb-20">
          <div className="max-w-7xl mx-auto w-full">
            <p className="text-cream/35 text-[10px] tracking-[0.5em] uppercase mb-8 flex items-center gap-3">
              <span className="w-5 h-px bg-gold/60 rounded-full flex-shrink-0" />
              {tf.heroEyebrow}
            </p>
            <h1
              className="text-cream font-bold leading-[0.88] tracking-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(44px, 7.5vw, 100px)",
              }}
            >
              {tf.heroTitleLine1}
              <br />
              <span className="text-moss">{tf.heroTitleMoss}</span>
            </h1>
          </div>
        </div>
      </section>

      {/* ── Form + Info ── */}
      <section className="bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr]">
            {/* ── Left — Info ── */}
            <div className="border-b border-foreground/8 lg:border-b-0 lg:border-r py-12 md:py-20 lg:pr-20">
              <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase mb-14 flex items-center gap-3">
                <span className="w-5 h-px bg-gold/50 rounded-full flex-shrink-0" />
                {tf.infoEyebrow}
              </p>

              <div className="flex flex-col divide-y divide-foreground/8 mb-12">
                {[
                  {
                    label: tf.emailLabel,
                    value: "liquen.alentejo@gmail.com",
                    href: "mailto:liquen.alentejo@gmail.com",
                    sub: tf.emailSub,
                  },
                  {
                    label: tf.phoneLabel,
                    value: "+351 919 259 820",
                    href: "tel:+351919259820",
                    sub: tf.phoneSub,
                  },
                  {
                    label: tf.locationLabel,
                    value: tf.locationValue,
                    href: null,
                    sub: tf.locationSub,
                  },
                ].map((item) => (
                  <div key={item.label} className="py-7">
                    <p className="text-foreground/78 text-[10px] tracking-[0.45em] uppercase mb-2">
                      {item.label}
                    </p>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-foreground text-sm font-medium hover:text-moss transition-colors block mb-1.5"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-foreground text-sm font-medium mb-1.5">{item.value}</p>
                    )}
                    <p className="text-foreground/68 text-xs">{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* Detailed quote simulator — complements the quick message form */}
              <Link
                href="/orcamento"
                className="flex items-center gap-3 w-full px-6 py-4 rounded-sm border border-foreground/12 hover:border-moss/40 hover:bg-moss/6 transition-all duration-300 group mb-3"
              >
                <span className="text-moss flex-shrink-0 text-sm">✦</span>
                <span className="text-[11px] tracking-[0.22em] uppercase text-foreground/60 group-hover:text-foreground/78 transition-colors">
                  {tf.quoteLink}
                </span>
                <span className="ml-auto text-foreground/18 group-hover:text-moss/60 group-hover:translate-x-0.5 transition-all duration-300 text-sm">
                  →
                </span>
              </Link>

              {/* WhatsApp */}
              <a
                href={waHref(t.common.whatsappPrefill)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-6 py-4 rounded-sm border border-foreground/12 hover:border-moss/40 hover:bg-moss/6 transition-all duration-300 group mb-12"
              >
                <span className="text-moss flex-shrink-0">
                  <WhatsAppIcon className="w-4 h-4" />
                </span>
                <span className="text-[11px] tracking-[0.22em] uppercase text-foreground/60 group-hover:text-foreground/78 transition-colors">
                  {tf.whatsappLink}
                </span>
                <span className="ml-auto text-foreground/18 group-hover:text-moss/60 group-hover:translate-x-0.5 transition-all duration-300 text-sm">
                  →
                </span>
              </a>

              {/* Redes */}
              <div className="flex gap-7 mb-14">
                {[
                  { label: "Instagram", href: "https://www.instagram.com/liquen.events" },
                  { label: "Facebook", href: "https://www.facebook.com/liquen.events" },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] tracking-[0.25em] uppercase text-foreground/68 hover:text-foreground/78 transition-colors border-b border-foreground/12 pb-0.5 hover:border-foreground/40"
                  >
                    {s.label}
                  </a>
                ))}
              </div>

              {/* Promise */}
              <div className="border-l-2 border-moss/40 pl-7 py-2">
                <p
                  className="text-foreground/72 text-base leading-relaxed mb-4"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {tf.promise}
                </p>
                <p className="text-foreground/68 text-[10px] tracking-[0.3em] uppercase">
                  {tf.promiseSign}
                </p>
              </div>
            </div>

            {/* ── Right — Multi-step form ── */}
            <div className="py-12 md:py-20 lg:pl-20">
              {sent ? (
                /* ── Success ── */
                <div className="flex flex-col items-start">
                  <div className="w-16 h-16 rounded-full bg-moss/15 border border-moss/30 flex items-center justify-center text-moss mb-12">
                    <svg
                      className="w-7 h-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </div>
                  <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase mb-6">
                    {tf.successEyebrow}
                  </p>
                  <h3
                    className="text-foreground font-bold leading-tight mb-5"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(36px, 4vw, 60px)",
                    }}
                  >
                    {tf.successTitle1}
                    <br />
                    {tf.successTitle2}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-[1.85] max-w-sm mb-14">
                    {tf.successThanks}
                    {form.nome ? `, ${form.nome}` : ""}
                    {tf.successText}
                  </p>
                  {/* Next steps inline */}
                  <div className="w-full border border-foreground/8 overflow-hidden mb-10">
                    {tf.successSteps.map((s, i) => (
                      <div
                        key={s.n}
                        className={`flex items-center gap-4 px-5 py-4 sm:px-7 sm:py-5 ${i < 2 ? "border-b border-foreground/8" : ""}`}
                      >
                        <span className="text-moss/50 text-xs font-mono tabular-nums flex-shrink-0">
                          {s.n}
                        </span>
                        <div>
                          <p className="text-foreground text-sm font-medium">{s.t}</p>
                          <p className="text-foreground/68 text-xs mt-0.5">{s.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <a
                    href={waHref(t.common.whatsappPrefill)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-foreground/72 hover:text-moss transition-colors"
                  >
                    <span className="text-moss">
                      <WhatsAppIcon className="w-4 h-4" />
                    </span>
                    {tf.successWhatsApp} →
                  </a>
                </div>
              ) : (
                /* ── Steps ── */
                <>
                  <ProgressBar step={step} labels={tf.stepLabels} />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit();
                    }}
                  >
                    {/* Honeypot — hidden from humans, bots tend to fill it */}
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="absolute -left-[9999px] h-0 w-0 opacity-0"
                    />
                    {/* Step 1 — Tipo */}
                    {step === 1 && (
                      <div>
                        <h2
                          className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight"
                          style={{ fontFamily: "var(--font-playfair)" }}
                        >
                          {tf.step1Title1}
                          <br />
                          {tf.step1Title2}
                        </h2>
                        <p className="text-foreground/60 text-sm mb-10">{tf.step1Sub}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-12">
                          {eventCards.map((ec, i) => {
                            const card = tf.eventCards[i] ?? { value: ec.value, desc: ec.desc };
                            return (
                              <button
                                key={card.value}
                                type="button"
                                onClick={() => set("eventType", card.value)}
                                className={`flex flex-col items-start gap-3 p-5 border text-left transition-all duration-200 ${
                                  form.eventType === card.value
                                    ? "border-moss bg-moss/10"
                                    : "border-foreground/10 hover:border-foreground/22 hover:bg-surface-raised"
                                }`}
                              >
                                <span
                                  className={`transition-colors duration-200 ${form.eventType === card.value ? "text-moss" : "text-foreground/72"}`}
                                >
                                  {ec.icon}
                                </span>
                                <div>
                                  <p
                                    className={`text-sm font-semibold mb-0.5 transition-colors duration-200 ${form.eventType === card.value ? "text-foreground" : "text-foreground/72"}`}
                                  >
                                    {card.value}
                                  </p>
                                  <p className="text-xs text-foreground/68 leading-snug">
                                    {card.desc}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <NavBtn onClick={() => setStep(2)} disabled={!form.eventType}>
                          {tf.continuar} →
                        </NavBtn>
                      </div>
                    )}

                    {/* Step 2 — Contacto */}
                    {step === 2 && (
                      <div>
                        <h2
                          className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight"
                          style={{ fontFamily: "var(--font-playfair)" }}
                        >
                          {tf.step2Title}
                        </h2>
                        <p className="text-foreground/60 text-sm mb-10">{tf.step2Sub}</p>
                        <div className="flex flex-col gap-7 sm:gap-10 mb-12">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 sm:gap-10">
                            <div>
                              <label htmlFor="cf-nome" className={labelCls}>
                                {tf.labelNome}
                              </label>
                              <input
                                id="cf-nome"
                                type="text"
                                autoComplete="name"
                                value={form.nome}
                                onChange={(e) => set("nome", e.target.value)}
                                className={inputCls}
                                placeholder={tf.phName}
                              />
                            </div>
                            <div>
                              <label htmlFor="cf-email" className={labelCls}>
                                {tf.labelEmail}
                              </label>
                              <input
                                id="cf-email"
                                type="email"
                                autoComplete="email"
                                value={form.email}
                                onChange={(e) => set("email", e.target.value)}
                                className={inputCls}
                                placeholder={tf.phEmail}
                              />
                            </div>
                          </div>
                          <div>
                            <label htmlFor="cf-telefone" className={labelCls}>
                              {tf.labelTelefone}
                            </label>
                            <input
                              id="cf-telefone"
                              type="tel"
                              autoComplete="tel"
                              value={form.telefone}
                              onChange={(e) => set("telefone", e.target.value)}
                              className={inputCls}
                              placeholder={tf.phPhone}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <NavBtn variant="ghost" onClick={() => setStep(1)}>
                            ← {tf.voltar}
                          </NavBtn>
                          <NavBtn onClick={() => setStep(3)} disabled={!form.nome || !form.email}>
                            {tf.continuar} →
                          </NavBtn>
                        </div>
                      </div>
                    )}

                    {/* Step 3 — Detalhes */}
                    {step === 3 && (
                      <div>
                        <h2
                          className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight"
                          style={{ fontFamily: "var(--font-playfair)" }}
                        >
                          {tf.step3Title}
                        </h2>
                        <p className="text-foreground/60 text-sm mb-10">{tf.step3Sub}</p>
                        <div className="flex flex-col gap-7 sm:gap-10 mb-12">
                          <div>
                            <label htmlFor="cf-data" className={labelCls}>
                              {tf.labelData}
                            </label>
                            <input
                              id="cf-data"
                              type="date"
                              value={form.data}
                              onChange={(e) => set("data", e.target.value)}
                              className={`${inputCls} [color-scheme:light]`}
                            />
                          </div>
                          <div>
                            <span className={labelCls}>{tf.labelConvidados}</span>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {tf.guestRanges.map((r) => (
                                <Pill
                                  key={r}
                                  label={r}
                                  selected={form.convidados === r}
                                  onClick={() => set("convidados", r)}
                                />
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className={labelCls}>{tf.labelOrcamento}</span>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {tf.budgetRanges.map((r) => (
                                <Pill
                                  key={r}
                                  label={r}
                                  selected={form.orcamento === r}
                                  onClick={() => set("orcamento", r)}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <NavBtn variant="ghost" onClick={() => setStep(2)}>
                            ← {tf.voltar}
                          </NavBtn>
                          <NavBtn onClick={() => setStep(4)}>{tf.continuar} →</NavBtn>
                        </div>
                      </div>
                    )}

                    {/* Step 4 — Mensagem */}
                    {step === 4 && (
                      <div>
                        <h2
                          className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight"
                          style={{ fontFamily: "var(--font-playfair)" }}
                        >
                          {tf.step4Title}
                        </h2>
                        <p className="text-foreground/60 text-sm mb-10">{tf.step4Sub}</p>
                        <div className="flex flex-col gap-10 mb-10">
                          <div>
                            <label htmlFor="cf-mensagem" className={labelCls}>
                              {tf.labelMensagem}
                            </label>
                            <textarea
                              id="cf-mensagem"
                              required
                              value={form.mensagem}
                              onChange={(e) => set("mensagem", e.target.value)}
                              rows={7}
                              className={`${inputCls} resize-none`}
                              placeholder={`${form.eventType ? `${tf.msgPrefix}${form.eventType}\n\n` : ""}${tf.phMensagem}`}
                            />
                          </div>
                        </div>
                        {/* Resumo */}
                        {(form.eventType || form.convidados || form.orcamento || form.data) && (
                          <div className="border border-foreground/8 bg-surface-raised px-6 py-4 mb-8 flex flex-wrap gap-x-7 gap-y-2">
                            {form.eventType && (
                              <span className="text-xs">
                                <span className="text-foreground/78 mr-1.5">
                                  {tf.summaryEvento}
                                </span>
                                <span className="text-foreground/68">{form.eventType}</span>
                              </span>
                            )}
                            {form.convidados && (
                              <span className="text-xs">
                                <span className="text-foreground/78 mr-1.5">
                                  {tf.summaryConvidados}
                                </span>
                                <span className="text-foreground/68">{form.convidados}</span>
                              </span>
                            )}
                            {form.orcamento && (
                              <span className="text-xs">
                                <span className="text-foreground/78 mr-1.5">
                                  {tf.summaryOrcamento}
                                </span>
                                <span className="text-foreground/68">{form.orcamento}</span>
                              </span>
                            )}
                            {form.data && (
                              <span className="text-xs">
                                <span className="text-foreground/78 mr-1.5">{tf.summaryData}</span>
                                <span className="text-foreground/68">{form.data}</span>
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-6">
                          <NavBtn variant="ghost" onClick={() => setStep(3)}>
                            ← {tf.voltar}
                          </NavBtn>
                          <button
                            type="submit"
                            disabled={!form.mensagem || sending}
                            className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-[11px] tracking-[0.3em] uppercase shadow-lg shadow-moss/15 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3"
                          >
                            {sending ? tf.enviando : `${tf.enviar} →`}
                          </button>
                          <p className="text-foreground/78 text-xs tracking-wide">
                            {tf.resposta24}
                          </p>
                        </div>
                        {error && (
                          <div
                            role="alert"
                            className="mt-6 p-4 border border-moss/30 bg-moss/8 rounded-sm"
                          >
                            <p className="text-moss-dark text-sm">{error}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
