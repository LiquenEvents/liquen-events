"use client";

import { useState } from "react";
import type { Quote, QuoteMessage } from "@/lib/orcamento/types";
import { Button, Field } from "./ui";

/**
 * O que a rota disse do ENVIO — não da gravação.
 *
 * São duas coisas diferentes e o mensageiro sabe-o desde que passou a mostrar o
 * `emailError` a vermelho: a mensagem fica SEMPRE registada, o e-mail é que pode
 * não sair (o caso de todos os dias: um pedido que entrou por telefonema e não
 * tem email). Quem escreve o histórico do pedido a partir do `onSent` precisa da
 * mesma distinção — senão regista «enviada» sobre uma que ninguém recebeu.
 */
export interface EnvioDaMensagem {
  /** O e-mail saiu mesmo? */
  emailed: boolean;
  /** A razão que a rota deu quando não saiu (já pronta para se ler). */
  emailError?: string;
}

interface Props {
  quote: Quote;
  onSent?: (messages: QuoteMessage[], envio: EnvioDaMensagem) => void;
}

// Quick-reply templates. {nome} is replaced with the client's first name.
const TEMPLATES: { label: string; text: string }[] = [
  {
    label: "Agradecer pedido",
    text: "Olá {nome},\n\nAgradecemos o seu pedido! Recebemos os detalhes do seu evento e a nossa equipa vai analisá-los com todo o cuidado. Entraremos em contacto em breve com os próximos passos.\n\nCom os melhores cumprimentos,\nEquipa Líquen Events",
  },
  {
    label: "Marcar reunião",
    text: "Olá {nome},\n\nGostaríamos de marcar uma breve conversa para perceber melhor a sua visão para o evento. Tem disponibilidade esta semana? Diga-nos os dias e horas que lhe forem mais convenientes.\n\nAté breve,\nEquipa Líquen Events",
  },
  {
    label: "Seguimento proposta",
    text: "Olá {nome},\n\nQueríamos saber se teve oportunidade de analisar a nossa proposta e se podemos esclarecer alguma questão. Estamos ao dispor para ajustar qualquer detalhe.\n\nCom os melhores cumprimentos,\nEquipa Líquen Events",
  },
];

export default function ClientMessenger({ quote, onSent }: Props) {
  const [messages, setMessages] = useState<QuoteMessage[]>(quote.messages ?? []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = (quote.name || "").trim().split(/\s+/)[0] || "";
  function applyTemplate(tpl: string) {
    setText(tpl.replace(/\{nome\}/g, firstName));
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      const next = data.quote?.messages ?? [...messages, { at: new Date().toISOString(), body }];
      setMessages(next);
      setText("");
      const emailError = typeof data.emailError === "string" ? data.emailError : undefined;
      onSent?.(next, { emailed: !!data.emailed, ...(emailError ? { emailError } : {}) });
      /**
       * O e-mail não ter saído é um ERRO, não um rodapé.
       *
       * Estava em cinzento claro e com uma frase escrita aqui — «e-mail não
       * configurado» —, que na esmagadora maioria dos casos é a razão errada: o
       * que falta é o e-mail DO CLIENTE, num pedido que entrou por telefonema. A
       * rota já calcula a razão certa e manda-a em `emailError`, com o que fazer
       * a seguir dentro dela; deitá-la fora mandava-a procurar uma definição de
       * servidor de correio quando bastava preencher um campo do pedido.
       *
       * A mensagem fica registada de qualquer maneira (é a rota que o garante, e
       * a frase dela di-lo) — o que não pode ficar por dizer é que o cliente não
       * recebeu nada. Mesma decisão do envio da proposta no ProposalStudio.
       */
      if (!data.emailed) {
        setError(
          emailError ||
            "A mensagem ficou registada, mas o e-mail NÃO SAIU — o cliente não recebeu nada.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="bo-eyebrow">Responder ao cliente</p>
        {quote.email && <span className="bo-text-faint text-xs truncate">{quote.email}</span>}
      </div>

      {/* History */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-2 mb-5 max-h-48 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#4d6350]/[0.06] border border-[#4d6350]/15 px-3.5 py-2.5"
            >
              <p className="text-foreground/70 text-xs leading-relaxed whitespace-pre-wrap">
                {m.body}
              </p>
              <p className="text-foreground/40 text-[10px] mt-1.5">
                {new Date(m.at).toLocaleString("pt-PT", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Quick-reply templates */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TEMPLATES.map((t) => (
          <Button
            key={t.label}
            variant="subtle"
            size="sm"
            className="rounded-full"
            onClick={() => applyTemplate(t.text)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Field
        as="textarea"
        label="Mensagem ao cliente"
        hideLabel
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreve a mensagem que será enviada por e-mail ao cliente…"
        className="resize-none"
        containerClassName="mb-3"
      />

      {error && (
        <p className="text-[#8a2a22] text-xs mb-3 leading-relaxed" role="alert">
          {error}
        </p>
      )}

      <Button
        variant="primary"
        fullWidth
        onClick={send}
        loading={sending}
        disabled={!text.trim()}
        iconRight={sending ? undefined : <span aria-hidden="true">→</span>}
      >
        {sending ? "A enviar…" : "Enviar e-mail"}
      </Button>
    </div>
  );
}
