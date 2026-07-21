"use client";

import { useState, useEffect } from "react";
import type { Quote, Task, TaskPriority } from "@/lib/orcamento/types";
import { Button, Field, EmptyState } from "./ui";

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

interface Props {
  quote: Quote;
  userName?: string;
}

export default function EventTasks({ quote, userName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newDue, setNewDue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/tarefas")
      .then((r) => r.json())
      .then((data: Task[]) => {
        setTasks(Array.isArray(data) ? data.filter((t) => t.quoteId === quote.id) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [quote.id]);

  async function toggleDone(task: Task) {
    const next = { ...task, done: !task.done };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t)));
    const res = await fetch(`/api/tarefas/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    }).catch(() => null);
    if (!res?.ok) setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
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
        }),
      });
      const created = await res.json();
      if (created?.id) {
        setTasks((prev) => [...prev, created]);
        setNewTitle("");
        setNewPriority("normal");
        setNewDue("");
        setAdding(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tarefas/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const todo = tasks.filter((t) => !t.done);
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
                        task.dueDate < todayKey
                          ? "font-medium text-[#8a2a22]"
                          : "text-foreground/45"
                      }`}
                    >
                      {task.dueDate < todayKey ? "Atrasada · " : ""}
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
