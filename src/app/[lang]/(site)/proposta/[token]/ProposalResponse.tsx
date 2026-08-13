"use client";

import { useEffect, useRef, useState } from "react";
import type { ProposalStatus } from "@/lib/orcamento/types";
import type { Dict } from "@/lib/i18n";
// Value-imported: DEFAULT_TERMS lives in a client-safe module (no server-only /
// repository / fs), so shipping it to the browser is safe and doesn't drag the
// contracts store into the client bundle.
import { termosPara } from "@/lib/contract-terms";
import type { Contract } from "@/lib/contract-types";
// O email PARA ONDE SE ESCREVE é o do estúdio — o mesmo do rodapé desta página.
// Aqui mostrava-se o `clientEmail`, que é o email de quem está a ler: a
// proposta expirada e a falha ao responder mandavam o casal escrever a si
// próprio, e o único caminho de recurso da página não ia dar a lado nenhum.
import { SITE } from "@/lib/site";

interface Props {
  token: string;
  initialStatus: ProposalStatus;
  // Server-computed: the proposal's validity date has passed. When true (and the
  // client hasn't already responded), we replace the accept/decline form with an
  // "expired" notice so they never click Accept only to hit the API's 410.
  expired?: boolean;
  // Passed in from the server page instead of the site-wide chrome context, so
  // the proposta namespace only ships on this token route.
  proposta: Dict["proposta"];
  /**
   * A percentagem do sinal DESTA proposta.
   *
   * Os termos diziam «30%» à letra enquanto a factura do sinal é emitida sobre
   * a percentagem da proposta. Numa proposta a 50%, o casal lia e aceitava um
   * contrato a dizer 30% e recebia a seguir uma factura de 50%. É este o texto
   * que ele aceita — tem de ser o mesmo que o servidor congela.
   */
  percentagemDoSinal?: number;
}

