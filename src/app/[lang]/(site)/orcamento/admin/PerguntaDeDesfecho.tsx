"use client";

import { useState } from "react";
import type { MotivoDeRecusa, Quote } from "@/lib/orcamento/types";
import {
  MOTIVOS_DE_PERDA,
  NOME_DO_MOTIVO,
  corpoDaMarcacao,
  corpoDoMotivo,
  desfechoJaMarcado,
  faltaODesfecho,
  valorConfirmado,
  type Desfecho,
} from "@/lib/orcamento/desfecho";
import { eur, randomId } from "./util";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «ELES DISSERAM QUE SIM?» — o gesto de um toque
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ontem saiu o botão que deixava o cliente aceitar a proposta online. A
 * resposta do casal passou a chegar por email, por telefone ou por WhatsApp — e
 * ninguém a marcava em lado nenhum. O pedido ficava eternamente em «Proposta
 * enviada», o «Ganho» da Visão Geral ficava a zero com o dinheiro já na conta,
 * e os números diziam a verdade sobre uma coisa que ninguém lhes tinha contado.
 *
 * Isto é a entrada que faltava, e está DUAS VEZES no caminho dela: no cartão da
 * lista de pedidos e dentro do painel do pedido aberto. Não é um menu, não é um
 * submenu, não é um selector de estado escondido — são duas palavras e dois
 * botões, à frente dela no momento em que se lembra.
 *
 * ── NADA DISTO É VISÍVEL PARA O CLIENTE ───────────────────────────────────
 * É back office. Não há email, não há página, não há aviso do lado de lá. O
 * casal já respondeu por onde lhe apeteceu; isto é só alguém a registá-lo.
 *
 * ── O QUE GRAVA, E POR ONDE ───────────────────────────────────────────────
 * Um PATCH a `/api/orcamento/[id]` com o `status` — exactamente o mesmo caminho
 * que o selector de estado do painel usa. É de propósito: é esse PATCH que
 * semeia o plano de produção ao pôr um pedido em «aceite»
 * (`semearProducaoAoGanhar`), e um segundo caminho «mais directo» seria a
 * maneira de perder essa sementeira sem ninguém ligar a perda ao gesto novo.
 */

/** Como o campo mostra o valor de partida — vazio quando nunca houve preço. */
function textoDoValor(q: Quote): string {
  // `!= null` e não a verdade do valor: um preço de ZERO é um preço escrito, e
  // lido como «sem preço» o campo abria vazio a mentir sobre o que está gravado.
  return q.quotedPrice != null ? String(q.quotedPrice) : "";
}

/** O que se diz de uma gravação recusada, pelo código que voltou. */
function porqueNaoGravou(status: number): string {
  if (status === 401 || status === 403) return "A sessão expirou — volta a entrar.";
  if (status === 400) return "O servidor recusou o valor.";
  if (status === 404) return "Este pedido já não existe.";
  if (status >= 500) return "O servidor não está a aceitar gravações neste momento.";
  return "Não foi possível marcar.";
}

/**
 * O `a-gravar` LEVA O DESFECHO consigo, e não é um detalhe de arrumação: sem
 * ele, gravar um «Perdido» caía no mesmo ramo de desenho do «Ganho» e o campo
 * do valor PISCAVA no ecrã durante a ida ao servidor. Perder um casamento não
 * tem preço nenhum a confirmar, e um campo de dinheiro a aparecer nesse
 * instante é a sugestão de que tem.
 */
type Fase =
  | { tipo: "pergunta" }
  | { tipo: "quanto" }
  | { tipo: "a-gravar"; desfecho: Desfecho }
  | { tipo: "marcado"; desfecho: Desfecho; valor?: number };

interface Props {
  quote: Quote;
  /** Quem está a marcar — vai para o histórico do pedido. */
  quem: string;
  /** O pedido como o servidor o devolveu. Quem recebe actualiza a lista. */
  onGravado: (q: Quote) => void;
  /**
   * `cartao` é a versão apertada, que vive no rodapé de um cartão da lista;
   * `painel` é a que abre o pedido. Só muda o tamanho e o espaçamento — as
   * palavras e o gesto são os mesmos nos dois sítios, de propósito.
   */
  variante?: "cartao" | "painel";
}

