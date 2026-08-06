"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { diferencas, type Mudanca } from "@/lib/orcamento/diferencas";
import { Button } from "./ui/Button";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE JÁ SE ENVIOU, E O QUE MUDOU DESDE ENTÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma negociação de casamento tem três ou quatro rondas, com semanas pelo meio.
 * Duas perguntas repetem-se, e as duas são de memória: "o que foi que eu lhes
 * mandei?" e "o que é que mudou desde essa?".
 *
 * ── O QUE ESTÁ NO ECRÃ CONTA COMO VERSÃO ───────────────────────────────────
 * A comparação mais útil não é entre dois envios passados: é entre a última que
 * seguiu e a que está aqui por enviar. É a que responde à pergunta que se faz
 * COM O DEDO NO BOTÃO — "o que é que eles vão ver de diferente?" — e por isso
 * vem primeiro, destacada, e não no meio da lista.
 *
 * ── RESTAURAR NÃO ENVIA ────────────────────────────────────────────────────
 * Repor uma versão antiga escreve-a no rascunho e mais nada. Continua a ser
 * preciso passar pelo Enviar, com a conferência pelo meio. Um botão que
 * reenviasse uma proposta de há três semanas por um clique era uma forma nova
 * de mandar o preço errado.
 */

/** Uma versão como a rota a devolve — sem o documento. */
export interface VersaoEnviada {
  id: string;
  enviadaEm: string;
  total: number;
  estado: string;
  mudancas: Mudanca[];
  resumo: string;
}

interface Props {
  quoteId: string;
  /** O que está no ecrã, para comparar com a última enviada. */
  doc: ProposalDoc;
  /** Repõe uma versão antiga no estúdio. */
  onRestaurar: (doc: ProposalDoc) => void;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

const quando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
};

const ESTADO: Record<string, string> = {
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceite: "Aceite",
  rejeitada: "Recusada",
  rascunho: "Rascunho",
};

export default function Versoes({ quoteId, doc, onRestaurar }: Props) {
  const [versoes, setVersoes] = useState<VersaoEnviada[] | null>(null);
  const [erro, setErro] = useState(false);
  const [aRepor, setARepor] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  /** O documento da última enviada, para comparar com o que está no ecrã. */
  const [ultimoDoc, setUltimoDoc] = useState<ProposalDoc | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/orcamento/${quoteId}/versoes`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { versoes?: VersaoEnviada[] };
      setVersoes(data.versoes ?? []);
      setErro(false);
    } catch {
      setErro(true);
      setVersoes([]);
    }
  }, [quoteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ultima = versoes?.[0];
  const ultimaId = ultima?.id;

  // O documento da última enviada vem à parte, e só quando há uma: é o único
  // que é preciso para a comparação de cima, e são 18 KB que não se pedem sem
  // haver com que comparar.
  //
  // O `ultimaId` na lista de dependências, e não o objecto: a rota devolve uma
  // versão nova a cada leitura, e comparar por identidade mandava buscar o
  // mesmo documento outra vez a cada revalidação.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!ultimaId) {
        if (vivo) setUltimoDoc(null);
        return;
      }
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/versoes?doc=${ultimaId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { doc?: ProposalDoc };
        if (vivo && data.doc) setUltimoDoc(data.doc);
      } catch {
        /* a comparação de cima simplesmente não aparece */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quoteId, ultimaId]);

  const porEnviar = useMemo(() => (ultimoDoc ? diferencas(ultimoDoc, doc) : []), [ultimoDoc, doc]);

  const restaurar = useCallback(
    async (id: string) => {
      setARepor(id);
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/versoes?doc=${id}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { doc?: ProposalDoc };
        if (data.doc) onRestaurar(data.doc);
      } catch {
        setErro(true);
      } finally {
        setARepor(null);
      }
    },
    [quoteId, onRestaurar],
  );

  if (versoes === null) return null;

  if (versoes.length === 0) {
    // Sem envios não há histórico, e um painel vazio a dizer "0 versões" é
    // ruído no ecrã de quem está a escrever a primeira.
    return erro ? (
      <p className="mt-5 text-xs text-foreground/50">
        Não foi possível ler o histórico de versões.
      </p>
    ) : null;
  }

  return (
    <section
      aria-labelledby="versoes-titulo"
      className="mt-5 rounded-2xl border border-foreground/12 bg-foreground/[0.015] p-4"
    >
      <h3
        id="versoes-titulo"
        className="text-[11px] font-medium tracking-[0.12em] uppercase text-foreground/70"
      >
        Versões enviadas
      </h3>

      {/* ── O que está no ecrã, comparado com a última que seguiu ─────────── */}
      {ultimoDoc && (
        <div className="mt-3 rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.05] p-3">
          <p className="text-xs font-medium text-foreground/75">
            {porEnviar.length === 0
              ? "Esta versão está igual à última enviada"
              : porEnviar.length === 1
                ? "Uma alteração desde a última enviada"
                : `${porEnviar.length} alterações desde a última enviada`}
          </p>
          {porEnviar.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {porEnviar.map((m, i) => (
                <li key={i} className="text-xs leading-relaxed text-foreground/65">
                  <span className="text-foreground/40">{m.onde} · </span>
                  {m.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── O histórico ───────────────────────────────────────────────────── */}
      <ol className="mt-3 flex flex-col gap-2">
        {versoes.map((v, i) => {
          const numero = versoes.length - i;
          const expandida = aberta === v.id;
          return (
            <li key={v.id} className="rounded-xl border border-foreground/10 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-medium text-foreground/80">
                  {`Versão ${numero} · ${quando(v.enviadaEm)} · ${eur(v.total)}`}
                </span>
                <span className="text-[11px] text-foreground/45">
                  {ESTADO[v.estado] ?? v.estado}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/55">{v.resumo}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {v.mudancas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAberta(expandida ? null : v.id)}
                    aria-expanded={expandida}
                    className="alvo-toque text-[11px] text-foreground/55 underline underline-offset-2 hover:text-foreground/80"
                  >
                    {expandida ? "Esconder o que mudou" : "Ver o que mudou"}
                  </button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => void restaurar(v.id)}
                  disabled={aRepor === v.id}
                  className="alvo-toque text-[11px]"
                >
                  {aRepor === v.id ? "A repor…" : "Repor esta versão"}
                </Button>
              </div>

              {expandida && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2">
                  {v.mudancas.map((m, j) => (
                    <li key={j} className="text-xs leading-relaxed text-foreground/65">
                      <span className="text-foreground/40">{m.onde} · </span>
                      {m.texto}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[11px] leading-relaxed text-foreground/45">
        Repor escreve a versão antiga no rascunho — não envia nada ao cliente.
      </p>
      {erro && <p className="mt-2 text-xs text-[#b5654a]">Alguma coisa falhou. Tente outra vez.</p>}
    </section>
  );
}
