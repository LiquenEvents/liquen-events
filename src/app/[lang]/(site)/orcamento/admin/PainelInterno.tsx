"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { custosDe, margemTotal, margensPorLinha } from "@/lib/orcamento/margem";
import { normalizarValor } from "@/lib/proposal-budget";
import {
  PARAMETROS_OMISSAO,
  sugerirDeslocacao,
  type ParametrosDeslocacao,
} from "@/lib/orcamento/deslocacao";
import { foraDoPadrao, padraoPara } from "@/lib/orcamento/padrao-de-preco";
import { Button } from "./ui";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAINEL QUE O CLIENTE NUNCA VÊ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três coisas que só interessam a quem decide se o negócio se faz:
 *
 *   • O CUSTO de cada linha, e a margem que dele sai. O estúdio sabia o que se
 *     cobra e não sabia o que se gasta.
 *   • A DESLOCAÇÃO calculada a partir do local — quilómetros de ida e volta
 *     vezes o custo por quilómetro, com o preço do gasóleo que ela definiu.
 *   • Se o TOTAL está dentro do que ela costuma cobrar para um casamento assim.
 *
 * ── NADA DAQUI ENTRA NO PDF ────────────────────────────────────────────────
 * Os custos vivem em `budgetCosts`, que o desenhador do PDF não lê — e há um
 * teste em `proposal-doc-pdf.test.ts` que compara as instruções de desenho com
 * e sem custos para garantir que continua assim. A única coisa que ATRAVESSA
 * para o lado do cliente é a linha da deslocação, e só quando ela carrega no
 * botão: aí passa a ser um valor adicional como os outros.
 *
 * ── PORQUE É UM PAINEL E NÃO UMA COLUNA NA TABELA DE CIMA ──────────────────
 * A tabela de cima é a que se lê a preparar a proposta para o cliente. Meter
 * lá o custo interno punha o número mais sensível da casa no meio do ecrã que
 * se roda para o lado quando alguém passa — e, com o tempo, num screenshot.
 */

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

interface Props {
  doc: ProposalDoc;
  /** O pedido a que a proposta responde — dá o local e o nº de convidados. */
  quote: Quote;
  /** Todos os pedidos, para o padrão de preço. Vazio = sem comparação. */
  quotes?: Quote[];
  /** O total bruto que a proposta mostra. */
  totalBruto: number;
  onCusto: (i: number, custo: number | null) => void;
  /** Acrescenta a deslocação aos valores adicionais da proposta. */
  onDeslocacao: (label: string, valueText: string) => void;
}