export default function PerguntaDeDesfecho({ quote, quem, onGravado, variante = "cartao" }: Props) {
  const [fase, setFase] = useState<Fase>({ tipo: "pergunta" });
  const [escrito, setEscrito] = useState(() => textoDoValor(quote));
  const [aviso, setAviso] = useState<string | null>(null);
  const [notaMotivo, setNotaMotivo] = useState("");
  const [motivoAGravar, setMotivoAGravar] = useState<MotivoDeRecusa | null>(null);
  const [motivoGravado, setMotivoGravado] = useState(false);

  const jaMarcado = fase.tipo === "marcado";
  // A pergunta desaparece assim que deixa de fazer sentido — mas não a meio do
  // próprio gesto: depois de marcar, o `quote` que chega de fora já vem
  // decidido, e sem esta segunda condição o recibo (e o campo do motivo, que é
  // opcional e vem DEPOIS) desapareciam no mesmo instante em que aparecem.
  if (!faltaODesfecho(quote) && !jaMarcado) return null;

  const compacto = variante === "cartao";

  /**
   * ════════════════════════════════════════════════════════════════════════
   * DOIS SEPARADORES ABERTOS NO MESMO PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ela deixa o back office aberto no portátil e abre-o outra vez no telemóvel.
   * O separador da frente marca «Ganho» por 5.000 € (houve negociação); o
   * separador de trás continua a mostrar «Proposta enviada» com os 4.600 € da
   * proposta original, e um toque distraído punha os 4.600 € por cima dos
   * 5.000 € já registados — sem aviso nenhum, e com uma segunda linha no
   * histórico a dizer «Proposta enviada → Ganho» sobre um pedido que já estava
   * ganho.
   *
   * Por isso lê-se o pedido ANTES de escrever. Se já estiver decidido, não se
   * grava nada: diz-se o que lá está e o ecrã acerta-se pelo servidor. A janela
   * de corrida encolhe de HORAS (um separador esquecido) para os milissegundos
   * entre a leitura e a escrita — que é o melhor que se consegue sem uma
   * gravação condicional na rota, que outros ecrãs também usam.
   */
  async function marcar(desfecho: Desfecho, valor?: number) {
    setAviso(null);
    setFase({ tipo: "a-gravar", desfecho });
    try {
      const fresco = await fetch(`/api/orcamento/${quote.id}`, { cache: "no-store" });
      if (fresco.ok) {
        const actual = (await fresco.json()) as Quote;
        const decidido = desfechoJaMarcado(actual);
        if (decidido) {
          setAviso(
            decidido === "ganho"
              ? `Este pedido já tinha sido marcado como ganho${
                  actual.quotedPrice != null ? ` por ${eur(actual.quotedPrice)}` : ""
                } noutro sítio. Não foi alterado.`
              : "Este pedido já tinha sido marcado como perdido noutro sítio. Não foi alterado.",
          );
          setFase({ tipo: "marcado", desfecho: decidido, valor: actual.quotedPrice });
          onGravado(actual);
          return;
        }
      }

      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          corpoDaMarcacao({
            desfecho,
            valor,
            quem,
            quando: new Date().toISOString(),
            id: randomId,
          }),
        ),
      });
      if (!res.ok) {
        setAviso(porqueNaoGravou(res.status));
        // Volta ao ponto onde ela estava, com o número escrito: uma gravação
        // recusada tem de deixar o gesto por fazer E à mão de se repetir.
        setFase(desfecho === "ganho" ? { tipo: "quanto" } : { tipo: "pergunta" });
        return;
      }
      const actualizado = (await res.json()) as Quote;
      setFase({ tipo: "marcado", desfecho, valor });
      onGravado(actualizado);
    } catch {
      setAviso("Não foi possível chegar ao servidor — verifica a ligação.");
      setFase(desfecho === "ganho" ? { tipo: "quanto" } : { tipo: "pergunta" });
    }
  }

  function confirmarGanho() {
    const lido = valorConfirmado(escrito);
    if (!lido.ok) {
      setAviso(lido.porque);
      return;
    }
    void marcar("ganho", lido.valor);
  }

  /**
   * O motivo de perda, gravado sozinho e sem tocar no estado — um dos cinco
   * botões, nunca uma frase escrita à mão. É por AQUI que a contagem de
   * `analise-de-propostas.ts` («perdi seis por preço este ano») deixa de ser
   * uma frase impossível: o botão que se carrega é a mesma lista fechada
   * (`MotivoDeRecusa`) que essa contagem lê — a rota propaga-o para a
   * proposta mais recente do pedido. O detalhe em texto livre, quando há, vai
   * junto no mesmo pedido, e vive à parte (`lostNote`), como já acontece do
   * lado das propostas.
   */
  async function guardarMotivo(motivo: MotivoDeRecusa) {
    setAviso(null);
    setMotivoAGravar(motivo);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoMotivo(motivo, notaMotivo)),
      });
      if (!res.ok) {
        setAviso(porqueNaoGravou(res.status));
        setMotivoAGravar(null);
        return;
      }
      setMotivoGravado(true);
      onGravado((await res.json()) as Quote);
    } catch {
      setAviso("Não foi possível chegar ao servidor — verifica a ligação.");
      setMotivoAGravar(null);
    }
  }

  const botao =
    "alvo-toque rounded-full border px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] uppercase transition-colors motion-reduce:transition-none disabled:opacity-50";
  const previsto = valorConfirmado(escrito);

  return (
    <div
      className={`${compacto ? "mt-3 pt-3 border-t border-foreground/[0.07]" : "rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.04] p-4"}`}
      // O gesto vive dentro de cartões que são eles próprios um botão de abrir.
      // Sem isto, tocar em «Ganho» abria o pedido por baixo da marcação.
      onClick={(e) => e.stopPropagation()}
    >
      {fase.tipo === "marcado" ? (
        <div className="flex flex-col gap-2">
          <p className={`text-[#4d6350] ${compacto ? "text-[11px]" : "text-sm"} font-medium`}>
            {fase.desfecho === "ganho"
              ? `Marcado como ganho${fase.valor != null ? ` — ${eur(fase.valor)}` : ""}.`
              : "Marcado como perdido."}
          </p>
          {/* ── «PERDIDO» NÃO INTERROGA ─────────────────────────────────────
              O negócio já está marcado; o motivo vem DEPOIS, é opcional, e
              nunca trava nada. Quem não quiser escrever fecha o pedido e o
              registo fica igualmente certo. */}
          {fase.desfecho === "perdido" &&
            !quote.lostReason &&
            (motivoGravado ? (
              <p className="text-foreground/45 text-[11px]">Motivo guardado.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-foreground/45 text-[10px] tracking-[0.1em] uppercase">
                  Motivo (opcional)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_DE_PERDA.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => void guardarMotivo(m)}
                      disabled={motivoAGravar !== null}
                      className={`${botao} border-foreground/15 text-foreground/55 hover:border-foreground/30`}
                    >
                      {motivoAGravar === m ? "A guardar…" : NOME_DO_MOTIVO[m]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={notaMotivo}
                  maxLength={300}
                  onChange={(e) => setNotaMotivo(e.target.value)}
                  placeholder="Detalhe opcional…"
                  className="bo-input px-2.5 py-2 text-sm text-foreground/80"
                />
              </div>
            ))}
        </div>
      ) : fase.tipo === "quanto" || (fase.tipo === "a-gravar" && fase.desfecho === "ganho") ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
              <span className="text-foreground/45 text-[10px] tracking-[0.1em] uppercase">
                Valor combinado (sem IVA) €
              </span>
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                value={escrito}
                onChange={(e) => {
                  setEscrito(e.target.value);
                  setAviso(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarGanho();
                  if (e.key === "Escape") setFase({ tipo: "pergunta" });
                }}
                placeholder="Ex.: 4.600"
                className="bo-input px-2.5 py-2 text-sm text-foreground/80"
              />
            </label>
            <button
              type="button"
              onClick={confirmarGanho}
              disabled={fase.tipo === "a-gravar"}
              className={`${botao} border-[#4d6350] bg-[#4d6350] text-white hover:bg-[#3f5343]`}
            >
              {fase.tipo === "a-gravar"
                ? "A marcar…"
                : previsto.ok && previsto.valor > 0
                  ? `Confirmar ${eur(previsto.valor)}`
                  : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEscrito(textoDoValor(quote));
                setAviso(null);
                setFase({ tipo: "pergunta" });
              }}
              className={`${botao} border-transparent text-foreground/45 hover:text-foreground/70`}
            >
              Cancelar
            </button>
          </div>
          {/* O valor que já vem escrito é o da proposta que seguiu. Dizê-lo
              evita a dúvida de onde saiu aquele número — e é a diferença entre
              confirmar e adivinhar. */}
          <p className="text-foreground/40 text-[10px] leading-snug">
            É o valor da proposta enviada. Se houve negociação, corrige aqui — é este que passa a
            contar como ganho.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-foreground/55 ${compacto ? "text-[11px]" : "text-sm"} mr-1`}>
            Já responderam?
          </span>
          <button
            type="button"
            disabled={fase.tipo === "a-gravar"}
            onClick={() => {
              setAviso(null);
              setFase({ tipo: "quanto" });
            }}
            className={`${botao} border-[#4d6350] bg-[#4d6350] text-white hover:bg-[#3f5343]`}
          >
            Ganho
          </button>
          <button
            type="button"
            disabled={fase.tipo === "a-gravar"}
            onClick={() => void marcar("perdido")}
            className={`${botao} border-foreground/15 text-foreground/55 hover:border-foreground/35 hover:text-foreground/80`}
          >
            Perdido
          </button>
        </div>
      )}

      {aviso && (
        <p role="alert" className="mt-2 text-[#b5654a] text-[11px] leading-snug">
          {aviso}
        </p>
      )}
    </div>
  );
}
