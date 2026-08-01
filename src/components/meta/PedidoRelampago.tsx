"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";
import { meta } from "@/lib/meta/enviar";
import { lerClique, serializar } from "@/lib/ads/click-id";
import { lerIdentificadores, serializar as serializarMeta } from "@/lib/meta/click-id";
import { LEAD_SOURCE_KEY } from "@/components/LeadSourceCapture";
import { localizeHref, type Locale } from "@/lib/i18n/config";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FORMULÁRIO DE QUATRO CAMPOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `PedidoRapido` das páginas do Google tem SEIS campos (data, convidados,
 * local, nome, email, telemóvel). Aqui são QUATRO: data, local, contacto,
 * nome. O resto pergunta-se na resposta.
 *
 * ── PORQUE É QUE SÃO QUATRO E NÃO TRÊS ─────────────────────────────────────
 * Foi pedido "contacto + data + local". Falta o NOME, e não é enchimento: a
 * primeira coisa que a equipa faz com um pedido é responder, e responder a
 * alguém sem saber como se chama começa a conversa mal. Quatro campos num
 * telemóvel são quatro toques; o que se cortou foi o que custava pensar —
 * quantos convidados (que muita gente ainda não sabe) e a escolha entre dar
 * email OU telefone.
 *
 * ── O CAMPO "CONTACTO" É UM SÓ ─────────────────────────────────────────────
 * Email e telemóvel eram dois campos e passaram a um. Escreve-se o que se
 * tiver à mão; aqui decide-se qual é qual pela forma (há `@` ou não), e a
 * rota do orçamento aceita agora um dos dois — antes exigia sempre email, que
 * era o que obrigava a ter os dois campos.
 *
 * Quem vem do Instagram tem o teclado na mão e escreve o número. Quem está no
 * computador escreve o email. Nenhum dos dois é obrigado a fornecer o outro.
 *
 * ── O QUE VIAJA JUNTO, ALÉM DO QUE SE VÊ ───────────────────────────────────
 *   • `adClick`   — o identificador do clique da Google (se veio de lá antes);
 *   • `metaClick` — o `fbp` e o `fbc` da Meta, para o valor real do casamento
 *                   poder voltar à Meta quando ele fechar;
 *   • `leadEventId` — o `event_id` do evento `Lead`, para o servidor poder
 *                   reenviar pela CAPI sem duplicar.
 *
 * ── BASE LEGAL ─────────────────────────────────────────────────────────────
 * Igual à do formulário das páginas do Google: diligência pré-contratual
 * (RGPD art. 6.º/1/b), sem caixa de consentimento, com o aviso de privacidade
 * visível. O consentimento que existe nesta página é OUTRO — o do pixel — e
 * vive no banner de cookies.
 */

export interface TextosRelampago {
  titulo: string;
  subtitulo: string;
  data: string;
  local: string;
  localPlaceholder: string;
  contacto: string;
  contactoPlaceholder: string;
  contactoAjuda: string;
  nome: string;
  submeter: string;
  aSubmeter: string;
  erro: string;
  erroContacto: string;
  privacidade: string;
  privacidadeLink: string;
}

export const RELAMPAGO_PT: TextosRelampago = {
  titulo: "Pedir orçamento",
  subtitulo: "Quatro campos. Respondemos em 48 horas úteis.",
  data: "Data do casamento",
  local: "Onde",
  localPlaceholder: "Quinta, herdade ou localidade",
  contacto: "Contacto",
  contactoPlaceholder: "Telemóvel ou email",
  contactoAjuda: "O que lhe der mais jeito.",
  nome: "Nome",
  submeter: "Enviar",
  aSubmeter: "A enviar",
  erro: "Não foi possível enviar. Tente novamente ou fale connosco por WhatsApp.",
  erroContacto: "Escreva um telemóvel ou um email para lhe podermos responder.",
  privacidade: "Os dados servem apenas para responder ao pedido. Ver",
  privacidadeLink: "política de privacidade",
};

export const RELAMPAGO_EN: TextosRelampago = {
  titulo: "Request a quote",
  subtitulo: "Four fields. We reply within two working days.",
  data: "Wedding date",
  local: "Where",
  localPlaceholder: "Venue, estate or town",
  contacto: "Contact",
  contactoPlaceholder: "Phone or email",
  contactoAjuda: "Whichever suits you.",
  nome: "Name",
  submeter: "Send",
  aSubmeter: "Sending",
  erro: "We could not send this. Please try again or message us on WhatsApp.",
  erroContacto: "Please give us a phone number or an email so we can reply.",
  privacidade: "Your details are used only to answer this request. See our",
  privacidadeLink: "privacy policy",
};

/**
 * Email ou telefone?
 *
 * A regra é a mais simples que funciona: há `@` → é email. Não há → tira-se
 * tudo o que não é dígito e, se sobrarem nove ou mais, é telefone.
 *
 * NÃO se valida o email a fundo aqui. Quem valida é a rota, com o mesmo
 * esquema de sempre; duplicar a regra em dois sítios é como se acaba com duas
 * regras diferentes. O que se faz aqui é só ENCAMINHAR o valor para o campo
 * certo, e recusar o que não é nem uma coisa nem outra — que é o único erro
 * que vale a pena mostrar antes de submeter.
 */