export default function PainelInterno({
  doc,
  quote,
  quotes = [],
  totalBruto,
  onCusto,
  onDeslocacao,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [parametros, setParametros] = useState<ParametrosDeslocacao>(PARAMETROS_OMISSAO);
  const [margemMinima, setMargemMinima] = useState(35);

  // Os números de que a conta depende vivem no servidor (ver
  // proposta-definicoes-store): o preço do gasóleo muda todas as semanas.
  useEffect(() => {
    let vivo = true;
    fetch("/api/proposta-definicoes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return;
        if (j.deslocacao) setParametros(j.deslocacao);
        if (typeof j.margemMinima === "number") setMargemMinima(j.margemMinima);
      })
      .catch(() => {
        // Sem definições gravadas calcula-se com os valores de partida — que é
        // exactamente o que o estado inicial já tem.
      });
    return () => {
      vivo = false;
    };
  }, []);

  const linhas = useMemo(() => margensPorLinha(doc), [doc]);
  const total = useMemo(() => margemTotal(doc), [doc]);
  const custos = useMemo(() => custosDe(doc), [doc]);

  const deslocacao = useMemo(
    () => sugerirDeslocacao(doc.location || quote.location, parametros),
    [doc.location, quote.location, parametros],
  );

  const fora = useMemo(
    () =>
      foraDoPadrao(
        totalBruto,
        padraoPara({ guests: quote.guests, location: quote.location }, quotes),
      ),
    [totalBruto, quote.guests, quote.location, quotes],
  );

  const magra = total !== null && total.percentagem < margemMinima;

  return (
    <div className="mt-5 rounded-2xl border border-foreground/[0.10] bg-foreground/[0.015]">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="alvo-toque !justify-start flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span aria-hidden="true" className="text-foreground/35">
          {aberto ? "▾" : "▸"}
        </span>
        <span className="text-[11px] font-medium tracking-[0.12em] uppercase text-foreground/60">
          Só para si
        </span>
        <span className="text-[11px] text-foreground/40">
          custos, margem, deslocação — nunca sai no PDF
        </span>
        {/* Os dois sinais que valem um olhar mesmo com o painel fechado. */}
        <span className="ml-auto flex items-center gap-1.5">
          {magra && (
            <span className="rounded-full bg-[#b5654a]/15 px-2 py-0.5 text-[10px] tracking-[0.08em] uppercase text-[#8a4632]">
              margem {total!.percentagem}%
            </span>
          )}
          {fora && (
            <span className="rounded-full bg-[#c08a3e]/15 px-2 py-0.5 text-[10px] tracking-[0.08em] uppercase text-[#8a6420]">
              valor fora do habitual
            </span>
          )}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-foreground/[0.08] p-4">
          {/* ── Custo e margem por linha ──────────────────────────────── */}
          {(doc.budgetItems ?? []).length === 0 ? (
            <p className="text-xs text-foreground/45">
              Ainda não há linhas de orçamento a que dar custo.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_5rem] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                <span>Linha</span>
                <span className="text-right">Preço</span>
                <span className="text-right">Custo</span>
                <span className="text-right">Margem</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {(doc.budgetItems ?? []).map((item, i) => {
                  const l = linhas[i];
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_5rem] items-center gap-2"
                    >
                      <span className="truncate text-xs text-foreground/70">
                        {item || <span className="text-foreground/30">(sem nome)</span>}
                      </span>
                      <span className="text-right text-xs text-foreground/55">
                        {l?.preco === null ? "—" : eur(l!.preco!)}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={custos[i] === null ? "" : String(custos[i])}
                        onBlur={(e) => onCusto(i, normalizarValor(e.target.value))}
                        placeholder="—"
                        aria-label={`Custo da linha ${i + 1}`}
                        className="bo-input px-2 py-1.5 text-right text-xs"
                      />
                      <span
                        className={`text-right text-xs ${
                          l?.percentagem === null
                            ? "text-foreground/25"
                            : l!.percentagem! < margemMinima
                              ? "text-[#b5654a]"
                              : "text-foreground/60"
                        }`}
                      >
                        {l?.percentagem === null ? "—" : `${l!.percentagem}%`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {total && (
                <p
                  className={`mt-3 text-xs leading-relaxed ${magra ? "text-[#b5654a]" : "text-foreground/60"}`}
                >
                  Margem de {eur(total.margem)} em {eur(total.precoComparavel)} —{" "}
                  <strong className="font-semibold">{total.percentagem}%</strong>
                  {total.parcial && (
                    <span className="text-foreground/45">
                      {" "}
                      (só {total.linhasComCusto} de {total.linhasTotais} linhas têm custo, por isso
                      é uma margem parcial)
                    </span>
                  )}
                  {magra && (
                    <span className="block mt-0.5">
                      Abaixo dos {margemMinima}% que definiu. Não impede nada.
                    </span>
                  )}
                </p>
              )}
            </>
          )}

          {/* ── Deslocação ───────────────────────────────────────────── */}
          <div className="mt-5 border-t border-foreground/[0.08] pt-4">
            <span className="bo-eyebrow">Deslocação</span>
            {deslocacao === null ? (
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
                Não reconheço o local, por isso não calculo os quilómetros. Escreva a terra no campo
                do local (ex.: &quot;Quinta X, Palmela&quot;) ou ponha o valor à mão nos valores
                adicionais.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-xs leading-relaxed text-foreground/60">
                  <strong className="font-semibold text-foreground/85">
                    {eur(deslocacao.valor)}
                  </strong>{" "}
                  <span className="text-foreground/45">— {deslocacao.formula}</span>
                  {deslocacao.provavelAlojamento && (
                    <span className="block text-[11px] text-[#8a6420]">
                      A esta distância conte com dormir fora. O alojamento cobra-se à parte e não
                      está neste número.
                    </span>
                  )}
                </p>
                {!deslocacao.isento && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onDeslocacao(
                        "Deslocação da equipa Líquen",
                        `${new Intl.NumberFormat("pt-PT", {
                          style: "currency",
                          currency: "EUR",
                          minimumFractionDigits: 2,
                        }).format(deslocacao.valor)} + IVA`,
                      )
                    }
                  >
                    Pôr nos valores adicionais
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── O total está dentro do habitual? ─────────────────────── */}
          {fora && (
            <p className="mt-4 rounded-xl border border-[#c08a3e]/40 bg-[#c08a3e]/[0.06] p-3 text-[11px] leading-relaxed text-[#8a6420]">
              {quote.guests} pax costuma ficar entre {eur(fora.padrao.min)} e {eur(fora.padrao.max)}
              {fora.padrao.regiao ? ` na zona de ${fora.padrao.regiao}` : " (média do país)"}, com
              mediana de {eur(fora.padrao.mediana)} em {fora.padrao.casos} eventos. Esta está{" "}
              {fora.lado === "abaixo" ? "abaixo" : "acima"} — confirme que não é um dígito trocado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
