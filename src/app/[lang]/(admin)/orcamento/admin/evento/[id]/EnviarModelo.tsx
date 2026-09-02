"use client";

import { useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { Button, EmCurso } from "../../ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS MODELOS QUE SÓ SAEM QUANDO ELA MANDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã «Modelos de email» dizia que estes três eram enviados sozinhos —
 * quando o sinal entra, na semana anterior, depois do evento. Não eram
 * enviados de todo. Isto é o que passam a ter, e é de propósito menos do que a
 * promessa antiga: um botão.
 *
 * ── PORQUE É AQUI, NO DOSSIER, E NÃO NA GAVETA DO PEDIDO ──────────────────
 *
 * Os três momentos são de um EVENTO, não de um lead. O sinal recebido, a
 * semana que falta e o agradecimento acontecem todos depois de o negócio estar
 * fechado — e é o Dossier que tem o que eles precisam de dizer: os pagamentos
 * (é de lá que sai o valor do sinal), a data, o local, o portal do cliente. A
 * gaveta do pedido serve o antes: responder, orçamentar, propor.
 *
 * E fica nesta zona, a de Comunicação, ao lado do estúdio de propostas e do
 * mensageiro: é o sítio para onde ela já olha quando quer falar com o cliente.
 * Um quarto sítio de onde sai correio seria um sítio que se esquece.
 *
 * ── DOIS GESTOS, SEMPRE ───────────────────────────────────────────────────
 *
 * Escolher o modelo só PRÉ-VISUALIZA (o servidor não envia sem `enviar:true`),
 * e a confirmação mostra o DESTINATÁRIO, o assunto e o texto exacto. Um email
 * a um cliente não se desfaz — e a maioria dos enganos que valem a pena evitar
 * é «carreguei no evento errado».
 */

/** O que a rota respondeu sobre o ENVIO — a mesma distinção do mensageiro. */
export interface EnvioDoModelo {
  emailed: boolean;
  emailError?: string;
}

/**
 * Os modelos que se podem enviar daqui, com o nome que o ecrã «Modelos de
 * email» lhes dá — para ela reconhecer, na lista de lá, o que carregou aqui.
 *
 * O «Proposta enviada» NÃO está aqui, e não é esquecimento: esse é o corpo do
 * email que leva a proposta, com o link de aceitação e o PDF em anexo, e sai
 * sozinho pelo Estúdio. A rota recusa-o pelo nome, com a razão escrita.
 */
const MODELOS: { chave: string; nome: string; quando: string }[] = [
  {
    chave: "sinal-recebido",
    nome: "Sinal recebido",
    quando: "quando o sinal entra e a data fica reservada",
  },
  {
    chave: "semana-evento",
    nome: "Falta uma semana",
    quando: "na semana anterior ao evento",
  },
  {
    chave: "agradecimento",
    nome: "Agradecimento pós-evento",
    quando: "depois do evento",
  },
];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA O ENVIO — um palpite, e assumido como tal
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É UM PEDIDO SÓ (`POST …/modelo` com `enviar:true`), e por isso é a espera
 * OPACA: não há nada para contar entre a ida e a volta. Daí `estimadoMs`.
 *
 * O número não vem de medição nenhuma — não há aqui amostras guardadas como as
 * do Estúdio tem para os PDF. Vem do que a operação É: um handshake com o SMTP,
 * a mensagem com a assinatura da Líquen em anexo, e a volta. Anda pelos 3 a 10
 * segundos, e o meio disso são 6.
 *
 * Errar por baixo custa pouco: a barra abranda e nunca chega ao fim sozinha, e
 * ao dobro do estimado a `notaDemorada` diz o que interessa. Errar por cima é
 * que era mau — uma barra quase parada durante um envio que já acabou.
 */
const MS_DO_ENVIO = 6_000;

interface Previsao {
  chave: string;
  nome: string;
  destinatario: string;
  assunto: string;
  texto: string;
}

interface Props {
  quote: Quote;
  /** Chamado depois de o servidor responder ao ENVIO — nunca à pré-visualização. */
  onEnviado?: (nomeDoModelo: string, envio: EnvioDoModelo) => void;
}

export default function EnviarModelo({ quote, onEnviado }: Props) {
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [aPreparar, setAPreparar] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  async function prever(modelo: (typeof MODELOS)[number]) {
    if (aPreparar || aEnviar) return;
    setAPreparar(modelo.chave);
    setErro(null);
    setFeito(null);
    setPrevisao(null);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/modelo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sem `enviar`: o servidor pré-visualiza. É o caminho por omissão dos
        // dois lados, para que um engano nunca acabe num email.
        body: JSON.stringify({ chave: modelo.chave }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível preparar o email.");
      // A recusa por marcador em falta vem em `ok: false` com a frase pronta:
      // é ela que diz qual é o dado e onde o preencher. Não se reescreve aqui.
      if (!data.ok) {
        setErro(String(data.motivo || "Este modelo não pode ser enviado para este pedido."));
        return;
      }
      setPrevisao({
        chave: modelo.chave,
        nome: modelo.nome,
        destinatario: String(data.destinatario || ""),
        assunto: String(data.assunto || ""),
        texto: String(data.texto || ""),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível preparar o email.");
    } finally {
      setAPreparar(null);
    }
  }

  async function enviar() {
    if (!previsao || aEnviar) return;
    setAEnviar(true);
    setErro(null);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/modelo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: previsao.chave, enviar: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar o email.");
      const emailError = typeof data.emailError === "string" ? data.emailError : undefined;
      const envio: EnvioDoModelo = {
        emailed: !!data.emailed,
        ...(emailError ? { emailError } : {}),
      };
      onEnviado?.(previsao.nome, envio);
      setPrevisao(null);
      /**
       * O e-mail não ter saído é um ERRO, não um rodapé — a mesma decisão do
       * mensageiro. O caso de todos os dias é o pedido que entrou por
       * telefonema e não tem endereço; a razão certa vem do servidor, com o
       * que fazer a seguir lá dentro.
       */
      if (!envio.emailed) {
        setErro(
          envio.emailError ||
            "O e-mail NÃO SAIU — o cliente não recebeu nada. Verifica o email do pedido.",
        );
      } else {
        setFeito(`«${previsao.nome}» enviado para ${previsao.destinatario}.`);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o email.");
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <div className="border-t border-[var(--bo-hairline-strong)] pt-5">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="bo-eyebrow">Enviar um modelo</p>
        {quote.email && <span className="bo-text-faint text-xs truncate">{quote.email}</span>}
      </div>
      {/* A frase diz o que o botão faz E o que ele NÃO faz. Um ecrã que já
          prometeu envios automáticos que não existiam não pode voltar a deixar
          isso por dizer. */}
      <p className="text-[11px] text-foreground/40 mb-3 leading-relaxed">
        {/* ── E A FRASE DEIXOU DE MANDAR NINGUÉM A UM SÍTIO SEM PORTA ────────
            Dizia «O texto edita-se em "Modelos de email"». Uma auditoria em
            produção deu por isso: procurou a secção no menu e em Definições, e
            não a encontrou.

            E não é que o ecrã não exista — existe, e funciona. Está ESCONDIDO,
            a pedido dela (ver a lista dos escondidos em `nav.tsx`). Mas o
            `modelos-email` também não está no `NAV`, e é dele que saem o menu
            «Mais» e a paleta ⌘K: nada no back office lá chega.

            Não se corrige revelando o ecrã — quem o mandou esconder foi ela, e
            desfazer isso por causa de uma frase era decidir por ela. Corrige-se
            tirando a promessa: uma instrução para um sítio inalcançável é pior
            do que não haver instrução nenhuma, porque manda procurar. O que a
            frase tem de dizer — que nenhum destes emails sai sozinho — fica. */}
        Nenhum destes emails sai sozinho. Escolhe um para veres o texto e o destinatário; só depois
        de confirmares é que segue.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {MODELOS.map((m) => (
          <Button
            key={m.chave}
            variant="subtle"
            size="sm"
            className="rounded-full"
            title={`Enviado por ti, ${m.quando}`}
            loading={aPreparar === m.chave}
            disabled={aEnviar || (aPreparar !== null && aPreparar !== m.chave)}
            onClick={() => prever(m)}
          >
            {m.nome}
          </Button>
        ))}
      </div>

      {previsao && (
        <div className="rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-3.5 mb-3">
          <dl className="text-xs mb-2.5">
            <div className="flex gap-2">
              <dt className="text-foreground/40 w-16 shrink-0">Para</dt>
              <dd className="text-foreground/75 truncate">
                {previsao.destinatario || (
                  <span className="text-[#8a2a22]">este pedido não tem email</span>
                )}
              </dd>
            </div>
            <div className="flex gap-2 mt-1">
              <dt className="text-foreground/40 w-16 shrink-0">Assunto</dt>
              <dd className="text-foreground/75">{previsao.assunto}</dd>
            </div>
          </dl>
          <p className="text-foreground/60 text-xs leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
            {previsao.texto}
          </p>
          <p className="text-[11px] text-foreground/35 mt-2 leading-relaxed">
            A assinatura da Líquen (Catarina Gaspar, contactos, logótipo) entra sozinha no fim.
          </p>
          {/* ── ENQUANTO ESTÁ A IR ─────────────────────────────────────────
              Um email a um cliente não se desfaz, e este sai várias vezes por
              evento. O que havia era o botão a rodar durante os 3 a 10 segundos
              do SMTP — e o «Cancelar» ao lado, aceso, a convidar a carregar
              outra vez. Os dois saem e fica o que está a acontecer, para quem,
              e nunca «enviado»: isso diz-o a resposta, quando chegar. */}
          {aEnviar ? (
            <EmCurso
              className="mt-3"
              titulo={`A enviar «${previsao.nome}»…`}
              estimadoMs={MS_DO_ENVIO}
              nota={
                previsao.destinatario
                  ? `O email vai para ${previsao.destinatario}.`
                  : "O email está a ser entregue ao servidor."
              }
              notaDemorada="Com rede fraca demora — não feches o separador nem voltes a carregar."
            />
          ) : (
            <div className="flex gap-2 mt-3">
              <Button variant="primary" size="sm" onClick={enviar}>
                Enviar ao cliente
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPrevisao(null);
                  setErro(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}

      {erro && (
        <p className="text-[#8a2a22] text-xs mb-1 leading-relaxed" role="alert">
          {erro}
        </p>
      )}
      {feito && (
        <p className="text-foreground/45 text-xs mb-1 leading-relaxed" role="status">
          {feito}
        </p>
      )}
    </div>
  );
}
