"use client";

import { useMemo } from "react";
import type { Proposal } from "@/lib/orcamento/types";
import { analisar, NOME_DO_MOTIVO } from "@/lib/orcamento/analise-de-propostas";
import { eur0 as eur } from "@/lib/money";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE AS PROPOSTAS DIZEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As estatísticas do lado de cima contam PEDIDOS. Isto conta PROPOSTAS, e
 * responde a outras perguntas — as que se fazem a decidir o que mudar no ano
 * seguinte. A primeira delas é a que fez `lostReason` ser uma lista fechada em
 * vez de texto livre: perdemos por preço quantas vezes?
 *
 * ── CADA NÚMERO TRAZ EM QUANTOS CASOS ASSENTA ──────────────────────────────
 * "40% por preço" a partir de cinco propostas é verdade e não serve para
 * decidir nada. Uma percentagem sozinha não deixa ninguém perceber isso, por
 * isso vai sempre a contagem ao lado.
 */

/** Um número grande com a sua legenda, no tom sóbrio do resto do painel. */
function Numero({ valor, rotulo, nota }: { valor: string; rotulo: string; nota?: string }) {
  return (
    <div className="rounded-2xl border border-foreground/[0.08] p-4">
      <p className="text-2xl font-light text-foreground/85">{valor}</p>
      <p className="mt-1 text-[11px] tracking-[0.08em] uppercase text-foreground/45">{rotulo}</p>
      {nota && <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">{nota}</p>}
    </div>
  );
}

export default function AnalisePropostas() {
  const {
    data: propostas,
    error,
    errorMessage,
    refresh,
  } = useCachedList<Proposal[]>("propostas", "/api/propostas");
  const a = useMemo(() => analisar(propostas ?? []), [propostas]);

  // Uma leitura falhada dava `a.enviadas === 0` e este painel desaparecia sem
  // uma palavra — dentro de uma secção chamada "Propostas" que fica aberta e
  // vazia. Lê-se como "ainda não enviaste nenhuma proposta", que é uma resposta
  // à pergunta, e é falsa. Desaparecer em silêncio também é dizer uma coisa.
  if (error && !propostas) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as propostas"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  // Sem propostas enviadas não há nada a dizer, e um painel de zeros ensina a
  // não voltar a este ecrã.
  if (a.enviadas === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero valor={String(a.enviadas)} rotulo="Propostas enviadas" />
        <Numero
          valor={a.taxaDeFecho === null ? "—" : `${a.taxaDeFecho}%`}
          rotulo="Fecho"
          // Sobre as respondidas: uma proposta de há três dias ainda não é uma
          // derrota, e no denominador fazia a taxa piorar sempre que houvesse
          // trabalho recente.
          nota={`em ${a.respondidas} ${a.respondidas === 1 ? "respondida" : "respondidas"}`}
        />
        <Numero
          valor={a.medianaDeResposta === null ? "—" : `${a.medianaDeResposta}d`}
          rotulo="Até responderem"
          nota="mediana"
        />
        <Numero valor={String(a.semResposta)} rotulo="Ainda sem resposta" />
      </div>

      {(a.valorMedioGanho !== null || a.valorMedioPerdido !== null) && (
        <div className="grid grid-cols-2 gap-3">
          <Numero
            valor={a.valorMedioGanho === null ? "—" : eur(a.valorMedioGanho)}
            rotulo="Proposta ganha, em média"
            nota={`${a.aceites} ${a.aceites === 1 ? "aceite" : "aceites"}`}
          />
          <Numero
            valor={a.valorMedioPerdido === null ? "—" : eur(a.valorMedioPerdido)}
            rotulo="Proposta perdida, em média"
            nota={`${a.recusadas} ${a.recusadas === 1 ? "recusada" : "recusadas"}`}
          />
        </div>
      )}

      {/* ── Porque é que se perdeu ─────────────────────────────────────── */}
      {a.motivos.length > 0 && (
        <section aria-labelledby="motivos-titulo">
          <h3
            id="motivos-titulo"
            className="mb-3 text-[10px] font-medium tracking-[0.25em] uppercase text-foreground/45"
          >
            Porque é que se perdeu
          </h3>
          <ul className="flex flex-col gap-2">
            {a.motivos.map((m) => (
              <li key={m.chave} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-foreground/70">
                  {NOME_DO_MOTIVO[m.chave]}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                  <span
                    className="block h-full rounded-full bg-[#8a6420]/45"
                    style={{ width: `${Math.max(2, m.pct)}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-foreground/55">
                  {`${m.n} · ${m.pct}%`}
                </span>
              </li>
            ))}
          </ul>
          {a.recusadas < 5 && (
            <p className="mt-2 text-[11px] leading-relaxed text-foreground/40">
              São {a.recusadas} recusas ao todo — poucas para se tirar conclusão nenhuma. A contagem
              fica a somar.
            </p>
          )}
        </section>
      )}

      {/* ── Os extras vendem-se? ───────────────────────────────────────── */}
      {a.extras && (
        <section aria-labelledby="extras-titulo">
          <h3
            id="extras-titulo"
            className="mb-2 text-[10px] font-medium tracking-[0.25em] uppercase text-foreground/45"
          >
            Os extras vendem-se?
          </h3>
          <p className="text-sm leading-relaxed text-foreground/70">
            {a.extras.taxa === null
              ? `${a.extras.comExtras} ${a.extras.comExtras === 1 ? "proposta ganha tinha" : "propostas ganhas tinham"} extras, e nenhuma tem a versão registada.`
              : `Das ${a.extras.levaramExtras + a.extras.ficaramNaBase} registadas, ${a.extras.levaramExtras} ${a.extras.levaramExtras === 1 ? "levou" : "levaram"} os extras — ${a.extras.taxa}%.`}
          </p>
          {a.extras.porRegistar > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/45">
              {/* Sem mandar ninguém a lado nenhum: o Acompanhamento saiu do
                  menu a pedido dela, e uma indicação para um ecrã que já não
                  está lá é pior do que indicação nenhuma. O número continua a
                  dizer o que falta. */}
              {a.extras.porRegistar === 1
                ? "Falta registar uma."
                : `Faltam registar ${a.extras.porRegistar}.`}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
