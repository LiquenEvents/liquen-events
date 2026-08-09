"use client";

import { useCallback, useMemo, useState, useEffect, useRef, memo } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import Reminders from "./Reminders";
import Agenda from "./Agenda";
import { eur0 as eur } from "@/lib/money";
import { metaFor } from "./status-meta";

// Memoised so editing the revenue goal or the team notes (local Overview state)
// doesn't re-render these two heavier panels every keystroke — their props
// (quotes, onOpen) don't change during that typing, so memo lets them bail out.
const MemoReminders = memo(Reminders);
const MemoAgenda = memo(Agenda);

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Novo", color: "#8a8a82" },
  em_revisao: { label: "Aguardar resposta", color: "#9aa36a" },
  cotado: { label: "Proposta enviada", color: "#7c854b" },
  aceite: { label: "Ganho", color: "#525a2f" },
  rejeitado: { label: "Perdido", color: "#5a5a55" },
};

// Order the pipeline reads as a funnel: new leads → qualified → quoted → won.
const FUNNEL: { id: QuoteStatus; label: string }[] = [
  { id: "pendente", label: "Novo" },
  { id: "em_revisao", label: "Aguardar resposta" },
  { id: "cotado", label: "Proposta enviada" },
  { id: "aceite", label: "Ganho" },
];

// Shared keyboard focus ring — moss on the white back-office surface. Kept in one
// place so every interactive card/button in the dashboard picks up the same
// visible focus state (WCAG 2.4.7).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#637a5f]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 36e5;
  if (h < 1) return `há ${Math.max(1, Math.round(diff / 6e4))}min`;
  if (h < 24) return `há ${Math.round(h)}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d}d`;
}

/** A small ▲/▼ delta pill comparing this month to last. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return null;
  const up = now >= prev;
  const pct = prev === 0 ? 100 : Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return null;
  return (
    <span
      aria-label={`${up ? "a subir" : "a descer"} ${Math.abs(pct)}% face ao mês anterior`}
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
        up ? "text-[#8aad85]" : "text-[#c08457]"
      }`}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        {up ? (
          <path
            d="M6 9.5V2.5M6 2.5L2.5 6M6 2.5L9.5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M6 2.5V9.5M6 9.5L2.5 6M6 9.5L9.5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {Math.abs(pct)}%
    </span>
  );
}

/**
 * ── Meta de receita e Notas da equipa: gravadas NO SERVIDOR ───────────────
 *
 * Antes viviam as duas no `localStorage`. O ecrã dizia "Notas partilhadas com
 * a equipa" e "Guardado automaticamente" e as duas frases eram falsas: o texto
 * ficava no browser daquele computador, não aparecia no telemóvel dela e
 * desaparecia com o histórico — sem aviso nenhum. Agora vão para
 * `/api/visao-geral`, como qualquer outro dado do back office.
 *
 * Continuam em componentes próprios, com `memo()`, pelo mesmo motivo de
 * sempre: o que se escreve é estado DELES, por isso escrever não volta a
 * desenhar o painel inteiro (os cinco KPI, o funil, o pulso financeiro,
 * "Precisam de atenção", "Atividade recente").
 */
const OVERVIEW_API = "/api/visao-geral";

type CampoId = "notas" | "meta";

interface Campo {
  id: CampoId;
  value: string;
  /** Sobe a cada gravação aceite; é sobre ela que o servidor faz compare-and-set. */
  revision: number;
  updatedAt: string;
}

type Snapshot = Record<CampoId, Campo>;

const CAMPOS: CampoId[] = ["notas", "meta"];

/** Onde o texto vivia antes — no browser, e só nele. */
const CHAVE_ANTIGA: Record<CampoId, string> = {
  notas: "liquen-team-notes",
  meta: "liquen-meta-receita",
};

/**
 * Depois de migrado, o valor antigo é ARQUIVADO em vez de apagado.
 *
 * Apagar assim que o servidor confirma seria o mais limpo, mas este ecrã
 * existe porque alguém perdeu texto sem dar por isso; deixar uma cópia local
 * intacta durante a passagem custa uns KB e não custa nada a ninguém.
 */
const chaveArquivo = (id: CampoId) => `${CHAVE_ANTIGA[id]}--copia-local`;

function lerLocal(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}

/** Só é chamado DEPOIS de o servidor confirmar que já tem o texto. */
function arquivarLocal(id: CampoId, valor: string): void {
  try {
    localStorage.setItem(chaveArquivo(id), valor);
    localStorage.removeItem(CHAVE_ANTIGA[id]);
  } catch {
    // Um browser sem storage não impede nada: a verdade está no servidor.
  }
}

/** Estado de gravação de UM campo. Nunca há um estado mudo. */
type Estado =
  | { tipo: "em-dia" }
  | { tipo: "a-guardar" }
  | { tipo: "guardado"; quando: string }
  | { tipo: "erro"; mensagem: string; texto: string }
  | { tipo: "conflito"; servidor: Campo; meu: string; origem: "servidor" | "browser" };

type Conflito = Extract<Estado, { tipo: "conflito" }>;

function horaCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function motivo(err: unknown): string {
  // Um `fetch` que nem chega ao servidor rejeita com TypeError e uma mensagem
  // de programador ("Failed to fetch"); essa não vai para o ecrã dela.
  if (err instanceof Error && err.name !== "TypeError" && err.message) return err.message;
  return "Não foi possível chegar ao servidor — verifique a ligação.";
}

