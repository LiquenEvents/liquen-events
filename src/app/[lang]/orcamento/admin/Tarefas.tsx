"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task, TaskPriority } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { todayKey } from "./util";
import { Button, Card, EmptyState, Field } from "./ui";

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  alta: { label: "Alta", color: "#b5654a" },
  normal: { label: "Normal", color: "#9aa36a" },
  baixa: { label: "Baixa", color: "#8a8a82" },
};

const AREAS = ["Comercial", "Produção", "Decoração", "Financeiro", "Logística", "Geral"];

export default function Tarefas({ defaultAssignee = "" }: { defaultAssignee?: string }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // new-task form
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState(
    defaultAssignee && defaultAssignee !== "Equipa" ? defaultAssignee : "",
  );
  const [area, setArea] = useState("");

  // filter
  const [who, setWho] = useState<string>("Todos");

  // inline edit
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskFields, setEditTaskFields] = useState({
    title: "",
    priority: "normal" as TaskPriority,
    dueDate: "",
    assignee: "",
    area: "",
  });

  function startEditTask(t: Task) {
    setEditingTaskId(t.id);
    setEditTaskFields({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ?? "",
      assignee: t.assignee ?? "",
      area: t.area ?? "",
    });
  }

  async function saveEditTask(id: string) {
    // Keep the pre-edit list so we can undo if the save doesn't stick.
    const snapshot = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, ...editTaskFields, title: editTaskFields.title.trim() || t.title }
          : t,
      ),
    );
    setEditingTaskId(null);
    try {
      const res = await fetch(`/api/tarefas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editTaskFields,
          title: editTaskFields.title.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks(snapshot);
      toast("Não foi possível guardar as alterações. Tente novamente.", "error");
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tarefas", { cache: "no-store" });
        if (res.ok) setTasks(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function add() {
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          priority,
          dueDate: dueDate || undefined,
          assignee: assignee.trim() || undefined,
          area: area || undefined,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTasks((prev) => [task, ...prev]);
        setTitle("");
        setDueDate("");
        setPriority("normal");
        setArea("");
        setAssignee(defaultAssignee && defaultAssignee !== "Equipa" ? defaultAssignee : "");
      } else {
        toast("Não foi possível criar a tarefa. Tente novamente.", "error");
      }
    } catch {
      toast("Erro de ligação. Verifique a internet e tente novamente.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(task: Task) {
    // Optimistic tick, but undo it if the server rejects — otherwise the box
    // stays flipped while the task is unchanged, and desyncs on next reload.
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    try {
      const res = await fetch(`/api/tarefas/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks(snapshot);
      toast("Não foi possível atualizar a tarefa. Tente novamente.", "error");
    }
  }

  async function remove(id: string) {
    const t = tasks.find((x) => x.id === id);
    // Only confirm when there's real content to lose (skip trivial empties).
    if (t && !confirm(`Eliminar a tarefa "${t.title}"?`)) return;
    const snapshot = tasks;
    setTasks((prev) => prev.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/tarefas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setTasks(snapshot);
      toast("Não foi possível eliminar a tarefa. Tente novamente.", "error");
    }
  }

  const people = useMemo(
    () => [
      "Todos",
      ...Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean) as string[])),
    ],
    [tasks],
  );

  const visible = who === "Todos" ? tasks : tasks.filter((t) => t.assignee === who);
  const open = visible.filter((t) => !t.done);
  const done = visible.filter((t) => t.done);
  const order: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };
  open.sort((a, b) => {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate)
      return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return order[a.priority] - order[b.priority];
  });

  const todayStr = todayKey();

  function row(t: Task) {
    const overdue = t.dueDate && !t.done && t.dueDate < todayStr;

    if (editingTaskId === t.id) {
      return (
        <div
          key={t.id}
          className="px-4 py-3 border-b border-foreground/[0.06] bg-foreground/[0.015]"
        >
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              value={editTaskFields.title}
              onChange={(e) => setEditTaskFields({ ...editTaskFields, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditTask(t.id);
                if (e.key === "Escape") setEditingTaskId(null);
              }}
              className="bo-input px-3 py-2 text-sm text-foreground/70 w-full"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={editTaskFields.priority}
                onChange={(e) =>
                  setEditTaskFields({ ...editTaskFields, priority: e.target.value as TaskPriority })
                }
                className="bo-input px-2 py-1.5 text-xs text-foreground/60"
              >
                <option value="alta">Alta</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </select>
              <input
                type="date"
                value={editTaskFields.dueDate}
                onChange={(e) => setEditTaskFields({ ...editTaskFields, dueDate: e.target.value })}
                className="bo-input px-2 py-1.5 text-xs text-foreground/60 flex-1"
              />
              <input
                value={editTaskFields.assignee}
                onChange={(e) => setEditTaskFields({ ...editTaskFields, assignee: e.target.value })}
                placeholder="Responsável"
                className="bo-input px-2 py-1.5 text-xs text-foreground/60 flex-1 min-w-[100px]"
              />
              <select
                value={editTaskFields.area}
                onChange={(e) => setEditTaskFields({ ...editTaskFields, area: e.target.value })}
                className="bo-input px-2 py-1.5 text-xs text-foreground/60"
              >
                <option value="">Área…</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveEditTask(t.id)} className="flex-1">
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingTaskId(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={t.id}
        className="group flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.02] transition-colors"
      >
        <button
          onClick={() => toggle(t)}
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${t.done ? "bg-[#4d6350] border-[#4d6350]" : "border-foreground/25 hover:border-[#4d6350]/60"}`}
        >
          {t.done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6l2.5 2.5L10 3"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm truncate ${t.done ? "text-foreground/30 line-through" : "text-foreground/70"}`}
          >
            {t.title}
          </p>
          <div className="text-[10px] mt-0.5 flex items-center gap-2 flex-wrap">
            {t.dueDate && (
              <span className={overdue ? "text-[#b5654a]" : "text-foreground/30"}>
                {overdue ? "Atrasada · " : ""}
                {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-PT", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
            {t.area && (
              <span className="text-foreground/30 border border-foreground/12 rounded px-1.5 py-0.5">
                {t.area}
              </span>
            )}
            {t.clientName && <span className="text-foreground/25">{t.clientName}</span>}
          </div>
        </div>
        {t.assignee && (
          <span
            className="hidden sm:flex items-center gap-1.5 shrink-0"
            title={`Responsável: ${t.assignee}`}
          >
            <span className="w-5 h-5 rounded-full bg-[#4d6350] text-white flex items-center justify-center text-[9px] font-bold">
              {t.assignee.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-foreground/35 text-[10px]">{t.assignee}</span>
          </span>
        )}
        {!t.done && (
          <span
            className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-sm shrink-0"
            style={{
              background: `${PRIORITY_META[t.priority].color}22`,
              color: PRIORITY_META[t.priority].color,
            }}
          >
            {PRIORITY_META[t.priority].label}
          </span>
        )}
        {!t.done && (
          <button
            onClick={() => startEditTask(t)}
            className="text-foreground/20 hover:text-[#4d6350] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            aria-label="Editar tarefa"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => remove(t.id)}
          className="text-foreground/20 hover:text-[#b5654a] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
          aria-label="Eliminar"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Add task */}
      <Card className="mb-6">
        <Field
          label="Nova tarefa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="O que há para fazer?"
        />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field
            label="Responsável"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Ex.: Catarina"
          />
          <Field as="select" label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Sem área</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            label="Prioridade"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baixa">Baixa</option>
          </Field>
          <Field
            label="Prazo"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={add} loading={adding} disabled={!title.trim()}>
            Adicionar tarefa
          </Button>
        </div>
      </Card>

      {/* Filter by person */}
      {people.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {defaultAssignee && people.includes(defaultAssignee) && (
            <Button
              size="sm"
              variant={who === defaultAssignee ? "primary" : "subtle"}
              onClick={() => setWho(who === defaultAssignee ? "Todos" : defaultAssignee)}
              iconLeft={
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              }
            >
              Minhas tarefas
            </Button>
          )}
          {people.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={who === p ? "primary" : "ghost"}
              aria-pressed={who === p}
              onClick={() => setWho(p)}
            >
              {p}
              {p !== "Todos" && (
                <span className="ml-1 text-[11px] tabular-nums opacity-60">
                  {tasks.filter((t) => t.assignee === p && !t.done).length}
                </span>
              )}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 sm:px-6 py-3.5 border-b border-foreground/[0.07] flex items-center justify-between">
              <p className="bo-eyebrow">A fazer ({open.length})</p>
            </div>
            <div className="divide-y divide-foreground/[0.06]">
              {open.length === 0 ? (
                <EmptyState
                  icon={
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      aria-hidden="true"
                    >
                      <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
                      <path
                        d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"
                        strokeLinecap="round"
                      />
                    </svg>
                  }
                  title="Tudo em dia"
                  description="Não há tarefas pendentes. Adicione uma acima para começar a organizar a equipa."
                />
              ) : (
                open.map(row)
              )}
            </div>
          </Card>

          {done.length > 0 && (
            <div className="mt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDone(!showDone)}
                aria-expanded={showDone}
                className="mb-2 tracking-[0.12em] uppercase"
              >
                {showDone ? "▾" : "▸"} Concluídas ({done.length})
              </Button>
              {showDone && (
                <Card padding="none" className="overflow-hidden divide-y divide-foreground/[0.06]">
                  {done.map(row)}
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
