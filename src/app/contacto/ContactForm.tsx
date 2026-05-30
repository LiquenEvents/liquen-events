"use client";

import { useState } from "react";
import Image from "next/image";

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
  eventType: "", nome: "", email: "", telefone: "",
  data: "", convidados: "", orcamento: "", mensagem: "",
};

const eventCards = [
  {
    value: "Corporativo",
    desc: "Conferências, teambuildings, jantares",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  {
    value: "Casamento",
    desc: "O dia mais especial da vossa vida",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    value: "Aniversário",
    desc: "Festas e celebrações memoráveis",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25a3 3 0 11-6 0 3 3 0 016 0zm6 6a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: "Jantar de Gala",
    desc: "Eventos sociais de prestígio",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    value: "Cultural",
    desc: "Arte, música e experiências únicas",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    ),
  },
  {
    value: "Outro",
    desc: "Evento personalizado à sua medida",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
];

const guestRanges = ["Até 30", "30–80", "80–150", "150–300", "300+"];
const stepLabels = ["Evento", "Dados", "Detalhes", "Mensagem"];

// ── Helpers ───────────────────────────────────────────────────────

function Pill({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 rounded-sm text-xs tracking-[0.18em] uppercase border transition-all duration-200 ${
        selected
          ? "bg-moss border-moss text-cream"
          : "border-foreground/15 text-foreground/38 hover:border-foreground/30 hover:text-foreground/65"
      }`}
    >
      {label}
    </button>
  );
}

function NavBtn({
  onClick, disabled = false, children, variant = "primary",
}: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "ghost";
}) {
  const base = "inline-flex items-center gap-3 text-[11px] tracking-[0.28em] uppercase transition-all duration-300";
  const styles =
    variant === "primary"
      ? `${base} px-9 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 shadow-lg shadow-moss/15 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3`
      : `${base} text-foreground/30 hover:text-foreground/60`;
  return (
    <button type={variant === "primary" ? "button" : "button"} onClick={onClick} disabled={disabled} className={styles}>
      {children}
    </button>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-14">
      {stepLabels.map((label, i) => (
        <div key={label} className="flex items-center flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                i + 1 < step
                  ? "bg-moss border-moss text-cream"
                  : i + 1 === step
                  ? "border-moss text-moss"
                  : "border-foreground/12 text-foreground/20"
              }`}
            >
              {i + 1 < step ? "✓" : i + 1}
            </div>
            <span
              className={`hidden sm:block text-[10px] tracking-[0.28em] uppercase transition-colors duration-300 whitespace-nowrap ${
                i + 1 <= step ? "text-foreground/50" : "text-foreground/18"
              }`}
            >
              {label}
            </span>
          </div>
          {i < stepLabels.length - 1 && (
            <div
              className={`flex-1 h-px mx-3 lg:mx-5 transition-all duration-500 ${
                i + 1 < step ? "bg-moss/40" : "bg-foreground/8"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const whatsappHref =
  "https://wa.me/351919259820?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20a%20organiza%C3%A7%C3%A3o%20de%20eventos.";

function WhatsAppIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────

export default function ContactForm() {
  const [step, setStep] = useState(1);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);

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
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("falha");
      setSent(true);
    } catch {
      setError("Não foi possível enviar. Tente novamente ou contacte-nos pelo WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  const inputCls =
    "w-full bg-transparent border-b border-foreground/15 pb-4 text-sm text-foreground placeholder-foreground/18 focus:outline-none focus:border-moss/55 transition-colors duration-300";

  const labelCls = "block text-[10px] text-foreground/28 tracking-[0.45em] uppercase mb-4";

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ height: "65vh", minHeight: "420px" }}>
        <Image
          src="/imagens/DJI_20250913190635_0120_D.jpg"
          alt="Evento Líquen Events"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
        <div className="absolute inset-0 flex flex-col justify-end px-6 lg:px-16 pb-20">
          <div className="max-w-7xl mx-auto w-full">
            <p className="text-cream/35 text-[10px] tracking-[0.5em] uppercase mb-8 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/60 rounded-full flex-shrink-0" />
              Fale connosco
            </p>
            <h1
              className="text-cream font-bold leading-[0.88] tracking-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(44px, 7.5vw, 100px)",
              }}
            >
              Vamos criar algo<br />
              <span className="text-moss">extraordinário.</span>
            </h1>
          </div>
        </div>
      </section>

      {/* ── Form + Info ── */}
      <section className="bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr]">

            {/* ── Left — Info ── */}
            <div className="lg:border-r border-foreground/8 py-20 lg:pr-20">
              <p className="text-foreground/28 text-[10px] tracking-[0.5em] uppercase mb-14 flex items-center gap-3">
                <span className="w-5 h-px bg-moss/50 rounded-full flex-shrink-0" />
                Encontre-nos
              </p>

              <div className="flex flex-col divide-y divide-foreground/8 mb-12">
                {[
                  { label: "E-mail", value: "liquen.alentejo@gmail.com", href: "mailto:liquen.alentejo@gmail.com", sub: "Respondemos em menos de 24 horas" },
                  { label: "Telefone", value: "+351 919 259 820", href: "tel:+351919259820", sub: "Seg–Sex, 9h–18h" },
                  { label: "Localização", value: "Évora, Portugal", href: null, sub: "Reuniões presenciais disponíveis" },
                ].map((item) => (
                  <div key={item.label} className="py-7">
                    <p className="text-foreground/22 text-[10px] tracking-[0.45em] uppercase mb-2">{item.label}</p>
                    {item.href ? (
                      <a href={item.href} className="text-foreground text-sm font-medium hover:text-moss transition-colors block mb-1.5">{item.value}</a>
                    ) : (
                      <p className="text-foreground text-sm font-medium mb-1.5">{item.value}</p>
                    )}
                    <p className="text-foreground/28 text-xs">{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* WhatsApp */}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-6 py-4 rounded-sm border border-foreground/12 hover:border-moss/40 hover:bg-moss/6 transition-all duration-300 group mb-12"
              >
                <span className="text-moss flex-shrink-0"><WhatsAppIcon /></span>
                <span className="text-[11px] tracking-[0.22em] uppercase text-foreground/40 group-hover:text-foreground/65 transition-colors">Falar pelo WhatsApp</span>
                <span className="ml-auto text-foreground/18 group-hover:text-moss/60 group-hover:translate-x-0.5 transition-all duration-300 text-sm">→</span>
              </a>

              {/* Redes */}
              <div className="flex gap-7 mb-14">
                {[
                  { label: "Instagram", href: "https://www.instagram.com/liquen.events" },
                  { label: "Facebook", href: "https://www.facebook.com/liquen.events" },
                ].map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] tracking-[0.25em] uppercase text-foreground/28 hover:text-foreground/65 transition-colors border-b border-foreground/12 pb-0.5 hover:border-foreground/40">
                    {s.label}
                  </a>
                ))}
              </div>

              {/* Promise */}
              <div className="border-l-2 border-moss/40 pl-7 py-2">
                <p className="text-foreground/58 text-base leading-relaxed mb-4" style={{ fontFamily: "var(--font-playfair)" }}>
                  Respondemos a todos os pedidos em menos de 24 horas úteis, com uma proposta personalizada.
                </p>
                <p className="text-foreground/25 text-[10px] tracking-[0.3em] uppercase">— Equipa Líquen Events</p>
              </div>
            </div>

            {/* ── Right — Multi-step form ── */}
            <div className="py-20 lg:pl-20">
              {sent ? (
                /* ── Success ── */
                <div className="flex flex-col items-start">
                  <div className="w-16 h-16 rounded-full bg-moss/15 border border-moss/30 flex items-center justify-center text-moss mb-12">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-foreground/28 text-[10px] tracking-[0.5em] uppercase mb-6">Enviado com sucesso</p>
                  <h3 className="text-foreground font-bold leading-tight mb-5" style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 4vw, 60px)" }}>
                    Mensagem<br />recebida.
                  </h3>
                  <p className="text-foreground/40 text-sm leading-[1.85] max-w-sm mb-14">
                    Obrigado{form.nome ? `, ${form.nome}` : ""}. Em breve entraremos em contacto para avançarmos juntos no seu evento.
                  </p>
                  {/* Next steps inline */}
                  <div className="w-full border border-foreground/8 overflow-hidden mb-10">
                    {[
                      { n: "01", t: "Analisamos o seu pedido", d: "Nas próximas horas" },
                      { n: "02", t: "Entramos em contacto", d: "Em menos de 24 horas" },
                      { n: "03", t: "Enviamos proposta à medida", d: "Personalizada para si" },
                    ].map((s, i) => (
                      <div key={s.n} className={`flex items-center gap-6 px-7 py-5 ${i < 2 ? "border-b border-foreground/8" : ""}`}>
                        <span className="text-moss/50 text-xs font-mono tabular-nums flex-shrink-0">{s.n}</span>
                        <div>
                          <p className="text-foreground text-sm font-medium">{s.t}</p>
                          <p className="text-foreground/28 text-xs mt-0.5">{s.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-foreground/30 hover:text-moss transition-colors">
                    <span className="text-moss"><WhatsAppIcon /></span>
                    Acompanhar pelo WhatsApp →
                  </a>
                </div>
              ) : (
                /* ── Steps ── */
                <>
                  <ProgressBar step={step} />
                  <form onSubmit={(e) => { e.preventDefault(); submit(); }}>

                    {/* Step 1 — Tipo */}
                    {step === 1 && (
                      <div>
                        <h2 className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight" style={{ fontFamily: "var(--font-playfair)" }}>
                          Que tipo de evento<br />está a planear?
                        </h2>
                        <p className="text-foreground/35 text-sm mb-10">Selecione a opção que melhor descreve o seu evento.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-12">
                          {eventCards.map((ec) => (
                            <button
                              key={ec.value}
                              type="button"
                              onClick={() => set("eventType", ec.value)}
                              className={`flex flex-col items-start gap-3 p-5 border text-left transition-all duration-200 ${
                                form.eventType === ec.value
                                  ? "border-moss bg-moss/10"
                                  : "border-foreground/10 hover:border-foreground/22 hover:bg-surface-raised"
                              }`}
                            >
                              <span className={`transition-colors duration-200 ${form.eventType === ec.value ? "text-moss" : "text-foreground/30"}`}>
                                {ec.icon}
                              </span>
                              <div>
                                <p className={`text-sm font-semibold mb-0.5 transition-colors duration-200 ${form.eventType === ec.value ? "text-foreground" : "text-foreground/55"}`}>{ec.value}</p>
                                <p className="text-xs text-foreground/28 leading-snug">{ec.desc}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                        <NavBtn onClick={() => setStep(2)} disabled={!form.eventType}>Continuar →</NavBtn>
                      </div>
                    )}

                    {/* Step 2 — Contacto */}
                    {step === 2 && (
                      <div>
                        <h2 className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight" style={{ fontFamily: "var(--font-playfair)" }}>
                          Diga-nos quem é.
                        </h2>
                        <p className="text-foreground/35 text-sm mb-10">Os seus dados de contacto para falarmos consigo.</p>
                        <div className="flex flex-col gap-10 mb-12">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                            <div>
                              <label className={labelCls}>Nome *</label>
                              <input type="text" value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inputCls} placeholder="O seu nome completo" />
                            </div>
                            <div>
                              <label className={labelCls}>E-mail *</label>
                              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} placeholder="email@exemplo.com" />
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>Telefone</label>
                            <input type="tel" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} className={inputCls} placeholder="+351 9XX XXX XXX" />
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <NavBtn variant="ghost" onClick={() => setStep(1)}>← Voltar</NavBtn>
                          <NavBtn onClick={() => setStep(3)} disabled={!form.nome || !form.email}>Continuar →</NavBtn>
                        </div>
                      </div>
                    )}

                    {/* Step 3 — Detalhes */}
                    {step === 3 && (
                      <div>
                        <h2 className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight" style={{ fontFamily: "var(--font-playfair)" }}>
                          Detalhes do evento.
                        </h2>
                        <p className="text-foreground/35 text-sm mb-10">Ajude-nos a perceber a dimensão e o timing.</p>
                        <div className="flex flex-col gap-10 mb-12">
                          <div>
                            <label className={labelCls}>Data Prevista</label>
                            <input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Nº de Convidados</label>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {guestRanges.map((r) => (
                                <Pill key={r} label={r} selected={form.convidados === r} onClick={() => set("convidados", r)} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <NavBtn variant="ghost" onClick={() => setStep(2)}>← Voltar</NavBtn>
                          <NavBtn onClick={() => setStep(4)}>Continuar →</NavBtn>
                        </div>
                      </div>
                    )}

                    {/* Step 4 — Mensagem */}
                    {step === 4 && (
                      <div>
                        <h2 className="text-foreground text-2xl lg:text-3xl font-bold mb-3 leading-tight" style={{ fontFamily: "var(--font-playfair)" }}>
                          A sua visão.
                        </h2>
                        <p className="text-foreground/35 text-sm mb-10">Descreva o evento dos seus sonhos. Quanto mais detalhe, melhor.</p>
                        <div className="flex flex-col gap-10 mb-10">
                          <div>
                            <label className={labelCls}>Mensagem *</label>
                            <textarea
                              required
                              value={form.mensagem}
                              onChange={(e) => set("mensagem", e.target.value)}
                              rows={7}
                              className={`${inputCls} resize-none`}
                              placeholder={`${form.eventType ? `Tipo de evento: ${form.eventType}\n\n` : ""}Local preferido, temática, inspirações, detalhes especiais...`}
                            />
                          </div>
                        </div>
                        {/* Resumo */}
                        {(form.eventType || form.convidados || form.orcamento || form.data) && (
                          <div className="border border-foreground/8 bg-surface-raised px-6 py-4 mb-8 flex flex-wrap gap-x-7 gap-y-2">
                            {form.eventType && <span className="text-xs"><span className="text-foreground/22 mr-1.5">Evento</span><span className="text-foreground/50">{form.eventType}</span></span>}
                            {form.convidados && <span className="text-xs"><span className="text-foreground/22 mr-1.5">Convidados</span><span className="text-foreground/50">{form.convidados}</span></span>}
                            {form.orcamento && <span className="text-xs"><span className="text-foreground/22 mr-1.5">Orçamento</span><span className="text-foreground/50">{form.orcamento}</span></span>}
                            {form.data && <span className="text-xs"><span className="text-foreground/22 mr-1.5">Data</span><span className="text-foreground/50">{form.data}</span></span>}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-6">
                          <NavBtn variant="ghost" onClick={() => setStep(3)}>← Voltar</NavBtn>
                          <button
                            type="submit"
                            disabled={!form.mensagem || sending}
                            className="inline-flex items-center gap-3 px-9 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-[11px] tracking-[0.3em] uppercase shadow-lg shadow-moss/15 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3"
                          >
                            {sending ? "A enviar…" : "Enviar Pedido →"}
                          </button>
                          <p className="text-foreground/20 text-xs tracking-wide">Resposta em 24h</p>
                        </div>
                        {error && (
                          <div className="mt-6 p-4 border border-moss/30 bg-moss/8 rounded-sm">
                            <p className="text-moss/80 text-sm">{error}</p>
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
