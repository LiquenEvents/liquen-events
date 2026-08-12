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
import { chaveDoServico, type Historico, type Omissao } from "@/lib/orcamento/memoria-de-precos";
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
 *   • O que JÁ COBROU por cada linha em eventos parecidos, e o que costuma
 *     incluir e falta aqui.
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
  const [memoria, setMemoria] = useState<{ historico: Historico[]; habituais: Omissao[] } | null>(
    null,
  );

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

  // A memória de preços. Vem do servidor porque a conta atravessa TODAS as
  // propostas já enviadas — mandá-las para cá eram três megabytes de números de
  // outros clientes por causa de uma sugestão. Lê-se uma vez por pedido: o que
  // já foi cobrado não muda enquanto se escreve.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamento/${quote.id}/memoria`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j) setMemoria({ historico: j.historico ?? [], habituais: j.habituais ?? [] });
      })
      .catch(() => {
        // Sem memória o painel é o que era. Não se avisa: não haver histórico
        // é o estado normal de quem começou agora.
      });
    return () => {
      vivo = false;
    };
  }, [quote.id]);

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

  /** O histórico ao alcance do nome de cada linha. */
  const porChave = useMemo(() => {
    const m = new Map<string, Historico>();
    for (const h of memoria?.historico ?? []) m.set(chaveDoServico(h.nome), h);
    return m;
  }, [memoria]);

  /**
   * O que costuma incluir e NÃO está nesta proposta.
   *
   * A filtragem é aqui e não no servidor porque o que conta é o rascunho que
   * está no ecrã — por gravar, e a mudar a cada linha escrita.
   */
  const esquecidos = useMemo(() => {
    const presentes = new Set(
      (doc.budgetItems ?? []).map((i) => chaveDoServico(i ?? "")).filter(Boolean),
    );
    // Os serviços também podem estar escritos como serviço e não como linha de
    // orçamento — avisar sobre um que está ali em cima, escrito, seria dar-lhe
    // razão para deixar de ler os avisos.
    for (const g of doc.serviceGroups ?? [])
      for (const it of g.items ?? []) {
        const c = chaveDoServico(it.label ?? "");
        if (c) presentes.add(c);
      }
    return (memoria?.habituais ?? []).filter((o) => !presentes.has(chaveDoServico(o.nome)));
  }, [memoria, doc.budgetItems, doc.serviceGroups]);

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
          Só para ti
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
                  const h = porChave.get(chaveDoServico(item ?? ""));
                  return (
                    <div key={i}>
                      <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_5rem] items-center gap-2">
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
                      {/* ── O QUE JÁ COBROU POR ISTO ─────────────────────
                        Debaixo da linha e não numa coluna: é uma frase, e
                        uma frase espremida em 5rem não se lê. Não escreve
                        preço nenhum — mostra o que houve e ela decide. Um
                        preço posto automaticamente seria a última vez que
                        alguém pensava naquele número. */}
                      {h && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/40">
                          {`Já cobrou entre ${eur(h.min)} e ${eur(h.max)}, mediana ${eur(
                            h.mediana,
                          )}, em ${h.casos} ${h.casos === 1 ? "proposta" : "propostas"}${
                            h.regiao ? ` na zona de ${h.regiao}` : " (média do país)"
                          }`}
                        </p>
                      )}
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

          {/* ── O QUE COSTUMA INCLUIR E AQUI FALTA ────────────────────
              Responde à pergunta que só se faz tarde de mais: "esqueci-me de
              alguma coisa?". Só nomeia o que entra na grande maioria das
              propostas comparáveis — um serviço que entra em metade delas não é
              um esquecimento, é uma escolha, e avisar sobre ele ensinava-a a
              ignorar o aviso. */}
          {esquecidos.length > 0 && (
            <div className="mt-5 border-t border-foreground/[0.08] pt-4">
              <span className="bo-eyebrow">Costuma incluir</span>
              <ul className="mt-1.5 flex flex-col gap-1">
                {esquecidos.map((o) => (
                  <li key={o.nome} className="text-xs leading-relaxed text-foreground/55">
                    <span className="text-foreground/75">{o.nome}</span>
                    <span className="text-foreground/40">{` — em ${o.em} de ${o.de} propostas parecidas`}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/40">
                Pode ser de propósito. Fica aqui só para não ser por esquecimento.
              </p>
            </div>
          )}

          {/* ── Deslocação ───────────────────────────────────────────── */}
          <div className="mt-5 border-t border-foreground/[0.08] pt-4">
            <span className="bo-eyebrow">Deslocação</span>
            {deslocacao === null ? (
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
                Não reconheço o local, por isso não calculo os quilómetros. Escreve a terra no campo
                do local (ex.: &quot;Quinta X, Palmela&quot;) ou põe o valor à mão nos valores
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
              {fora.lado === "abaixo" ? "abaixo" : "acima"} — confirma que não é um dígito trocado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