/**
 * Lê os dois campos do servidor, grava-os e traz o que estava no browser.
 *
 * ── Edição em simultâneo (dois dispositivos, duas pessoas) ────────────────
 * Cada gravação diz ao servidor sobre que revisão foi escrita. Se entretanto
 * alguém gravou, o servidor responde 409 com a versão dele e a nossa NÃO é
 * escrita: mostram-se as duas lado a lado e a escolha é de quem está a ler.
 * O último a gravar ganhar seria mais simples — e apagaria texto sem ninguém
 * dar por isso, que é o defeito que este ecrã tinha.
 *
 * ── O que estava no browser ───────────────────────────────────────────────
 * Ao carregar, comparamos a chave antiga do `localStorage` com o servidor:
 *   · iguais            → a passagem já foi feita; arquiva-se a chave antiga;
 *   · servidor vazio    → o browser é a única cópia: sobe sozinha (e só depois
 *                         de confirmada é que a chave antiga é arquivada);
 *   · os dois com texto → ninguém decide por ela: é o mesmo aviso de conflito.
 */
function usePainelEquipa() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [carga, setCarga] = useState<"a-carregar" | "pronto" | "erro">("a-carregar");
  const [estado, setEstado] = useState<Record<CampoId, Estado>>({
    notas: { tipo: "em-dia" },
    meta: { tipo: "em-dia" },
  });

  // A revisão actual tem de estar à mão no momento da gravação, sem depender
  // do render anterior — daí o ref a acompanhar o estado.
  const snapRef = useRef<Snapshot | null>(null);

  const marcar = useCallback((id: CampoId, e: Estado) => {
    setEstado((prev) => ({ ...prev, [id]: e }));
  }, []);

  const aplicar = useCallback((campo: Campo) => {
    const base = snapRef.current;
    if (!base) return;
    const proximo = { ...base, [campo.id]: campo };
    snapRef.current = proximo;
    setSnapshot(proximo);
  }, []);

  const guardar = useCallback(
    async (id: CampoId, value: string): Promise<boolean> => {
      const base = snapRef.current?.[id];
      if (!base) {
        marcar(id, {
          tipo: "erro",
          mensagem: "Ainda não foi possível ler o que está guardado no servidor.",
          texto: value,
        });
        return false;
      }
      marcar(id, { tipo: "a-guardar" });
      try {
        const res = await fetch(OVERVIEW_API, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, value, baseRevision: base.revision }),
        });
        if (res.status === 409) {
          const corpo = (await res.json().catch(() => null)) as { current?: Campo } | null;
          const servidor = corpo?.current ?? base;
          aplicar(servidor);
          marcar(id, { tipo: "conflito", servidor, meu: value, origem: "servidor" });
          return false;
        }
        if (!res.ok) {
          const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            typeof corpo?.error === "string" && corpo.error
              ? corpo.error
              : `O servidor respondeu ${res.status}.`,
          );
        }
        const guardado = (await res.json()) as Campo;
        aplicar(guardado);
        marcar(id, { tipo: "guardado", quando: horaCurta(guardado.updatedAt) });
        return true;
      } catch (err) {
        marcar(id, { tipo: "erro", mensagem: motivo(err), texto: value });
        return false;
      }
    },
    [aplicar, marcar],
  );

  // Não marca "a-carregar" à entrada: no arranque já é esse o estado inicial, e
  // fazê-lo aqui seria um setState síncrono dentro do efeito. Quem repete a
  // leitura a partir de um botão passa por `recarregar`, que o marca.
  const carregar = useCallback(async (): Promise<Snapshot | null> => {
    try {
      const res = await fetch(OVERVIEW_API, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const snap = (await res.json()) as Snapshot;
      snapRef.current = snap;
      setSnapshot(snap);
      setCarga("pronto");
      return snap;
    } catch {
      setCarga("erro");
      return null;
    }
  }, []);

  const migrar = useCallback(
    (snap: Snapshot) => {
      for (const id of CAMPOS) {
        const antigo = lerLocal(CHAVE_ANTIGA[id]).trim();
        if (!antigo) continue;
        const servidor = (snap[id]?.value ?? "").trim();
        if (servidor === antigo) {
          arquivarLocal(id, antigo);
          continue;
        }
        if (!servidor) {
          void guardar(id, antigo).then((ok) => {
            if (ok) arquivarLocal(id, antigo);
          });
          continue;
        }
        marcar(id, { tipo: "conflito", servidor: snap[id], meu: antigo, origem: "browser" });
      }
    },
    [guardar, marcar],
  );

  useEffect(() => {
    let vivo = true;
    // O estado só é escrito DEPOIS do `await fetch`, dentro de `carregar` — é a
    // sincronização com um sistema externo (o servidor) que o efeito existe
    // para fazer, não uma cascata de renders. Mesma isenção, e pelo mesmo
    // motivo, que o `useCachedList` das outras vistas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar().then((snap) => {
      if (vivo && snap) migrar(snap);
    });
    return () => {
      vivo = false;
    };
  }, [carregar, migrar]);

  const resolver = useCallback(
    async (id: CampoId, conflito: Conflito, escolha: "meu" | "servidor") => {
      if (escolha === "servidor") {
        // Fica a versão do servidor. A do browser não se evapora: vai para o
        // arquivo, onde continua legível se ela mudar de ideias.
        if (conflito.origem === "browser") arquivarLocal(id, conflito.meu);
        marcar(id, { tipo: "em-dia" });
        return;
      }
      // Grava por cima, mas já sobre a revisão nova — o texto do servidor
      // acabou de ser mostrado, por isso a substituição é uma decisão dela.
      const ok = await guardar(id, conflito.meu);
      if (ok && conflito.origem === "browser") arquivarLocal(id, conflito.meu);
    },
    [guardar, marcar],
  );

  const recarregar = useCallback(() => {
    setCarga("a-carregar");
    void carregar().then((snap) => {
      if (snap) migrar(snap);
    });
  }, [carregar, migrar]);

  return { snapshot, carga, estado, guardar, resolver, recarregar };
}

