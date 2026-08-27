"use client";

import { useMemo } from "react";
import type { Proposal } from "@/lib/orcamento/types";
import {
  analisar,
  NOME_DO_MOTIVO,
  type AnaliseDeExtras,
} from "@/lib/orcamento/analise-de-propostas";
import { eur0 as eur } from "@/lib/money";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LISTA LEVE (`?semDoc=1`) EM VEZ DA PESADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este painel também não desenha o documento nenhum. Pedia a lista inteira na
 * mesma (chave "propostas"), com todos os mood boards e todos os caminhos de
 * fotos de cada proposta lá dentro. A rota tem uma forma leve para isto
 * (`?semDoc=1`, chave "propostas-leves"), já aquecida em ociosidade pelo
 * AdminClient.
 *
 * `analisar()` (em analise-de-propostas.ts) chama `analisarExtras`, que lê
 * `opcionaisDe(p.doc)` para saber quais aceites tinham extras marcados: a
 * ÚNICA coisa que este painel tirava do documento, para a secção «Os extras
 * vendem-se?». Sem o `doc`, essa chamada ia sempre dar zero. A rota leve já
 * calcula o mesmo facto e chama-lhe `temOpcionais`; `extrasDe`, aqui em baixo,
 * é a mesma conta de `analisarExtras`, só que a partir dele em vez do
 * documento, sem tocar em `analise-de-propostas.ts`, que outras vistas ainda
 * usam com a lista pesada.
 */
type PropostaLeve = Omit<Proposal, "doc"> & { temOpcionais: boolean };

function extrasDe(propostas: PropostaLeve[]): AnaliseDeExtras | null {
  const aceites = propostas.filter((p) => p.status === "aceite");
  const comExtras = aceites.filter((p) => p.temOpcionais);
  if (comExtras.length === 0) return null;

  const levaramExtras = comExtras.filter((p) => p.versaoEscolhida === "extras").length;
  const ficaramNaBase = comExtras.filter((p) => p.versaoEscolhida === "base").length;
  const registadas = levaramExtras + ficaramNaBase;

  return {
    comExtras: comExtras.length,
    levaramExtras,
    ficaramNaBase,
    porRegistar: comExtras.length - registadas,
    taxa: registadas > 0 ? Math.round((levaramExtras / registadas) * 100) : null,
  };
}

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
    <div className="rounded-2xl border border-[var(--bo-hairline)] p-4">
      <p className="text-2xl font-light text-foreground/85">{valor}</p>
      <p className="mt-1 text-[11px] tracking-[0.08em] uppercase text-foreground/45">{rotulo}</p>
      {nota && <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">{nota}</p>}
    </div>
  );
}

export default function AnalisePropostas() {
  const {
    data: propostas,
    loading,
    error,
    errorMessage,
    falha,
    refresh,
  } = useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1");
  const a = useMemo(() => analisar(propostas ?? []), [propostas]);
  // `a.extras` sai sempre `null` a partir da lista leve (não tem `doc` para
  // `analisarExtras` ler); `extrasDe` refaz a mesma conta a partir de
  // `temOpcionais`. Ver a nota no topo do ficheiro.
  const extras = useMemo(() => extrasDe(propostas ?? []), [propostas]);

  // Uma leitura falhada dava `a.enviadas === 0` e este painel desaparecia sem
  // uma palavra — dentro de uma secção chamada "Propostas" que fica aberta e
  // vazia. Lê-se como "ainda não enviaste nenhuma proposta", que é uma resposta
  // à pergunta, e é falsa. Desaparecer em silêncio também é dizer uma coisa.
  if (error && !propostas) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as propostas"
        mensagem={errorMessage}
        /* A falha inteira, e não só a frase: com a sessão caída o «Tentar de
           novo» dá o mesmo 401, e um botão que não pode funcionar é pior do que
           nenhum — quem resolve é o painel de reentrada que aparece por cima. */
        falha={falha}
        aoTentarDeNovo={refresh}
      />
    );
  }

  // A LER não é VAZIO, e não é falha. Sem isto, o instante entre abrir as
  // Estatísticas e a lista chegar era desenhado como «ainda não enviaste
  // nenhuma proposta» — a mesma afirmação de baixo, dita antes de haver
  // resposta.
  if (loading && !propostas) {
    return (
      <p role="status" aria-busy="true" className="bo-text-muted text-sm">
        A ler as propostas…
      </p>
    );
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * DESAPARECER TAMBÉM É DIZER ALGUMA COISA — E DIZIA A COISA ERRADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Isto era `return null`, com a justificação de que «um painel de zeros ensina
   * a não voltar a este ecrã». A intenção continua certa: nenhum destes números
   * assenta em nada com zero propostas enviadas, e quatro travessões em fila
   * não são informação.
   *
   * O que estava errado era o resultado. Este painel vive dentro de uma secção
   * chamada «Propostas» que fica ABERTA de propósito (`defaultOpen` no
   * StatsDashboard): ao desaparecer, deixava um título e um espaço em branco
   * por baixo dele. E um espaço em branco por baixo de um título lê-se de duas
   * maneiras, ambas falsas — «isto avariou» ou «isto ainda não existe». Existe,
   * e está à espera de dados.
   *
   * Continua a não haver um painel de zeros: há uma linha que diz que está
   * vazio, PORQUÊ (a conta precisa de propostas enviadas, e não há nenhuma) e
   * o que começa a enchê-lo. Sem alarme nenhum: um estúdio na primeira semana
   * lê isto e está tudo bem.
   */
  if (a.enviadas === 0) {
    return (
      <p className="bo-text-muted text-sm leading-relaxed">
        Ainda não seguiu nenhuma proposta, por isso não há aqui contas para fazer — o fecho, os
        motivos de recusa e os extras contam-se todos sobre propostas enviadas. A primeira que
        enviares começa a encher este painel.
      </p>
    );
  }

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
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bo-tinta-6)]">
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
      {extras && (
        <section aria-labelledby="extras-titulo">
          <h3
            id="extras-titulo"
            className="mb-2 text-[10px] font-medium tracking-[0.25em] uppercase text-foreground/45"
          >
            Os extras vendem-se?
          </h3>
          <p className="text-sm leading-relaxed text-foreground/70">
            {extras.taxa === null
              ? `${extras.comExtras} ${extras.comExtras === 1 ? "proposta ganha tinha" : "propostas ganhas tinham"} extras, e nenhuma tem a versão registada.`
              : `Das ${extras.levaramExtras + extras.ficaramNaBase} registadas, ${extras.levaramExtras} ${extras.levaramExtras === 1 ? "levou" : "levaram"} os extras — ${extras.taxa}%.`}
          </p>
          {extras.porRegistar > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/45">
              {/* Sem mandar ninguém a lado nenhum: o Acompanhamento saiu do
                  menu a pedido dela, e uma indicação para um ecrã que já não
                  está lá é pior do que indicação nenhuma. O número continua a
                  dizer o que falta. */}
              {extras.porRegistar === 1
                ? "Falta registar uma."
                : `Faltam registar ${extras.porRegistar}.`}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
