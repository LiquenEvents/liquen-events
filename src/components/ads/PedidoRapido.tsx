"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";
import { lerClique, serializar } from "@/lib/ads/click-id";
import { LEAD_SOURCE_KEY } from "@/components/LeadSourceCapture";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FORMULÁRIO CURTO DAS LANDING PAGES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUATRO perguntas: data, local, convidados, contacto. Mais nada.
 *
 * Não é preguiça — é a diferença entre um formulário que se preenche num
 * semáforo e um que se adia para "logo à noite no computador" e nunca mais.
 * Quem chega aqui veio de um anúncio, não conhece a marca, e não tem paciência
 * acumulada. O formulário completo (/orcamento) continua a existir para quem
 * quer configurar o pedido ao pormenor, e a página tem um caminho para lá.
 *
 * Estas quatro chegam para a equipa responder: a DATA diz se há
 * disponibilidade (é o que decide quase tudo), o LOCAL diz a deslocação, os
 * CONVIDADOS dizem a escala, e o CONTACTO permite ligar. Tudo o resto se
 * pergunta na resposta.
 *
 * ── O QUE ISTO ENVIA ALÉM DO QUE SE VÊ ─────────────────────────────────────
 * `adClick` — o identificador do clique pago, para o valor real do casamento
 * poder voltar ao Google Ads quando ele fechar. Sem isto a Google optimiza
 * para formulários preenchidos, que é a métrica errada.
 *
 * ── BASE LEGAL ─────────────────────────────────────────────────────────────
 * Não há caixa de "aceito os termos" porque tratar um pedido de orçamento é
 * uma diligência PRÉ-CONTRATUAL (RGPD art. 6.º/1/b), não um tratamento por
 * consentimento — pedir consentimento aqui seria juridicamente errado e
 * custaria conversões. O aviso de privacidade fica visível, com ligação.
 */

export interface TextosPedidoRapido {
  titulo: string;
  subtitulo: string;
  data: string;
  local: string;
  localPlaceholder: string;
  convidados: string;
  nome: string;
  email: string;
  telefone: string;
  telefoneOpcional: string;
  submeter: string;
  aSubmeter: string;
  erro: string;
  privacidade: string;
  privacidadeLink: string;
  completo: string;
}

export const TEXTOS_PT: TextosPedidoRapido = {
  titulo: "Pedir orçamento",
  subtitulo: "Quatro perguntas. Respondemos em 48 horas úteis.",
  data: "Data do casamento",
  local: "Local",
  localPlaceholder: "Quinta, herdade ou localidade",
  convidados: "Convidados",
  nome: "Nome",
  email: "Email",
  telefone: "Telemóvel",
  telefoneOpcional: "opcional",
  submeter: "Enviar pedido",
  aSubmeter: "A enviar",
  erro: "Não foi possível enviar. Tente novamente ou escreva para liquen.alentejo@gmail.com.",
  privacidade: "Os dados servem apenas para responder ao pedido. Ver",
  privacidadeLink: "política de privacidade",
  completo: "Prefere detalhar o pedido?",
};

export const TEXTOS_EN: TextosPedidoRapido = {
  titulo: "Request a quote",
  subtitulo: "Four questions. We reply within two working days.",
  data: "Wedding date",
  local: "Location",
  localPlaceholder: "Venue, estate or town",
  convidados: "Guests",
  nome: "Name",
  email: "Email",
  telefone: "Phone",
  telefoneOpcional: "optional",
  submeter: "Send request",
  aSubmeter: "Sending",
  erro: "We could not send this. Please try again or write to liquen.alentejo@gmail.com.",
  privacidade: "Your details are used only to answer this request. See our",
  privacidadeLink: "privacy policy",
  completo: "Rather give us the full picture?",
};

/** Identificador do clique pago guardado à entrada, na forma compacta. */
function lerAdClick(): string {
  const c = lerClique();
  return c ? serializar(c) : "";
}

/** Origem de primeiro toque (UTM/referenciador), gravada por LeadSourceCapture. */
function lerOrigem(): string {
  try {
    return sessionStorage.getItem(LEAD_SOURCE_KEY) ?? "";
  } catch {
    return "";
  }
}

const CAMPO =
  "w-full bg-transparent border-b border-foreground/20 py-2.5 text-[15px] " +
  "focus:outline-none focus:border-moss transition-colors placeholder:text-foreground/35";
const ROTULO = "block text-[10px] tracking-[0.25em] uppercase text-foreground/50 mb-1";

