"use client";

import { useState, useEffect } from "react";
import type { Quote, Task, TaskPriority } from "@/lib/orcamento/types";

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
      <div className="flex items-center justify-between mb-3">
        <p className="bo-eyebrow">Tarefas do evento</p>
        <div className="flex items-center gap-3">
          {tasks.length > 0 && (
            <span className="text-foreground/28 text-[10px] tabular-nums">
              {done.length}/{tasks.length} concluídas
            </span>
          )}
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-[#4d6350] text-[10px] tracking-[0.1em] uppercase font-medium hover:opacity-70 transition-opacity"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 p-3 rounded-xl border border-dashed border-[#4d6350]/30 bg-[#4d6350]/[0.04]">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Título da tarefa…"
            className="bo-input px-3 py-2 text-sm text-foreground/70"
          />
          <div className="flex gap-2">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              className="bo-input flex-1 px-2 py-1.5 text-xs text-foreground/60"
            >
              {(["baixa", "normal", "alta"] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="bo-input flex-1 px-2 py-1.5 text-xs text-foreground/60"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addTask}
              disabled={busy || !newTitle.trim()}
              className="flex-1 py-2 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-xl hover:bg-[#2a3227] transition-colors disabled:opacity-40"
            >
              {busy ? "A criar…" : "Criar tarefa"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-2 text-foreground/40 text-[10px] uppercase tracking-[0.1em] hover:text-foreground/60 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="bo-skeleton h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 && !adding ? (
        <p className="text-foreground/22 text-xs py-1">Sem tarefas ligadas a este evento.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {[...todo, ...done].map((task) => (
            <div
              key={task.id}
              className={`group flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                task.done
                  ? "border-foreground/[0.05] bg-foreground/[0.015] opacity-55"
                  : "border-foreground/[0.07] bg-white shadow-sm hover:shadow"
              }`}
            >
              <button
                onClick={() => toggleDone(task)}
                className="mt-0.5 shrink-0 w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors"
                style={{
                  borderColor: task.done ? "#4d6350" : PRIORITY_COLOR[task.priority],
                  background: task.done ? "#4d635014" : "transparent",
                }}
                aria-label={task.done ? "Marcar como pendente" : "Marcar como concluída"}
              >
                {task.done && (
                  <svg
                    width="10"
                    height="10"
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
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs leading-snug ${
                    task.done ? "line-through text-foreground/30" : "text-foreground/65"
                  }`}
                >
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {!task.done && (
                    <span
                      className="text-[9px] tracking-[0.08em] uppercase"
                      style={{ color: PRIORITY_COLOR[task.priority] }}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                  {task.dueDate && !task.done && (
                    <span
                      className={`text-[10px] tabular-nums ${
                        task.dueDate < todayKey
                          ? "text-[#b5654a] font-medium"
                          : "text-foreground/28"
                      }`}
                    >
                      {new Date(task.dueDate + "T12:00:00").toLocaleDateString("pt-PT", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                  {task.assignee && !task.done && (
                    <span className="text-foreground/25 text-[10px]">{task.assignee}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeTask(task.id)}
                className="mt-0.5 opacity-0 group-hover:opacity-100 text-foreground/20 hover:text-[#b5654a] transition-all shrink-0"
                aria-label="Remover tarefa"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
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
