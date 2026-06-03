"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { WHATSAPP_HREF_CTA } from "@/data";

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
  // Data mínima = hoje (não faz sentido pedir orçamento para uma data passada).
  const [minDate] = useState(() => new Date().toISOString().slice(0, 10));

  const nomeErr = touched.nome && nome.trim().length < 2 ? "Indique o seu nome" : "";
  const emailErr = touched.email && !/\S+@\S+\.\S+/.test(email) ? "Email inválido" : "";
  const ready = nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && eventType !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || sending || website) return;
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
        body: JSON.stringify({ form }),
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
      router.push(`/orcamento/confirmacao/${json.id}`);
    } catch {
      setError("Não foi possível enviar. Tente novamente ou fale connosco pelo WhatsApp.");
      setSending(false);
    }
  }

  const inputCls =
    "w-full bg-transparent border-b border-foreground/15 pb-3.5 text-base text-foreground placeholder-foreground/20 focus:outline-none focus:border-moss/55 transition-colors duration-300";
  const labelCls =
    "block text-[10px] text-foreground/55 tracking-[0.4em] uppercase mb-3.5 transition-colors duration-300 group-focus-within:text-moss-light";
  const hintCls = "mt-2 text-[11px] tracking-wide text-gold/80";

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr]">
      {/* ── Painel imagem (esquerda) ── */}
      <aside className="relative hidden lg:block overflow-hidden">
        <Image
          src="/imagens/DaniGui_Adois_61.jpg"
          alt="Evento Líquen Events"
          fill
          preload
          sizes="(max-width: 1024px) 0vw, 45vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/35 to-[#080808]/55" />
        <div className="absolute inset-0 flex flex-col justify-between p-12 xl:p-16">
          <Link
            href="/"
            className="text-cream/70 text-[11px] tracking-[0.3em] uppercase hover:text-cream transition-colors inline-flex items-center gap-2 w-fit"
          >
            ← Líquen Events
          </Link>
          <div>
            <p className="text-cream/40 text-[10px] tracking-[0.5em] uppercase mb-7 flex items-center gap-3">
              <span className="w-6 h-px bg-gold/60 flex-shrink-0" />
              Pedido de orçamento
            </p>
            <h1
              className="text-cream font-bold leading-[0.92] tracking-tight mb-8"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 4vw, 68px)" }}
            >
              Conte-nos
              <br />
              <span className="text-moss-light">a sua ideia.</span>
            </h1>
            <p className="text-cream/45 text-sm leading-[1.8] max-w-xs">
              Sem compromisso. Respondemos com uma proposta à medida em menos de 24&nbsp;horas.
            </p>
          </div>
        </div>
      </aside>

      {/* ── Formulário (direita) ── */}
      <main className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 xl:px-24 py-16 lg:py-20">
        <div className="w-full max-w-xl mx-auto">
          {/* Cabeçalho mobile */}
          <div className="lg:hidden mb-12">
            <Link
              href="/"
              className="text-foreground/55 text-[11px] tracking-[0.3em] uppercase hover:text-moss transition-colors inline-flex items-center gap-2 mb-8"
            >
              ← Líquen Events
            </Link>
            <h1
              className="text-foreground font-bold leading-[0.95] tracking-tight"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 9vw, 52px)" }}
            >
              Conte-nos <span className="text-moss">a sua ideia.</span>
            </h1>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-11">
            {/* Honeypot */}
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

            {/* Tipo de evento */}
            <fieldset className="group">
              <legend className={labelCls}>Tipo de evento *</legend>
              <div className="flex flex-wrap gap-2.5">
                {EVENT_TYPES.map((o) => {
                  const active = eventType === o.label;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setEventType(o.label)}
                      aria-pressed={active}
                      className={`px-4 py-2.5 rounded-full text-xs tracking-[0.12em] uppercase border transition-all duration-200 ${
                        active
                          ? "bg-moss border-moss text-cream shadow-lg shadow-moss/20"
                          : "border-foreground/15 text-foreground/50 hover:border-foreground/35 hover:text-foreground/80"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Data + Nº de pessoas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <div className="group">
                <label htmlFor="of-data" className={labelCls}>
                  Data do evento
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
                  Nº de pessoas
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
                  placeholder="Ex.: 120"
                />
              </div>
            </div>

            {/* Nome + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-9">
              <div className="group">
                <label htmlFor="of-nome" className={labelCls}>
                  Nome *
                </label>
                <input
                  id="of-nome"
                  type="text"
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, nome: true }))}
                  aria-invalid={!!nomeErr}
                  className={`${inputCls} ${nomeErr ? "border-gold/60" : ""}`}
                  placeholder="O seu nome"
                />
                {nomeErr && <p className={hintCls}>{nomeErr}</p>}
              </div>
              <div className="group">
                <label htmlFor="of-email" className={labelCls}>
                  Email *
                </label>
                <input
                  id="of-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  aria-invalid={!!emailErr}
                  className={`${inputCls} ${emailErr ? "border-gold/60" : ""}`}
                  placeholder="email@exemplo.com"
                />
                {emailErr && <p className={hintCls}>{emailErr}</p>}
              </div>
            </div>

            {/* Telefone */}
            <div className="group">
              <label htmlFor="of-telefone" className={labelCls}>
                Telefone
              </label>
              <input
                id="of-telefone"
                type="tel"
                autoComplete="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className={inputCls}
                placeholder="+351 9XX XXX XXX"
              />
            </div>

            {/* Mensagem */}
            <div className="group">
              <label htmlFor="of-mensagem" className={labelCls}>
                Mensagem
              </label>
              <textarea
                id="of-mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                className={`${inputCls} resize-none`}
                placeholder="Conte-nos o que imagina para o seu evento — local, ambiente, detalhes especiais…"
              />
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4 pt-1">
              <button
                type="submit"
                disabled={!ready || sending}
                className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-[11px] tracking-[0.3em] uppercase shadow-lg shadow-moss/15 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:gap-3"
              >
                {sending ? (
                  <>
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border border-cream/30 border-t-cream animate-spin"
                      aria-hidden
                    />
                    A enviar…
                  </>
                ) : (
                  "Enviar pedido →"
                )}
              </button>
              <a
                href={WHATSAPP_HREF_CTA}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 text-[11px] tracking-[0.22em] uppercase text-foreground/45 hover:text-moss transition-colors"
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                ou pelo WhatsApp
              </a>
            </div>

            {error && (
              <div role="alert" className="p-4 border border-moss/30 bg-moss/8 rounded-sm">
                <p className="text-moss-dark text-sm">{error}</p>
              </div>
            )}

            <p className="text-foreground/25 text-[11px] leading-relaxed">
              Os campos marcados com&nbsp;* são obrigatórios. Resposta em menos de 24&nbsp;horas
              úteis.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