/** Aviso de duas versões do mesmo texto. Mostra AS DUAS e não escolhe nenhuma. */
function AvisoConflito({
  conflito,
  rotulo,
  onEscolher,
}: {
  conflito: Conflito;
  rotulo: string;
  onEscolher: (escolha: "meu" | "servidor") => void;
}) {
  const doBrowser = conflito.origem === "browser";
  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border border-[#b5654a]/30 bg-[#b5654a]/[0.06] p-3 text-left"
    >
      <p className="text-[#8f4a33] text-xs font-semibold leading-snug">
        {doBrowser
          ? `Havia ${rotulo} guardadas só neste browser, diferentes das que estão no servidor. Nada foi apagado.`
          : `${rotulo} foram alteradas noutro dispositivo. O que escreveu NÃO foi gravado.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 mt-2.5">
        <div>
          <p className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase mb-1">
            {doBrowser ? "Neste browser" : "O que escreveu"}
          </p>
          <p className="text-foreground/70 text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-white/60 rounded-lg p-2">
            {conflito.meu || "(vazio)"}
          </p>
        </div>
        <div>
          <p className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase mb-1">
            No servidor
          </p>
          <p className="text-foreground/70 text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-white/60 rounded-lg p-2">
            {conflito.servidor.value || "(vazio)"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2.5">
        <button
          onClick={() => onEscolher("meu")}
          className={`px-3 py-1.5 rounded-lg bg-[#1b2119] text-white/90 text-[10px] tracking-[0.12em] uppercase ${FOCUS_RING}`}
        >
          {doBrowser ? "Guardar as deste browser" : "Guardar a minha por cima"}
        </button>
        <button
          onClick={() => onEscolher("servidor")}
          className={`px-3 py-1.5 rounded-lg border border-foreground/15 text-foreground/60 text-[10px] tracking-[0.12em] uppercase ${FOCUS_RING}`}
        >
          Ficar com a do servidor
        </button>
      </div>
    </div>
  );
}

/**
 * A legenda de estado. Antes dizia sempre "Guardado automaticamente" — mesmo
 * quando nada tinha sido guardado. Agora diz o que se passa, e uma falha é
 * `role="alert"`, com o texto por gravar guardado no próprio estado para o
 * "Tentar de novo" não depender do que ainda está no ecrã.
 */
function LinhaEstado({
  estado,
  porGravar,
  onTentarDeNovo,
}: {
  estado: Estado;
  porGravar: boolean;
  onTentarDeNovo: (texto: string) => void;
}) {
  if (estado.tipo === "erro") {
    const texto = estado.texto;
    return (
      <span role="alert" className="text-[#b5654a] text-[10px] leading-snug">
        Não foi possível guardar — o texto está só neste ecrã. {estado.mensagem}{" "}
        <button
          onClick={() => onTentarDeNovo(texto)}
          className={`underline font-semibold rounded ${FOCUS_RING}`}
        >
          Tentar de novo
        </button>
      </span>
    );
  }
  if (estado.tipo === "conflito") {
    return <span className="text-[#b5654a] text-[10px]">Duas versões por resolver.</span>;
  }
  if (porGravar) return <span className="text-foreground/40 text-[10px]">Por guardar…</span>;
  if (estado.tipo === "a-guardar")
    return <span className="text-foreground/40 text-[10px]">A guardar…</span>;
  if (estado.tipo === "guardado")
    return (
      <span className="text-[#4d6350] text-[10px]">
        Guardado no servidor{estado.quando ? ` às ${estado.quando}` : ""}
      </span>
    );
  return <span className="text-foreground/22 text-[10px]">Guardado no servidor</span>;
}

/** A leitura falhou: dizê-lo é obrigatório — um "Sem notas." seria outra mentira. */
function AvisoLeitura({ onRecarregar }: { onRecarregar: () => void }) {
  return (
    <p role="alert" className="text-[#b5654a] text-xs leading-relaxed">
      Não foi possível ler o que está guardado no servidor.{" "}
      <button onClick={onRecarregar} className={`underline font-semibold rounded ${FOCUS_RING}`}>
        Tentar de novo
      </button>
    </p>
  );
}

interface CampoProps {
  campo: Campo | undefined;
  estado: Estado;
  carga: "a-carregar" | "pronto" | "erro";
  onGuardar: (valor: string) => Promise<boolean>;
  onResolver: (conflito: Conflito, escolha: "meu" | "servidor") => void;
  onRecarregar: () => void;
}

const MetaReceita = memo(function MetaReceita({
  wonThisMonth,
  campo,
  estado,
  carga,
  onGuardar,
  onResolver,
  onRecarregar,
}: CampoProps & { wonThisMonth: number }) {
  const guardada = Number(campo?.value ?? "");
  const goal = Number.isFinite(guardada) && guardada > 0 ? guardada : 0;
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  async function saveGoal() {
    const v = parseFloat(goalInput.replace(/[^\d.]/g, "")) || 0;
    // O editor só fecha quando o servidor confirma: fechá-lo antes seria a
    // mesma promessa vazia de antes.
    if (await onGuardar(v > 0 ? String(v) : "")) setEditingGoal(false);
  }

  return (
    <div className="bo-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="bo-eyebrow">Meta de receita — este mês</h3>
        {!editingGoal && carga !== "erro" && (
          <button
            onClick={() => {
              setGoalInput(goal > 0 ? String(goal) : "");
              setEditingGoal(true);
            }}
            className={`alvo-toque text-foreground/40 text-[10px] tracking-[0.12em] uppercase hover:text-[#4d6350] transition-colors motion-reduce:transition-none rounded ${FOCUS_RING}`}
          >
            {goal > 0 ? "Editar meta" : "Definir meta"}
          </button>
        )}
      </div>

      {carga === "erro" ? (
        <AvisoLeitura onRecarregar={onRecarregar} />
      ) : editingGoal ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveGoal();
                if (e.key === "Escape") setEditingGoal(false);
              }}
              placeholder="Ex: 15000"
              aria-label="Meta de receita deste mês"
              className="bo-input flex-1 px-3 py-2 text-sm text-foreground/70"
            />
            <button
              onClick={() => void saveGoal()}
              disabled={estado.tipo === "a-guardar"}
              className="px-4 py-2 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-xl hover:bg-[#2a3227] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {estado.tipo === "a-guardar" ? "A guardar…" : "Guardar"}
            </button>
            <button
              onClick={() => setEditingGoal(false)}
              className="text-foreground/35 text-[10px] uppercase tracking-[0.1em] hover:text-foreground/60 transition-colors px-1"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <div className="mt-2">
            <LinhaEstado
              estado={estado}
              porGravar={false}
              onTentarDeNovo={(texto) => void onGuardar(texto)}
            />
          </div>
        </div>
      ) : carga === "a-carregar" ? (
        <p className="text-foreground/40 text-xs py-1">A carregar…</p>
      ) : goal > 0 ? (
        <>
          <div className="flex items-end justify-between mb-2">
            <div>
              <span
                className="font-bold"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(18px, 2vw, 24px)",
                  color: wonThisMonth >= goal ? "#3a5c39" : "#4d6350",
                }}
              >
                {eur(wonThisMonth)}
              </span>
              <span className="text-foreground/30 text-xs ml-2">de {eur(goal)}</span>
            </div>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: wonThisMonth >= goal ? "#3a5c39" : "#4d6350" }}
            >
              {Math.min(100, Math.round((wonThisMonth / goal) * 100))}%
            </span>
          </div>
          <div className="h-2.5 bg-foreground/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (wonThisMonth / goal) * 100)}%`,
                background: wonThisMonth >= goal ? "#3a5c39" : "#4d6350",
              }}
            />
          </div>
          {wonThisMonth >= goal && (
            <p className="text-[#3a5c39] text-[10px] tracking-[0.12em] uppercase font-semibold mt-2">
              Meta atingida ✓
            </p>
          )}
        </>
      ) : (
        <p className="text-foreground/40 text-xs py-1">Sem meta definida.</p>
      )}

      {estado.tipo === "conflito" && (
        <AvisoConflito
          conflito={estado}
          rotulo="uma meta de receita"
          onEscolher={(escolha) => {
            // Ficar com a do servidor fecha o editor: deixá-lo aberto com o
            // número dela seria prometer uma gravação que já não vai acontecer.
            if (escolha === "servidor") setEditingGoal(false);
            onResolver(estado, escolha);
          }}
        />
      )}
      {estado.tipo === "erro" && !editingGoal && (
        <div className="mt-2">
          <LinhaEstado
            estado={estado}
            porGravar={false}
            onTentarDeNovo={(texto) => void onGuardar(texto)}
          />
        </div>
      )}
    </div>
  );
});