export default function PedidoRapido({
  locale,
  textos,
  contexto,
  className = "",
}: {
  locale: Locale;
  textos: TextosPedidoRapido;
  /**
   * Que página gerou este pedido ("polo:alentejo", "estilo:boho",
   * "internacional"). Segue no pedido e chega ao email da equipa, para se
   * saber qual das landing pages está a produzir — e para o teste de uma
   * página nova ter resposta ao fim de duas semanas em vez de nunca.
   */
  contexto: string;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState(false);
  const comecouRef = useRef(false);

  // "Começou a preencher" é o sinal intermédio que falta na maioria das contas:
  // separa "a página não convence" de "a página convence mas o formulário
  // trava". São problemas diferentes com correcções diferentes.
  function aoTocar() {
    if (comecouRef.current) return;
    comecouRef.current = true;
    track("QuoteStart", { origem: contexto });
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (aEnviar) return;
    setErro(false);
    setAEnviar(true);

    const dados = new FormData(e.currentTarget);
    const s = (k: string) => String(dados.get(k) ?? "").trim();

    const form = {
      category: "particulares",
      eventType: "casamentos",
      eventName: "",
      date: s("data"),
      endDate: "",
      location: s("local"),
      locationType: "",
      guests: Number(s("convidados")) || 0,
      duration: 0,
      isMultiDay: false,
      packageTier: "",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: `Pedido rápido — ${contexto}`,
      referralSource: lerOrigem(),
      adClick: lerAdClick(),
      name: s("nome"),
      email: s("email"),
      phone: s("telefone"),
      company: "",
      nif: "",
      acceptMarketing: false,
    };

    // Mesmo tratamento de ligação pendurada que o formulário completo: sem
    // isto, uma rede que abre o socket e nunca responde deixa o botão a rodar
    // para sempre, que é o pior desfecho possível na conversão principal.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `website` é o campo-armadilha que a rota também inspecciona.
        body: JSON.stringify({ form, website: s("website") }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as { id?: string } | null;
      if (!res.ok || !json?.id) throw new Error("falha");

      track("QuoteSubmit", { tipo: "casamentos", origem: contexto });
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
        /* a confirmação usa o recurso genérico */
      }
      router.push(localizeHref(`/orcamento/confirmacao/${json.id}`, locale));
    } catch {
      setErro(true);
      setAEnviar(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    <form
      onSubmit={submeter}
      onFocusCapture={aoTocar}
      className={`bg-surface/95 backdrop-blur-sm p-6 sm:p-8 shadow-xl shadow-black/10 ${className}`}
      noValidate
    >
      <h2 className="text-[22px] sm:text-[26px] font-bold tracking-display uppercase leading-tight">
        {textos.titulo}
      </h2>
      <p className="mt-1.5 text-[13px] text-foreground/60">{textos.subtitulo}</p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <label className={ROTULO} htmlFor={`${id}-data`}>
            {textos.data}
          </label>
          <input id={`${id}-data`} name="data" type="date" required className={CAMPO} />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-convidados`}>
            {textos.convidados}
          </label>
          <input
            id={`${id}-convidados`}
            name="convidados"
            type="number"
            min={1}
            max={2000}
            inputMode="numeric"
            required
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${id}-local`}>
            {textos.local}
          </label>
          <input
            id={`${id}-local`}
            name="local"
            type="text"
            required
            autoComplete="off"
            placeholder={textos.localPlaceholder}
            className={CAMPO}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${id}-nome`}>
            {textos.nome}
          </label>
          <input
            id={`${id}-nome`}
            name="nome"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            className={CAMPO}
          />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-email`}>
            {textos.email}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            className={CAMPO}
          />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${id}-telefone`}>
            {textos.telefone}{" "}
            <span className="normal-case tracking-normal text-foreground/35">
              ({textos.telefoneOpcional})
            </span>
          </label>
          <input
            id={`${id}-telefone`}
            name="telefone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className={CAMPO}
          />
        </div>
      </div>

      {/* Campo-armadilha. Fora do ecrã e fora da ordem de tabulação, com
          autocomplete desligado para o gestor de senhas não o preencher. */}
      <div aria-hidden="true" className="absolute left-[-9999px] w-px h-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {erro && (
        <p role="alert" className="mt-4 text-[13px] text-red-700">
          {textos.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={aEnviar}
        className={`${PRIMARY_BUTTON_CLASS} mt-6 w-full justify-center`}
      >
        {aEnviar ? textos.aSubmeter : textos.submeter}
      </button>

      <p className="mt-4 text-[11px] leading-relaxed text-foreground/45">
        {textos.privacidade}{" "}
        <a href={localizeHref("/privacidade", locale)} className="underline hover:text-moss">
          {textos.privacidadeLink}
        </a>
        .
      </p>
    </form>
  );
}