export function repartirContacto(v: string): { email: string; telefone: string } | null {
  const s = v.trim();
  if (!s) return null;
  if (s.includes("@")) return { email: s, telefone: "" };
  const digitos = s.replace(/\D/g, "");
  if (digitos.length >= 9) return { email: "", telefone: s };
  return null;
}

const CAMPO =
  "w-full bg-transparent border-b border-foreground/25 py-3 text-[16px] " +
  "focus:outline-none focus:border-moss transition-colors placeholder:text-foreground/35";
const ROTULO = "block text-[10px] tracking-[0.25em] uppercase text-foreground/50 mb-1";

export default function PedidoRelampago({
  locale,
  textos,
  contexto,
}: {
  locale: Locale;
  textos: TextosRelampago;
  /** "s/comporta" — segue no pedido e chega ao email da equipa. */
  contexto: string;
}) {
  const router = useRouter();
  const id = useId();
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<"" | "envio" | "contacto">("");
  const comecouRef = useRef(false);

  function aoTocar() {
    if (comecouRef.current) return;
    comecouRef.current = true;
    track("QuoteStart", { origem: contexto });
    meta.comecouFormulario({ contexto });
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (aEnviar) return;

    const dados = new FormData(e.currentTarget);
    const s = (k: string) => String(dados.get(k) ?? "").trim();

    const contacto = repartirContacto(s("contacto"));
    if (!contacto) {
      setErro("contacto");
      return;
    }
    setErro("");
    setAEnviar(true);

    // O `event_id` é gerado AQUI e viaja com o pedido: o servidor reenvia o
    // mesmo `Lead` pela CAPI com este identificador, e a Meta conta uma vez.
    const leadEventId = meta.lead({
      contexto,
      email: contacto.email,
      telefone: contacto.telefone,
      nome: s("nome"),
    });

    const cliqueGoogle = (() => {
      try {
        const c = lerClique();
        return c ? serializar(c) : "";
      } catch {
        return "";
      }
    })();
    const cliqueMeta = (() => {
      try {
        return serializarMeta(lerIdentificadores());
      } catch {
        return "";
      }
    })();
    const origem = (() => {
      try {
        return sessionStorage.getItem(LEAD_SOURCE_KEY) ?? "";
      } catch {
        return "";
      }
    })();

    const form = {
      category: "particulares",
      eventType: "casamentos",
      eventName: "",
      date: s("data"),
      endDate: "",
      location: s("local"),
      locationType: "",
      guests: 0,
      duration: 0,
      isMultiDay: false,
      packageTier: "",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: `Pedido de anúncio social (${contexto})`,
      referralSource: origem,
      adClick: cliqueGoogle,
      metaClick: cliqueMeta,
      leadEventId,
      name: s("nome"),
      email: contacto.email,
      phone: contacto.telefone,
      company: "",
      nif: "",
      acceptMarketing: false,
    };

    // O mesmo tratamento de ligação pendurada do formulário completo: sem
    // isto, uma rede que abre o socket e nunca responde deixa o botão a rodar
    // para sempre — que no browser interno do Instagram, onde a rede é pior, é
    // um desfecho bem mais provável do que no Safari.
    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), 25000);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, website: s("website") }),
        signal: controlador.signal,
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
      setErro("envio");
      setAEnviar(false);
    } finally {
      clearTimeout(limite);
    }
  }

  return (
    <form
      id="pedido"
      onSubmit={submeter}
      onFocusCapture={aoTocar}
      className="bg-surface px-5 py-8 sm:px-8 sm:py-10"
      noValidate
    >
      <h2 className="text-[22px] font-bold uppercase leading-tight tracking-display">
        {textos.titulo}
      </h2>
      <p className="mt-1.5 text-[13px] text-foreground/60">{textos.subtitulo}</p>

      <div className="mt-7 space-y-5">
        <div>
          <label className={ROTULO} htmlFor={`${id}-data`}>
            {textos.data}
          </label>
          <input id={`${id}-data`} name="data" type="date" required className={CAMPO} />
        </div>
        <div>
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
        <div>
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
          <label className={ROTULO} htmlFor={`${id}-contacto`}>
            {textos.contacto}
          </label>
          <input
            id={`${id}-contacto`}
            name="contacto"
            // `type="text"` e não `email` nem `tel`: o campo aceita os dois, e
            // um `type="email"` faria o browser recusar um número de telemóvel
            // com a sua própria mensagem, antes de este código lhe tocar.
            // `inputMode="text"` deixa o teclado do telemóvel completo, com
            // números e com `@`.
            type="text"
            required
            autoComplete="tel email"
            placeholder={textos.contactoPlaceholder}
            aria-describedby={`${id}-contacto-ajuda`}
            className={CAMPO}
          />
          <p id={`${id}-contacto-ajuda`} className="mt-1.5 text-[11px] text-foreground/45">
            {textos.contactoAjuda}
          </p>
        </div>
      </div>

      {/* Campo-armadilha. Fora do ecrã e fora da ordem de tabulação. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {erro && (
        <p role="alert" className="mt-5 text-[13px] text-red-700">
          {erro === "contacto" ? textos.erroContacto : textos.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={aEnviar}
        className="mt-7 w-full bg-moss px-6 py-4 text-[12px] uppercase tracking-[0.28em] text-white transition-colors hover:bg-moss-dark disabled:cursor-not-allowed disabled:opacity-40"
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