/** Espera, em ms, entre a última tecla e a gravação no servidor. */
const ATRASO_GRAVACAO = 800;

const NotasEquipa = memo(function NotasEquipa({
  campo,
  estado,
  carga,
  onGuardar,
  onResolver,
  onRecarregar,
}: CampoProps) {
  const gravado = campo?.value ?? "";
  // `null` = o que está no ecrã é o que está no servidor. Enquanto se escreve,
  // o rascunho manda — inclusive depois de uma falha, para o texto ficar à
  // vista em vez de ser substituído pela versão antiga do servidor.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  // Texto que uma gravação falhada deixou pendurado sem ninguém o ter escrito
  // aqui — é o caso da passagem do browser para o servidor. Se não o
  // mostrássemos, ela via "Sem notas." com as notas dela a existir algures.
  const porMostrar = estado.tipo === "erro" ? estado.texto : "";
  const teamNotes = rascunho ?? (gravado || porMostrar);
  const porGravar = rascunho !== null && rascunho !== gravado;

  // O texto continua a aparecer a cada tecla; o que é adiado é a IDA AO
  // SERVIDOR — uma gravação por tecla seria um pedido por carácter.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarTimer = () => {
    if (notesTimer.current) {
      clearTimeout(notesTimer.current);
      notesTimer.current = null;
    }
  };
  function escrever(v: string) {
    setRascunho(v);
    cancelarTimer();
    notesTimer.current = setTimeout(() => {
      notesTimer.current = null;
      void onGuardar(v);
    }, ATRASO_GRAVACAO);
  }
  function fechar() {
    // Fechar não pode engolir o que ainda estava a caminho: o que estiver
    // pendente vai já.
    if (notesTimer.current) {
      cancelarTimer();
      void onGuardar(teamNotes);
    }
    setEditingNotes(false);
  }
  useEffect(() => cancelarTimer, []);

  // Sair da página com texto por gravar (ou com uma gravação falhada) é
  // exactamente a forma de perder trabalho sem aviso que este ecrã tinha.
  const arriscado = porGravar || estado.tipo === "erro" || estado.tipo === "conflito";
  useEffect(() => {
    if (!arriscado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [arriscado]);

  return (
    <div className="bo-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="bo-eyebrow">Notas da equipa</h3>
        {!editingNotes && carga !== "erro" && (
          <button
            onClick={() => setEditingNotes(true)}
            className={`alvo-toque text-foreground/40 text-[10px] tracking-[0.12em] uppercase hover:text-[#4d6350] transition-colors motion-reduce:transition-none rounded ${FOCUS_RING}`}
          >
            {teamNotes ? "Editar" : "Adicionar nota"}
          </button>
        )}
      </div>
      {carga === "erro" ? (
        <AvisoLeitura onRecarregar={onRecarregar} />
      ) : editingNotes ? (
        <div>
          <textarea
            autoFocus
            rows={4}
            value={teamNotes}
            onChange={(e) => escrever(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") fechar();
            }}
            aria-label="Notas da equipa"
            placeholder="Notas partilhadas com a equipa — lembretes, contexto, próximos passos…"
            className="bo-input w-full px-3 py-2 text-sm text-foreground/70 resize-none"
          />
          <div className="flex items-center justify-between gap-3 mt-2">
            <LinhaEstado
              estado={estado}
              porGravar={porGravar}
              onTentarDeNovo={(texto) => void onGuardar(texto)}
            />
            <button
              onClick={fechar}
              className="text-[#4d6350] text-[10px] tracking-[0.1em] uppercase font-medium hover:opacity-75 transition-opacity shrink-0"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : carga === "a-carregar" ? (
        <p className="text-foreground/40 text-xs">A carregar…</p>
      ) : (
        <>
          {teamNotes ? (
            <p
              className="text-foreground/55 text-sm leading-relaxed whitespace-pre-wrap cursor-text"
              onClick={() => setEditingNotes(true)}
            >
              {teamNotes}
            </p>
          ) : (
            <p className="text-foreground/40 text-xs">Sem notas.</p>
          )}
          {(porGravar || estado.tipo === "erro") && (
            <div className="mt-2">
              <LinhaEstado
                estado={estado}
                porGravar={porGravar}
                onTentarDeNovo={(texto) => void onGuardar(texto)}
              />
            </div>
          )}
        </>
      )}

      {estado.tipo === "conflito" && (
        <AvisoConflito
          conflito={estado}
          rotulo="notas"
          onEscolher={(escolha) => {
            // Ficar com a do servidor tem de largar MESMO o rascunho: mantê-lo
            // no ecrã por baixo de "resolvido" seria mostrar um texto que já
            // ninguém vai gravar — outra vez a mentira que se veio corrigir.
            if (escolha === "servidor") {
              cancelarTimer();
              setRascunho(null);
            }
            onResolver(estado, escolha);
          }}
        />
      )}
    </div>
  );
});

/**
 * Os dois cartões partilham UMA leitura do servidor (um pedido, não dois) e
 * mantêm gravações independentes — escrever a meta no telemóvel não pode
 * atropelar as notas abertas no portátil.
 */
const PainelEquipa = memo(function PainelEquipa({ wonThisMonth }: { wonThisMonth: number }) {
  const { snapshot, carga, estado, guardar, resolver, recarregar } = usePainelEquipa();
  const guardarMeta = useCallback((v: string) => guardar("meta", v), [guardar]);
  const guardarNotas = useCallback((v: string) => guardar("notas", v), [guardar]);
  const resolverMeta = useCallback(
    (c: Conflito, escolha: "meu" | "servidor") => void resolver("meta", c, escolha),
    [resolver],
  );
  const resolverNotas = useCallback(
    (c: Conflito, escolha: "meu" | "servidor") => void resolver("notas", c, escolha),
    [resolver],
  );
  return (
    <>
      <MetaReceita
        wonThisMonth={wonThisMonth}
        campo={snapshot?.meta}
        estado={estado.meta}
        carga={carga}
        onGuardar={guardarMeta}
        onResolver={resolverMeta}
        onRecarregar={recarregar}
      />
      <NotasEquipa
        campo={snapshot?.notas}
        estado={estado.notas}
        carga={carga}
        onGuardar={guardarNotas}
        onResolver={resolverNotas}
        onRecarregar={recarregar}
      />
    </>
  );
});

interface Props {
  quotes: Quote[];
  userName: string;
  onOpen: (q: Quote) => void;
  onGoStats: () => void;
  onGo: (view: "pedidos" | "kanban" | "calendario" | "tarefas" | "propostas" | "clientes") => void;
  onNew: () => void;
}

export default function Overview({ quotes, userName, onOpen, onGoStats, onGo, onNew }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthD.getFullYear()}-${lastMonthD.getMonth()}`;

    let thisMonth = 0,
      lastMonth = 0,
      pipeline = 0,
      won = 0,
      wonThisMonth = 0,
      wonLastMonth = 0,
      received = 0,
      outstanding = 0;
    let eventsToday = 0,
      eventsThisWeek = 0;
    const byStatus: Record<string, number> = {};
    const months = Array.from({ length: 6 }, () => 0);

    for (const q of quotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      if (q.status === "cotado" && q.quotedPrice) pipeline += q.quotedPrice;
      if (q.status === "aceite" && q.quotedPrice) won += q.quotedPrice;
      for (const p of q.payments ?? []) {
        if (p.paid) received += p.amount;
        else outstanding += p.amount;
      }
      if (q.date === todayKey) eventsToday++;
      if (q.date && q.date >= todayKey && q.date <= weekEndKey) eventsThisWeek++;

      const sd = new Date(q.submittedAt);
      const sKey = `${sd.getFullYear()}-${sd.getMonth()}`;
      if (sKey === thisMonthKey) thisMonth++;
      if (sKey === lastMonthKey) lastMonth++;
      const monthsBack =
        (now.getFullYear() - sd.getFullYear()) * 12 + now.getMonth() - sd.getMonth();
      if (monthsBack >= 0 && monthsBack < 6) months[5 - monthsBack]++;

      // Won revenue attributed to the month the deal was last touched (accepted).
      if (q.status === "aceite" && q.quotedPrice) {
        const wd = new Date(q.lastUpdated ?? q.submittedAt);
        const wKey = `${wd.getFullYear()}-${wd.getMonth()}`;
        if (wKey === thisMonthKey) wonThisMonth += q.quotedPrice;
        if (wKey === lastMonthKey) wonLastMonth += q.quotedPrice;
      }
    }

    const todayMs = Date.now();
    // Next upcoming confirmed event (accepted within next 90 days)
    const nextEvent =
      quotes
        .filter(
          (q) => q.date && q.date >= todayKey && (q.status === "aceite" || q.status === "cotado"),
        )
        .sort((a, b) => a.date!.localeCompare(b.date!))[0] ?? null;
    const nextEventDays = nextEvent?.date
      ? Math.round((new Date(nextEvent.date + "T12:00:00").getTime() - Date.now()) / 86400000)
      : null;

    const needAction = quotes
      .filter((q) => {
        if (q.status !== "pendente" && q.status !== "em_revisao" && q.status !== "cotado")
          return false;
        return true;
      })
      .map((q) => {
        const lastMs = new Date(q.lastUpdated ?? q.submittedAt).getTime();
        const daysSince = Math.floor((todayMs - lastMs) / 86400000);
        return { q, daysSince, isStale: daysSince >= 14 };
      })
      .sort((a, b) => {
        // Stale leads first, then by date
        if (a.isStale && !b.isStale) return -1;
        if (!a.isStale && b.isStale) return 1;
        return +new Date(b.q.submittedAt) - +new Date(a.q.submittedAt);
      });
    const staleCount = needAction.filter((x) => x.isStale).length;

    const recent = [...quotes]
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
      .slice(0, 6);

    const accepted = byStatus["aceite"] ?? 0;
    const decided = accepted + (byStatus["rejeitado"] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
    const avgTicket = accepted > 0 ? won / accepted : 0;
    const billed = received + outstanding;

    // Active pipeline = everything not yet won/lost. Pending review = the leads
    // still waiting on us to send a proposal (Novo + Aguardar resposta).
    const active =
      (byStatus["pendente"] ?? 0) + (byStatus["em_revisao"] ?? 0) + (byStatus["cotado"] ?? 0);
    const pendingReview = (byStatus["pendente"] ?? 0) + (byStatus["em_revisao"] ?? 0);

    return {
      thisMonth,
      lastMonth,
      pipeline,
      won,
      wonThisMonth,
      wonLastMonth,
      received,
      outstanding,
      billed,
      eventsToday,
      eventsThisWeek,
      months,
      needAction,
      staleCount,
      nextEvent,
      nextEventDays,
      recent,
      conversion,
      avgTicket,
      active,
      pendingReview,
      total: quotes.length,
      byStatus,
      funnelMax: Math.max(1, ...FUNNEL.map((f) => byStatus[f.id] ?? 0)),
    };
  }, [quotes]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";

  // Smart headline: surface the most pressing things for today.
  const headline = (() => {
    const bits: string[] = [];
    if (data.eventsToday > 0)
      bits.push(`${data.eventsToday} evento${data.eventsToday !== 1 ? "s" : ""} hoje`);
    else if (data.eventsThisWeek > 0)
      bits.push(`${data.eventsThisWeek} evento${data.eventsThisWeek !== 1 ? "s" : ""} esta semana`);
    if (data.needAction.length > 0)
      bits.push(
        `${data.needAction.length} pedido${data.needAction.length !== 1 ? "s" : ""} a precisar de atenção`,
      );
    // Minimalista: só fala quando há algo a pedir ação — sem frases de enchimento.
    if (bits.length === 0) return "";
    return `Tem ${bits.join(" e ")}.`;
  })();

  const quickActions: { label: string; onClick: () => void; icon: React.ReactNode }[] = [
    {
      label: "Novo pedido",
      onClick: onNew,
      icon: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
    },
    {
      label: "Fases dos pedidos",
      onClick: () => onGo("kanban"),
      icon: (
        <>
          <rect x="3" y="4" width="4" height="16" rx="1" />
          <rect x="10" y="4" width="4" height="11" rx="1" />
          <rect x="17" y="4" width="4" height="7" rx="1" />
        </>
      ),
    },
    {
      label: "Calendário",
      onClick: () => onGo("calendario"),
      icon: (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
        </>
      ),
    },
    {
      label: "Tarefas",
      onClick: () => onGo("tarefas"),
      icon: (
        <>
          <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"
            strokeLinecap="round"
          />
        </>
      ),
    },
  ];

  const dateLabel = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Warm onboarding state — a fresh back office with no pedidos yet. Instead of a
  // grid of empty cards, greet the user and point them at their first action.
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col gap-7">
        <div>
          <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
            {dateLabel}
          </p>
          <h2
            className="text-foreground font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 3.5vw, 40px)" }}
          >
            {greeting}, {userName}.
          </h2>
        </div>
        <div className="bo-card p-8 sm:p-12 text-center flex flex-col items-center">
          <span
            className="flex items-center justify-center w-14 h-14 rounded-2xl mb-5 bg-[#4d6350]/[0.08] text-[#4d6350]"
            aria-hidden="true"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
          <h3
            className="text-foreground/80 font-bold text-xl mb-2"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Ainda sem pedidos por aqui.
          </h3>
          <p className="text-foreground/45 text-sm max-w-sm leading-relaxed mb-6">
            Este é o seu ponto de partida. Assim que registar o primeiro pedido, a Visão Geral
            enche-se de vida — eventos, propostas e receita, tudo num só olhar.
          </p>
          <button
            onClick={onNew}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] tracking-[0.15em] uppercase font-medium bg-[#1b2119] text-white/90 hover:bg-[#2a3227] shadow-sm transition-colors motion-reduce:transition-none ${FOCUS_RING}`}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Criar o primeiro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Greeting + quick actions */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div>
          <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
            {dateLabel}
          </p>
          <h2
            className="text-foreground font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 3.5vw, 40px)" }}
          >
            {greeting}, {userName}.
          </h2>
          {headline && <p className="text-foreground/40 text-sm mt-2">{headline}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`alvo-toque flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] tracking-[0.12em] uppercase font-medium transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                i === 0
                  ? "bg-[#1b2119] text-white/90 hover:bg-[#2a3227] shadow-sm"
                  : "bg-white border border-foreground/[0.08] text-foreground/55 hover:text-foreground/80 hover:border-foreground/15 shadow-sm"
              }`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                {a.icon}
              </svg>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Próximo evento em destaque */}
      {data.nextEvent && data.nextEventDays !== null && data.nextEventDays <= 30 && (
        <button
          onClick={() => onOpen(data.nextEvent!)}
          className={`w-full text-left rounded-2xl p-5 border transition-all motion-reduce:transition-none hover:shadow-md ${FOCUS_RING} ${
            data.nextEventDays <= 3
              ? "bg-[#b5654a]/[0.07] border-[#b5654a]/25 hover:border-[#b5654a]/40"
              : data.nextEventDays <= 7
                ? "bg-amber-500/[0.05] border-amber-500/20 hover:border-amber-500/35"
                : "bg-[#4d6350]/[0.05] border-[#4d6350]/20 hover:border-[#4d6350]/35"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                className="text-[10px] tracking-[0.25em] uppercase font-medium mb-1.5"
                style={{
                  color:
                    data.nextEventDays <= 3
                      ? "#b5654a"
                      : data.nextEventDays <= 7
                        ? "#b5894a"
                        : "#4d6350",
                }}
              >
                {data.nextEventDays === 0
                  ? "Evento hoje"
                  : data.nextEventDays === 1
                    ? "Evento amanhã"
                    : `Próximo evento · faltam ${data.nextEventDays} dias`}
              </p>
              <h3
                className="text-foreground/80 font-bold text-lg leading-tight truncate"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {data.nextEvent.name}
              </h3>
              <p className="text-foreground/40 text-sm mt-1">
                {new Date(data.nextEvent.date! + "T12:00:00").toLocaleDateString("pt-PT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                {data.nextEvent.location ? ` · ${data.nextEvent.location}` : ""}
                {data.nextEvent.guests ? ` · ${data.nextEvent.guests} convidados` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className="text-3xl font-bold tabular-nums"
                style={{
                  fontFamily: "var(--font-playfair)",
                  color:
                    data.nextEventDays <= 3
                      ? "#b5654a"
                      : data.nextEventDays <= 7
                        ? "#b5894a"
                        : "#4d6350",
                }}
              >
                {data.nextEventDays === 0 ? "hoje" : `${data.nextEventDays}d`}
              </p>
              <p className="text-foreground/25 text-[10px] tracking-[0.15em] uppercase mt-0.5">
                {metaFor(STATUS_META, data.nextEvent.status).label}
              </p>
            </div>
          </div>
        </button>
      )}

      {/* KPI hero strip — the four-or-five numbers that matter most at a glance.
          Each card is a shortcut into the view that acts on it. Labels are written
          for a newcomer, with a one-line helper spelling out what each means. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            v: String(data.active),
            l: "Pedidos ativos",
            hint: "ainda em aberto",
            dark: true,
            go: () => onGo("pedidos"),
          },
          {
            v: String(data.pendingReview),
            l: "Por responder",
            hint: "aguardam proposta",
            go: () => onGo("pedidos"),
          },
          {
            v: eur(data.pipeline),
            l: "Valor em propostas",
            hint: "enviadas, à espera de resposta",
            go: () => onGo("kanban"),
          },
          {
            v: String(data.eventsThisWeek),
            l: "Próximos 7 dias",
            hint: "eventos agendados",
            go: () => onGo("calendario"),
          },
          {
            v: eur(data.won),
            l: "Receita ganha",
            hint: "propostas fechadas",
            dark: true,
            delta: { now: data.wonThisMonth, prev: data.wonLastMonth },
            go: onGoStats,
          },
        ].map((k) => (
          <button
            key={k.l}
            onClick={k.go}
            aria-label={`${k.l}: ${k.v} — ${k.hint}. Abrir.`}
            className={`group relative overflow-hidden rounded-xl p-5 border text-left transition-colors duration-200 motion-reduce:transition-none bg-[var(--bo-surface)] border-[var(--bo-hairline)] hover:border-[var(--bo-hairline-strong)] ${FOCUS_RING}`}
          >
            <div className="flex items-start justify-between gap-2 relative">
              <p
                className="font-bold leading-none mb-2 text-[var(--bo-text)]"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.4vw, 30px)" }}
              >
                {k.v}
              </p>
              {k.delta && <Delta now={k.delta.now} prev={k.delta.prev} />}
            </div>
            <p className="text-[9px] tracking-[0.25em] uppercase relative font-medium text-[var(--bo-text-faint)]">
              {k.l}
            </p>
          </button>
        ))}
      </div>

      <PainelEquipa wonThisMonth={data.wonThisMonth} />

      {/* Reminders — derived urgent items */}
      <MemoReminders quotes={quotes} onOpen={onOpen} />

      {/* Agenda — events, calendar entries, tasks & payments due */}
      <MemoAgenda quotes={quotes} onOpen={onOpen} />

      {/* Pipeline funnel + financial pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Funnel */}
        <div className="bo-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="bo-eyebrow">Fases dos pedidos</h3>
            <button
              onClick={() => onGo("kanban")}
              className={`alvo-toque text-[#4d6350] hover:text-[#637a5f] text-[10px] tracking-[0.15em] uppercase transition-colors motion-reduce:transition-none rounded ${FOCUS_RING}`}
            >
              Abrir →
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {FUNNEL.map((f) => {
              const count = data.byStatus[f.id] ?? 0;
              return (
                <div key={f.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-foreground/55 text-xs">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: STATUS_META[f.id].color }}
                      />
                      {f.label}
                    </span>
                    <span className="text-foreground/40 text-[11px] tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(count / data.funnelMax) * 100}%`,
                        background: STATUS_META[f.id].color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-foreground/[0.07]">
            <span className="text-foreground/35 text-xs">
              Pedidos que acabam em evento
              <span className="block text-foreground/25 text-[10px]">
                de cada 100 decididos, quantos ganhou
              </span>
            </span>
            <span className="text-foreground/75 text-sm font-semibold tabular-nums">
              {data.conversion}%
            </span>
          </div>
        </div>

        {/* Financial pulse */}
        <div className="bo-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="bo-eyebrow">Dinheiro — recebido e a receber</h3>
            <button
              onClick={onGoStats}
              className={`alvo-toque text-[#4d6350] hover:text-[#637a5f] text-[10px] tracking-[0.15em] uppercase transition-colors motion-reduce:transition-none rounded ${FOCUS_RING}`}
            >
              Ver tudo →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <p
                className="text-[#4d6350] font-bold leading-none mb-1"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2vw, 24px)" }}
              >
                {eur(data.received)}
              </p>
              <p className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase">Recebido</p>
            </div>
            <div>
              <p
                className="text-foreground/70 font-bold leading-none mb-1"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2vw, 24px)" }}
              >
                {eur(data.outstanding)}
              </p>
              <p className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase">A receber</p>
            </div>
          </div>
          {data.billed > 0 ? (
            <>
              <div className="h-2 rounded-full overflow-hidden flex bg-foreground/[0.06]">
                <div
                  className="h-full bg-[#4d6350] transition-all duration-700"
                  style={{ width: `${(data.received / data.billed) * 100}%` }}
                />
                <div
                  className="h-full bg-[#c0a060]/70 transition-all duration-700"
                  style={{ width: `${(data.outstanding / data.billed) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-4 mt-2.5 text-[10px] text-foreground/40">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#4d6350]" /> Recebido
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#c0a060]/70" /> Por receber
                </span>
              </div>
            </>
          ) : (
            <p className="text-foreground/40 text-xs leading-relaxed">
              Ainda sem pagamentos registados. Assim que registar o primeiro, o recebido e o que
              falta receber aparecem aqui.
            </p>
          )}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-foreground/[0.07]">
            <span className="text-foreground/35 text-xs">
              Valor médio por evento ganho
              <span className="block text-foreground/25 text-[10px]">
                quanto vale, em média, cada pedido fechado
              </span>
            </span>
            <span className="text-foreground/75 text-sm font-semibold tabular-nums">
              {eur(data.avgTicket)}
            </span>
          </div>
        </div>
      </div>

      {/* Needs attention + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="bo-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/[0.07]">
            <h3 className="bo-eyebrow">Precisam de atenção</h3>
            <div className="flex items-center gap-2">
              {data.staleCount > 0 && (
                <span className="text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-semibold">
                  {data.staleCount} parado{data.staleCount !== 1 ? "s" : ""}
                </span>
              )}
              {data.needAction.length > 0 && (
                <span className="text-[10px] tabular-nums bg-[#4d6350]/10 text-[#4d6350] rounded-full px-2 py-0.5">
                  {data.needAction.length}
                </span>
              )}
            </div>
          </div>
          <div className="divide-y divide-foreground/[0.06] max-h-[360px] overflow-y-auto">
            {data.needAction.length === 0 && (
              <div className="text-center py-12 px-6">
                <p className="text-[#4d6350] text-sm font-medium">Tudo tratado.</p>
                <p className="text-foreground/35 text-xs mt-1.5 leading-relaxed">
                  Não há pedidos à espera de si. Bom trabalho — aproveite para preparar os próximos
                  eventos.
                </p>
              </div>
            )}
            {data.needAction.slice(0, 8).map(({ q, daysSince, isStale }) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className={`w-full text-left px-5 py-3.5 hover:bg-foreground/[0.025] transition-colors motion-reduce:transition-none flex items-center justify-between gap-3 ${FOCUS_RING} focus-visible:ring-inset`}
              >
                <div className="min-w-0">
                  <p className="text-foreground/72 text-sm truncate font-medium">{q.name}</p>
                  <p className="text-foreground/30 text-xs truncate mt-0.5">
                    {eventTypeLabel(q)} · {q.guests} convidados
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {isStale ? (
                    <span className="inline-flex items-center gap-1 text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-semibold">
                      {daysSince}d parado
                    </span>
                  ) : (
                    <span
                      className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md"
                      style={{
                        background: `${metaFor(STATUS_META, q.status).color}18`,
                        color: metaFor(STATUS_META, q.status).color,
                      }}
                    >
                      {metaFor(STATUS_META, q.status).label}
                    </span>
                  )}
                  <p className="text-foreground/22 text-[10px] mt-1">{timeAgo(q.submittedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bo-card overflow-hidden">
          <h3 className="bo-eyebrow px-5 py-4 border-b border-foreground/[0.07]">
            Atividade recente
          </h3>
          <div className="divide-y divide-foreground/[0.06]">
            {data.recent.map((q) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className={`alvo-toque !justify-between w-full text-left px-5 py-3 hover:bg-foreground/[0.025] transition-colors motion-reduce:transition-none flex items-center justify-between gap-3 ${FOCUS_RING} focus-visible:ring-inset`}
              >
                <span className="text-foreground/58 text-xs truncate font-medium">{q.name}</span>
                <span className="text-foreground/30 text-[10px] shrink-0">
                  {timeAgo(q.submittedAt)}
                </span>
              </button>
            ))}
            {data.recent.length === 0 && (
              <p className="text-foreground/35 text-sm text-center py-10">
                Ainda sem movimentos por aqui.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
