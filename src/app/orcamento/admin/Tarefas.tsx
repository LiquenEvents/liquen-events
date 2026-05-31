'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Task, TaskPriority } from '../types';

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  alta:   { label: 'Alta',   color: '#b5654a' },
  normal: { label: 'Normal', color: '#6a9c7a' },
  baixa:  { label: 'Baixa',  color: '#8a8a82' },
};

const AREAS = ['Comercial', 'Produção', 'Decoração', 'Financeiro', 'Logística', 'Geral'];

export default function Tarefas({ defaultAssignee = '' }: { defaultAssignee?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // new-task form
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee && defaultAssignee !== 'Equipa' ? defaultAssignee : '');
  const [area, setArea] = useState('');

  // filter
  const [who, setWho] = useState<string>('Todos');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tarefas', { cache: 'no-store' });
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
      const res = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t, priority,
          dueDate: dueDate || undefined,
          assignee: assignee.trim() || undefined,
          area: area || undefined,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTasks((prev) => [task, ...prev]);
        setTitle(''); setDueDate(''); setPriority('normal'); setArea('');
        setAssignee(defaultAssignee && defaultAssignee !== 'Equipa' ? defaultAssignee : '');
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggle(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await fetch(`/api/tarefas/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !task.done }) });
  }

  async function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tarefas/${id}`, { method: 'DELETE' });
  }

  const people = useMemo(
    () => ['Todos', ...Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean) as string[]))],
    [tasks]
  );

  const visible = who === 'Todos' ? tasks : tasks.filter((t) => t.assignee === who);
  const open = visible.filter((t) => !t.done);
  const done = visible.filter((t) => t.done);
  const order: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };
  open.sort((a, b) => {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return order[a.priority] - order[b.priority];
  });

  const todayKey = new Date().toISOString().slice(0, 10);

  function row(t: Task) {
    const overdue = t.dueDate && !t.done && t.dueDate < todayKey;
    return (
      <div key={t.id} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-moss/4 transition-colors">
        <button onClick={() => toggle(t)} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${t.done ? 'bg-moss border-moss' : 'border-foreground/25 hover:border-moss/60'}`}>
          {t.done && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm truncate ${t.done ? 'text-foreground/30 line-through' : 'text-foreground/70'}`}>{t.title}</p>
          <div className="text-[10px] mt-0.5 flex items-center gap-2 flex-wrap">
            {t.dueDate && <span className={overdue ? 'text-[#b5654a]' : 'text-foreground/30'}>{overdue ? 'Atrasada · ' : ''}{new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</span>}
            {t.area && <span className="text-foreground/30 border border-foreground/12 rounded px-1.5 py-0.5">{t.area}</span>}
            {t.clientName && <span className="text-foreground/25">{t.clientName}</span>}
          </div>
        </div>
        {t.assignee && (
          <span className="hidden sm:flex items-center gap-1.5 shrink-0" title={`Responsável: ${t.assignee}`}>
            <span className="w-5 h-5 rounded-full bg-moss/20 text-moss flex items-center justify-center text-[9px] font-bold">{t.assignee.slice(0, 1).toUpperCase()}</span>
            <span className="text-foreground/35 text-[10px]">{t.assignee}</span>
          </span>
        )}
        {!t.done && <span className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-sm shrink-0" style={{ background: `${PRIORITY_META[t.priority].color}22`, color: PRIORITY_META[t.priority].color }}>{PRIORITY_META[t.priority].label}</span>}
        <button onClick={() => remove(t.id)} className="text-foreground/20 hover:text-[#b5654a] transition-colors opacity-0 group-hover:opacity-100 shrink-0" aria-label="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    );
  }

  const inputCls = "bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45";

  return (
    <div className="max-w-4xl">
      {/* Add task */}
      <div className="border border-foreground/10 rounded-md bg-surface-raised/30 p-4 mb-6">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="O que há para fazer?" className={`${inputCls} w-full mb-2`} />
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Responsável (ex: Catarina)" className={`${inputCls} flex-1`} />
          <select value={area} onChange={(e) => setArea(e.target.value)} className={`${inputCls} text-xs`}>
            <option value="">Área…</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={`${inputCls} text-xs`}>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baixa">Baixa</option>
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${inputCls} text-xs`} />
          <button onClick={add} disabled={adding || !title.trim()} className={`px-5 py-2 rounded-md text-[11px] tracking-[0.2em] uppercase transition-colors shrink-0 ${adding || !title.trim() ? 'bg-moss/40 text-cream/50 cursor-not-allowed' : 'bg-moss text-cream hover:bg-moss-dark'}`}>Adicionar</button>
        </div>
      </div>

      {/* Filter by person */}
      {people.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {people.map((p) => (
            <button key={p} onClick={() => setWho(p)} className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${who === p ? 'bg-moss border-moss text-cream' : 'border-foreground/15 text-foreground/35 hover:border-foreground/30'}`}>
              {p}{p !== 'Todos' && <span className="ml-1.5 text-[9px] opacity-60">{tasks.filter((t) => t.assignee === p && !t.done).length}</span>}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-foreground/25 text-sm py-12 text-center">A carregar…</p>
      ) : (
        <>
          <div className="border border-foreground/10 rounded-md bg-surface-raised/30 overflow-hidden">
            <div className="px-5 py-3 border-b border-foreground/8 flex items-center justify-between">
              <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">A fazer ({open.length})</p>
            </div>
            <div className="divide-y divide-foreground/6">
              {open.length === 0 ? <p className="text-foreground/25 text-sm text-center py-12">Sem tarefas pendentes. ✓</p> : open.map(row)}
            </div>
          </div>

          {done.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowDone(!showDone)} className="text-foreground/35 text-[10px] tracking-[0.2em] uppercase hover:text-foreground/60 transition-colors mb-2">
                {showDone ? '▾' : '▸'} Concluídas ({done.length})
              </button>
              {showDone && (
                <div className="border border-foreground/10 rounded-md bg-surface-raised/20 overflow-hidden divide-y divide-foreground/6">
                  {done.map(row)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
