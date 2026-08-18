"use client";

import { useMemo, useState } from "react";
import type { Quote, Task, TaskPriority } from "@/lib/orcamento/types";
import { todayKey } from "./util";
import { useToast } from "./Toast";
import { Button, Field, EmptyState } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { useCachedList } from "./useCachedList";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  baixa: "#8a8a82",
  normal: "#7c854b",
  alta: "#b5654a",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
};

// Para ordenar as tarefas por fazer: mais urgente primeiro.
const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };

interface Props {
  quote: Quote;
  userName?: string;
}

export default function EventTasks({ quote, userName }: Props) {
  const { toast } = useToast();

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A MESMA LISTA QUE O RESTO DO BACK OFFICE LÊ, FILTRADA POR ESTE EVENTO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Isto era um `fetch("/api/tarefas")` cru, feito de novo em CADA pedido
   * aberto, fora da cache partilhada (`useCachedList`) que a vista global de
   * Tarefas, a Agenda e os Lembretes já usam para a mesma lista. Abrir dez
   * pedidos seguidos eram dez pedidos à rede pela MESMA lista inteira; agora
   * só há um, e as vistas que abrirem depois leem-na já em cache.
   *
   * As escritas (marcar concluída, criar, apagar) têm de ir pelo `setData` do
   * hook, e nunca por um `setState` só deste componente: é a mesma lista que a
   * vista global e a Agenda leem, e um `setState` local desincronizava-as (ela
   * risca uma tarefa aqui, volta à lista global, e a tarefa continua por
   * fazer lá).
   */
  const {
    data: allTasks,
    setData: setAllTasks,
    loading,
    error: erro,
    errorMessage: mensagemDeErro,
    refresh: tentarDeNovo,
  } = useCachedList<Task[]>("tarefas", "/api/tarefas");
  const tasks = useMemo(
    () => (allTasks ?? []).filter((t) => t.quoteId === quote.id),
    [allTasks, quote.id],
  );

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newDue, setNewDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleDone(task: Task) {
    setAllTasks((prev) =>
      (prev ?? []).map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
    );
    const res = await fetch(`/api/tarefas/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    }).catch(() => null);
    if (!res?.ok) {
      setAllTasks((prev) => (prev ?? []).map((t) => (t.id === task.id ? task : t)));
      toast("Não foi possível atualizar a tarefa. Tenta novamente.", "error");
    }
  }

  async function addTask() {
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          priority: newPriority,
          dueDate: newDue || undefined,
          quoteId: quote.id,
          clientName: quote.name,
          assignee: userName || undefined,
          // Marca a área para estas tarefas poderem ser filtradas/agrupadas numa
          // vista global de tarefas (antes ficavam sem área e perdiam-se).
          area: "Produção",
        }),
      });
      const created = res.ok ? await res.json().catch(() => null) : null;
      if (created?.id) {
        setAllTasks((prev) => [...(prev ?? []), created]);
        setNewTitle("");
        setNewPriority("normal");
        setNewDue("");
        setAdding(false);
      } else {
        toast("Não foi possível criar a tarefa. Tenta novamente.", "error");
      }
    } catch {
      toast("Erro de ligação. Verifica a internet e tenta novamente.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task && !window.confirm(`Eliminar a tarefa "${task.title}"?`)) return;
    setAllTasks((prev) => (prev ?? []).filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/tarefas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      if (task) setAllTasks((prev) => [...(prev ?? []), task]);
      toast("Não foi possível eliminar a tarefa. Tenta novamente.", "error");
    }
  }

  const todayStr = todayKey();
  // Por fazer, ordenadas: atrasadas primeiro, depois por prioridade, depois pela
  // data limite mais próxima — o que é urgente fica no topo em vez de se perder
  // pela ordem de criação.
  const todo = tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      const aOver = a.dueDate && a.dueDate < todayStr ? 0 : 1;
      const bOver = b.dueDate && b.dueDate < todayStr ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority])
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
  const done = tasks.filter((t) => t.done);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Tarefas do evento</p>
        <div className="flex items-center gap-3">
          {tasks.length > 0 && (
            <span className="text-foreground/50 text-[11px] tabular-nums">
              {done.length}/{tasks.length} concluídas
            </span>
          )}
          <Button
            variant="subtle"
            size="sm"
            aria-expanded={adding}
            iconLeft={
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            }
            onClick={() => setAdding((v) => !v)}
          >
            Adicionar
          </Button>
        </div>
      </div>

      {adding && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#4d6350]/25 bg-[#4d6350]/[0.04] p-4">
          <Field
            label="Título da tarefa"
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Ex.: Confirmar catering"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              as="select"
              label="Prioridade"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
            >
              {(["baixa", "normal", "alta"] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Field>
            <Field
              as="input"
              type="date"
              label="Data limite"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              onClick={addTask}
              loading={busy}
              disabled={busy || !newTitle.trim()}
            >
              {busy ? "A criar…" : "Criar tarefa"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="bo-skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : erro && tasks.length === 0 ? (
        <AvisoDeFalha
          titulo="Não foi possível ler as tarefas deste evento"
          mensagem={mensagemDeErro}
          aoTentarDeNovo={tentarDeNovo}
        />
      ) : tasks.length === 0 && !adding ? (
        <EmptyState
          className="px-4 py-10"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M9 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4" y="4" width="16" height="16" rx="3" />
            </svg>
          }
          title="Sem tarefas ligadas a este evento"
          description="Cria a primeira tarefa para acompanhar o que falta preparar."
          action={{ label: "Adicionar tarefa", onClick: () => setAdding(true) }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {[...todo, ...done].map((task) => (
            <div
              key={task.id}
              className={`group flex items-start gap-3 rounded-xl border p-3 motion-safe:transition-all ${
                task.done
                  ? "border-foreground/[0.05] bg-foreground/[0.015] opacity-60"
                  : "border-foreground/[0.08] bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04)] hover:shadow"
              }`}
            >
              <button
                onClick={() => toggleDone(task)}
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] motion-safe:transition-colors"
                style={{
                  borderColor: task.done ? "#4d6350" : PRIORITY_COLOR[task.priority],
                  background: task.done ? "#4d635014" : "transparent",
                }}
                aria-label={task.done ? "Marcar como pendente" : "Marcar como concluída"}
              >
                {task.done && (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="#4d6350"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M2.5 6l2.5 2.5L9.5 3" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm leading-snug ${
                    task.done ? "text-foreground/40 line-through" : "text-foreground/80"
                  }`}
                >
                  {task.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {!task.done && (
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: PRIORITY_COLOR[task.priority] }}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                  {task.dueDate && !task.done && (
                    <span
                      className={`text-[11px] tabular-nums ${
                        task.dueDate < todayStr
                          ? "font-medium text-[#8a2a22]"
                          : "text-foreground/45"
                      }`}
                    >
                      {task.dueDate < todayStr ? "Atrasada · " : ""}
                      {new Date(task.dueDate + "T12:00:00").toLocaleDateString("pt-PT", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                  {task.assignee && !task.done && (
                    <span className="text-foreground/45 text-[11px]">{task.assignee}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeTask(task.id)}
                className="mt-0.5 shrink-0 text-foreground/25 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[#8a2a22] motion-safe:transition-all"
                aria-label="Remover tarefa"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