export default function ProposalResponse({
  token,
  initialStatus,
  expired = false,
  proposta,
  percentagemDoSinal,
}: Props) {
  const tp = proposta.response;
  const decided = initialStatus === "aceite" || initialStatus === "rejeitada";
  const [status, setStatus] = useState<"aceite" | "rejeitada" | null>(
    initialStatus === "aceite" ? "aceite" : initialStatus === "rejeitada" ? "rejeitada" : null,
  );
  // «Isto já cá estava.» Começa verdadeiro quando a decisão veio do servidor no
  // primeiro render, e passa a verdadeiro quando a rota responde `already` — o
  // mesmo link aberto noutro telemóvel, ou o segundo clique do mesmo dedo.
  const [already, setAlready] = useState(decided);
  const [sending, setSending] = useState<"aceitar" | "recusar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * O FOCO DEPOIS DE DECIDIR.
   *
   * Ao responder, o formulário é DESMONTADO e substituído por este painel — o
   * botão que tinha o foco desaparece com ele e o foco cai no `<body>`. Quem
   * navega por teclado ou com um leitor de ecrã ficava atirado para o topo do
   * documento sem nada lhe ser dito; e um `role="status"` que é inserido já com
   * o conteúdo lá dentro (região e texto ao mesmo tempo) não é anunciado de
   * forma fiável. Levar o foco ao painel resolve as duas coisas.
   *
   * Só quando a decisão foi tomada NESTA visita: numa proposta que já vem
   * decidida do servidor, o painel está visível de início e roubar-lhe o foco
   * saltava por cima da proposta inteira sem eles terem feito nada.
   */
  const painelRef = useRef<HTMLDivElement>(null);
  const [justDecided, setJustDecided] = useState(false);
  useEffect(() => {
    if (justDecided) painelRef.current?.focus();
  }, [justDecided]);
  // Terms agreement — required to accept (not to decline). `acceptedName` is the
  // signature recorded in the contract; typed as the Contract field it feeds.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedName, setAcceptedName] = useState<NonNullable<Contract["acceptedName"]>>("");
  const tt = proposta.terms;
  const canAccept = acceptedTerms && acceptedName.trim().length > 0;

  async function respond(action: "aceitar" | "recusar") {
    if (sending) return;
    // Guard the commitment in code too (the button is only aria-disabled): no
    // accept without an explicit terms agreement + a name.
    if (action === "aceitar" && !canAccept) {
      setError(tt.missing);
      return;
    }
    // Both consequential actions confirm — accepting is a commitment, so it
    // must be at least as guarded as declining (WCAG 3.3.4 Error Prevention).
    if (action === "recusar" && !window.confirm(tp.confirmRecusar)) return;
    if (action === "aceitar" && !window.confirm(tp.confirmAceitar)) return;
    setSending(action);
    setError(null);
    // Abort a hung request instead of spinning "A aceitar…" forever on a stalled
    // connection. This is a client COMMITMENT (accept/decline a proposal), so a
    // silent infinite spinner is the worst failure mode — mirror the quote
    // form's guard so the visitor gets an error + a way to reach us.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the accept flow carries the terms agreement + signature.
        body: JSON.stringify(
          action === "aceitar"
            ? { token, action, acceptedTerms: true, acceptedName: acceptedName.trim() }
            : { token, action },
        ),
        signal: controller.signal,
      });
      const data: { status?: unknown; already?: unknown; error?: unknown } | null = await res
        .json()
        .catch(() => null);
      if (!res.ok) {
        // Só a frase que o SERVIDOR escreveu é que se mostra aqui: essa é sobre
        // a proposta e está na língua da página. Sem corpo legível fica a frase
        // da casa — nunca o texto cru do erro (ver o `catch`).
        setError(typeof data?.error === "string" && data.error ? data.error : tp.errorFallback);
        return;
      }
      /**
       * `res.ok` QUER DIZER QUE FICOU REGISTADO.
       *
       * `data.status` era lido sem guarda nenhuma logo a seguir a um
       * `res.json().catch(() => null)` — bastava o corpo vir ilegível (um proxy
       * a truncar, uma resposta que não é JSON) para rebentar ali um TypeError,
       * cair no `catch` e o casal ver «falhou» depois de o servidor ter gravado
       * o aceite, criado o contrato e emitido o sinal. Se o corpo não se lê,
       * confirmamos na mesma o que eles acabaram de fazer.
       */
      setStatus(
        data?.status === "aceite" || data?.status === "rejeitada"
          ? data.status
          : action === "aceitar"
            ? "aceite"
            : "rejeitada",
      );
      // A rota é idempotente e diz-nos quando a resposta já lá estava. Sem isto,
      // quem carregasse em «Recusar» depois de o outro telemóvel já ter aceite
      // via o ecrã inteiro de festa e ficava a pensar que tinha sido ele.
      if (data?.already === true) setAlready(true);
      setJustDecided(true);
    } catch {
      // Aqui só chegam falhas do próprio `fetch`: rede que caiu, pedido
      // abortado pelo tempo-limite. A mensagem desses erros é do browser
      // («Failed to fetch»), em inglês e sobre XHR — não é uma frase para quem
      // está a decidir gastar milhares de euros. Fica a da casa.
      setError(tp.errorGeneric);
    } finally {
      clearTimeout(timeout);
      setSending(null);
    }
  }

  if (status) {
    return (
      <div
        ref={painelRef}
        role="status"
        tabIndex={-1}
        className={`mt-9 rounded-lg border p-6 text-center ${
          status === "aceite"
            ? "border-moss/30 bg-moss/8"
            : "border-foreground/12 bg-foreground/[0.03]"
        }`}
      >
        {status === "aceite" ? (
          <>
            <div className="w-12 h-12 rounded-full bg-moss/15 border border-moss/30 text-moss flex items-center justify-center text-2xl mx-auto mb-4">
              ✓
            </div>
            <p
              className="text-foreground/85 font-bold uppercase tracking-display mb-2"
              style={{ fontSize: "clamp(20px, 3vw, 26px)" }}
            >
              {tp.aceiteTitle}
            </p>
            <p className="text-foreground/72 text-sm leading-relaxed">{tp.aceiteBody}</p>
          </>
        ) : (
          <>
            <p
              className="text-foreground/80 font-bold uppercase tracking-display mb-2"
              style={{ fontSize: "clamp(19px, 3vw, 24px)" }}
            >
              {tp.rejeitadaTitle}
            </p>
            <p className="text-foreground/72 text-sm leading-relaxed">{tp.rejeitadaBody}</p>
          </>
        )}
        {already && <p className="text-foreground/68 text-[11px] mt-4">{tp.jaRegistado}</p>}
      </div>
    );
  }

  // Validity date passed and no decision was recorded: show a clear notice with a
  // way to reach us, instead of an accept form that the API would reject (410).
  if (expired) {
    return (
      <div
        role="status"
        className="mt-9 rounded-lg border border-foreground/12 bg-foreground/[0.03] p-6 text-center"
      >
        <p
          className="text-foreground/80 font-bold uppercase tracking-display mb-2"
          style={{ fontSize: "clamp(19px, 3vw, 24px)" }}
        >
          {tp.expiradaTitle}
        </p>
        <p className="text-foreground/72 text-sm leading-relaxed">{tp.expiradaBody}</p>
        <a
          href={`mailto:${SITE.email}`}
          className="inline-block mt-5 text-moss text-xs tracking-[0.2em] uppercase hover:underline"
        >
          {SITE.email}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-9">
      {/* Termos & Condições — required to accept. Native <details> so the
          expand/collapse is keyboard-operable and needs no JS or animation
          (respects reduced-motion by construction). The sections scroll within a
          bounded region so a long contract never pushes the actions off-screen. */}
      <details className="mb-5 rounded-lg border border-foreground/12 bg-surface-raised/30 overflow-hidden">
        <summary className="cursor-pointer list-none px-5 py-3.5 text-foreground/78 text-xs tracking-[0.16em] uppercase select-none hover:text-foreground/90 transition-colors">
          {tt.toggle}
        </summary>
        <div className="max-h-64 overflow-y-auto px-5 pb-5 pt-1 border-t border-foreground/8">
          {termosPara(percentagemDoSinal).map((s) => (
            <div key={s.heading} className="mt-4 first:mt-3">
              <h3 className="text-foreground/82 text-[13px] font-semibold mb-1">{s.heading}</h3>
              <p className="text-foreground/68 text-[13px] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </details>

      <label className="flex items-start gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-moss"
        />
        <span className="text-foreground/78 text-sm leading-relaxed">{tt.checkboxLabel}</span>
      </label>

      <div className="mb-6">
        <label
          htmlFor="acceptedName"
          className="block text-foreground/72 text-[11px] tracking-[0.16em] uppercase mb-1.5"
        >
          {tt.nameLabel}
        </label>
        <input
          id="acceptedName"
          type="text"
          autoComplete="name"
          value={acceptedName}
          onChange={(e) => setAcceptedName(e.target.value)}
          placeholder={tt.namePlaceholder}
          className="w-full rounded-md border border-foreground/15 bg-surface px-4 py-3 text-sm text-foreground/85 placeholder:text-foreground/40 focus:border-moss/60 focus:outline-none transition-colors"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* aria-disabled (not the native `disabled` attribute): a real `disabled`
            flipped mid-request yanks focus off the button to <body>; the respond()
            handler already no-ops while `sending`, so the button stays focusable
            and operable-but-inert. (Mirrors OrcamentoForm's submit.) The accept
            button is also inert until the terms + name are provided. */}
        <button
          onClick={() => respond("aceitar")}
          aria-disabled={!!sending || !canAccept}
          className="flex-1 py-4 rounded-md bg-moss text-white text-xs tracking-[0.2em] uppercase font-medium hover:bg-moss-dark transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        >
          {sending === "aceitar" ? tp.aceitarSending : tp.aceitar}
        </button>
        <button
          onClick={() => respond("recusar")}
          aria-disabled={!!sending}
          className="sm:w-auto px-6 py-4 rounded-md border border-foreground/15 text-foreground/72 text-xs tracking-[0.2em] uppercase hover:border-foreground/30 hover:text-foreground/65 transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        >
          {sending === "recusar" ? tp.recusarSending : tp.recusar}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[#a04a2f] text-xs mt-3 text-center">
          {error} {tp.errorSuffix}{" "}
          <a href={`mailto:${SITE.email}`} className="underline">
            {tp.errorLink}
          </a>
          .
        </p>
      )}
    </div>
  );
}
