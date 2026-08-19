"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskPriority } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { todayKey } from "./util";
import { Button, Card, EmptyState, Field, MenuDeAccoes, type AccaoDeItem } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { metaFor } from "./status-meta";

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  alta: { label: "Alta", color: "#b5654a" },
  normal: { label: "Normal", color: "#9aa36a" },
  baixa: { label: "Baixa", color: "#8a8a82" },
};

const AREAS = ["Comercial", "Produção", "Decoração", "Financeiro", "Logística", "Geral"];

const PRIORITY_ORDER: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };

/* Os dois ícones da linha, escritos uma vez: o mesmo desenho serve os botões
   soltos do computador e os itens do menu «⋯» do dedo. */
const LapisIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

const CaixoteIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Uma linha da lista, memoizada.
 *
 * O título da tarefa nova é estado DESTE ecrã, por isso cada tecla escrita em
 * "O que há para fazer?" voltava a desenhar a lista inteira — e, de caminho, a
 * refazer o `filter`/`sort` das tarefas (que também estavam fora de qualquer
 * `useMemo`). Com a linha atrás de `memo()` e os derivados memoizados, escrever
 * deixa de tocar na lista: nenhuma linha muda enquanto se escreve um título.
 */
const TaskRow = memo(function TaskRow({
  t,
  overdue,
  onToggle,
  onEdit,
  onRemove,
}: {
  t: Task;
  overdue: boolean;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onRemove: (id: string) => void;
}) {
  return (
    /* ── LINHA DE TABELA NO COMPUTADOR, CARTÃO DE DUAS LINHAS NO TELEMÓVEL ──
       MEDIDO a 390×844: o título mostrava 113 px dos 1009 de que precisava —
       11 %. A causa era esta fila: seis colunas a disputar 342 px, e o título o
       único com `min-w-0`, portanto o único que cede. Com `truncate` por cima,
       lia-se «Confirmar com a Herda…» dezasseis vezes seguidas.

       A conversão é a que os outros cartões do back office já fazem — e faz-se com
       `flex-wrap` SOZINHO, sem ponto de corte por viewport: a fila quebra
       quando não cabe, que é a pergunta certa (a lição das linhas de grupo do
       estúdio, em MOBILE-AUDIT.md). O mínimo no título é o que faz o
       `flex-wrap` disparar — sem ele, o título encolhe até 0 em vez de empurrar
       os controlos para a linha de baixo.

       Fica assim no telemóvel:
         linha 1 · [concluir 44px] título inteiro, a quebrar as linhas que
                   precisar, com o prazo/área/cliente por baixo;
         linha 2 · prioridade, editar e eliminar, todos com o tamanho da casa.
       No computador nada muda: tudo cabe numa fila e o título volta a cortar
       (`sm:truncate`), que é o que mantém a densidade da lista. */
    <div className="group flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-5 sm:py-3.5 hover:bg-foreground/[0.02] transition-colors">
      <button
        onClick={() => onToggle(t)}
        // Sem nome acessível, isto era «botão» — dezasseis vezes, e é o que
        // risca a tarefa. `aria-pressed` diz em que estado está sem depender da
        // cor do quadrado.
        aria-label={t.done ? "Marcar como por concluir" : "Marcar como concluída"}
        aria-pressed={t.done}
        /* ── 20×20 ENTRE DOIS ALVOS DE 44 ────────────────────────────────
           MEDIDO: 20×20 px, dezasseis vezes na lista, encostado ao «Editar»
           e ao «Eliminar» que já são 44. Era o vizinho que ficou de fora.

           O quadrado desenhado continua com 20 px — quem cresce é o alvo à
           volta, como no rótulo da lista de pedidos. O `p-2` com `-m-2`
           dá-lhe 36 px para o rato sem ocupar mais espaço na linha, e o
           `alvo-toque` leva-o aos 44 no dedo (só sob `(pointer: coarse)`,
           ver globals.css — o portátil mantém a densidade que tem). */
        className="alvo-toque -m-2 flex shrink-0 items-center justify-center p-2"
      >
        <span
          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${t.done ? "bg-[#4d6350] border-[#4d6350]" : "border-foreground/25 group-hover:border-[#4d6350]/60"}`}
        >
          {t.done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 6l2.5 2.5L10 3"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm break-words sm:truncate ${t.done ? "text-foreground/30 line-through" : "text-foreground/70"}`}
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
      {/* ── A SEGUNDA LINHA DO CARTÃO ────────────────────────────────────────
          `w-full` num contentor que quebra é o que garante uma linha só para os
          controlos — não é uma percentagem calculada à sorte que às vezes ainda
          deixava a etiqueta de prioridade subir para junto do título.

          E `sm:contents` faz esta caixa DESAPARECER a partir de `sm`: os filhos
          voltam a ser filhos directos da fila, com o mesmo espaçamento de
          sempre. É por isso que a linha do computador fica byte a byte como
          estava, em vez de ser um segundo desenho a manter em paralelo. */}
      <div className="flex w-full items-center gap-2 sm:contents">
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
              background: `${metaFor(PRIORITY_META, t.priority).color}22`,
              color: metaFor(PRIORITY_META, t.priority).color,
            }}
          >
            {metaFor(PRIORITY_META, t.priority).label}
          </span>
        )}
        {/* ══ AS ACÇÕES DA TAREFA, EM DUAS FORMAS ═══════════════════════════
            A mesma lista desenhada de duas maneiras, e quem escolhe é o CSS
            (`com-rato:` / `sem-rato:`, globals.css) — não o JavaScript, para
            não haver um primeiro desenho errado a piscar antes do certo.

            COM RATO: os dois ícones soltos, revelados ao pairar. É o desenho
            que estava, e fica byte a byte igual.

            SEM RATO: um «⋯» só. MEDIDO a 375×667 com dedo: 40 alvos de 44 px
            visíveis ao mesmo tempo em 20 linhas, dois por linha, dentro de uma
            fila que já tinha o título, o prazo, a área e a prioridade. Com o
            menu passam a 20 — um por linha.

            E MEDIDO a 768×1024 com dedo (o iPad em retrato): ZERO dos 40
            visíveis. 768 passa dos 640 do `sm:` sem ganhar rato nenhum,
            portanto `sm:opacity-0` disparava e não havia como o desfazer —
            editar e eliminar uma tarefa não existiam ali. Esse era o defeito
            grave; o de cima é o que se vê.

            «Eliminar» vai para dentro do menu, com separador e a vermelho:
            no dedo, apagar encostado a editar é um engano à espera. */}
        {/* `com-rato:contents` e não `com-rato:flex`: a caixa existe para poder
            desaparecer sem rato, mas COM rato tem de desaparecer ela própria —
            com `display: contents` os dois botões voltam a ser filhos directos
            da fila, com o espaçamento da fila. MEDIDO com `flex`: 5959 píxeis
            diferentes a 1280×900, porque um `gap-2` novo se metia onde o
            `gap-x-3` da linha mandava. É o mesmo truque que o `sm:contents`
            aqui ao lado já usa, e pela mesma razão. */}
        <div className="hidden com-rato:contents">
          {!t.done && (
            <button
              onClick={() => onEdit(t)}
              /* ── UM ALVO DE 13 PX AO LADO DE «ELIMINAR» ──────────────────────
                 MEDIDO num 390×844 com `(pointer: coarse)`: este botão dava
                 13×13 px e o de eliminar 14×14, a 12 px um do outro. O mínimo da
                 casa é 44 (`.alvo-toque` em globals.css, e é lá que ele existe —
                 só no dedo, para o portátil manter a densidade que tem); o da
                 WCAG 2.2 AA é 24, e com rato nem isso se cumpria.

                 `alvo-toque` resolve o dedo; o `p-1.5` resolve o rato — leva o
                 desenho de 13 para 25 px SEM crescer a linha (a coluna do título
                 já mede 34) e sem margens negativas, que era o que voltaria a
                 encostar os dois um ao outro. O ícone continua com 13 px. */
              className="alvo-toque p-1.5 text-foreground/20 hover:text-[#4d6350] transition-colors opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 shrink-0"
              aria-label="Editar tarefa"
            >
              {LapisIcon}
            </button>
          )}
          <button
            onClick={() => onRemove(t.id)}
            // O mesmo tratamento do «Editar tarefa» acima, e pela mesma razão —
            // este é o que apaga, portanto é o que mais custa acertar ao lado.
            className="alvo-toque p-1.5 text-foreground/20 hover:text-[#b5654a] transition-colors opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 shrink-0"
            aria-label="Eliminar"
          >
            {CaixoteIcon}
          </button>
        </div>
        <MenuDeAccoes
          className="com-rato:hidden shrink-0"
          sobre={t.title}
          accoes={[
            ...(t.done
              ? []
              : [
                  {
                    id: "editar",
                    rotulo: "Editar tarefa",
                    icone: LapisIcon,
                    onAccao: () => onEdit(t),
                  } satisfies AccaoDeItem,
                ]),
            {
              id: "eliminar",
              rotulo: "Eliminar",
              icone: CaixoteIcon,
              destrutiva: true,
              onAccao: () => onRemove(t.id),
            },
          ]}
        />
      </div>
    </div>
  );
});

export default function Tarefas({ defaultAssignee = "" }: { defaultAssignee?: string }) {
  const { toast } = useToast();
  const {
    data: tasks = [],
    setData: setTasks,
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<Task[]>("tarefas", "/api/tarefas");
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

  // A lista actual, sempre à mão para os manipuladores optimistas, sem os
  // obrigar a mudar de identidade a cada alteração (o que desfaria o `memo()`
  // das linhas).
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  });

  const startEditTask = useCallback((t: Task) => {
    setEditingTaskId(t.id);
    setEditTaskFields({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ?? "",
      assignee: t.assignee ?? "",
      area: t.area ?? "",
    });
  }, []);

  async function saveEditTask(id: string) {
    // Repõe-se ESTA tarefa, não a lista. Ver a nota sobre a reposição em `toggle`.
    const anterior = tasksRef.current.find((t) => t.id === id);
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
      if (anterior) setTasks((prev) => prev.map((t) => (t.id === id ? anterior : t)));
      toast("Não foi possível guardar as alterações. Tenta novamente.", "error");
    }
  }

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
        toast("Não foi possível criar a tarefa. Tenta novamente.", "error");
      }
    } catch {
      toast("Erro de ligação. Verifica a internet e tenta novamente.", "error");
    } finally {
      setAdding(false);
    }
  }

  const toggle = useCallback(
    async (task: Task) => {
      // Optimistic tick, but undo it if the server rejects — otherwise the box
      // stays flipped while the task is unchanged, and desyncs on next reload.
      //
      // A reposição é DESTA tarefa e mais nenhuma. Repor a lista inteira (que era
      // o que se fazia) desfazia tudo o que tivesse gravado bem enquanto este
      // pedido estava a caminho: ela risca uma tarefa, o pedido lento de outra
      // volta com erro, e a primeira desmarca-se sozinha no ecrã apesar de estar
      // concluída no servidor — o desfecho que o `touch` do `tasks-store` existe
      // para impedir, só que aqui sem servidor nenhum pelo meio.
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
      try {
        const res = await fetch(`/api/tarefas/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: !task.done }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
        toast("Não foi possível atualizar a tarefa. Tenta novamente.", "error");
      }
    },
    [setTasks, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      // Only confirm when there's real content to lose (skip trivial empties).
      if (t && !confirm(`Eliminar a tarefa "${t.title}"?`)) return;
      // Guardamos a tarefa e o sítio dela, não a lista: se a eliminação for
      // recusada devolve-se ESTA linha ao lugar sem mexer no que outras
      // gravações tenham feito entretanto (ver a nota em `toggle`).
      const posicao = tasksRef.current.findIndex((x) => x.id === id);
      setTasks((prev) => prev.filter((x) => x.id !== id));
      try {
        const res = await fetch(`/api/tarefas/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        if (t)
          setTasks((prev) => {
            if (prev.some((x) => x.id === id)) return prev;
            const onde = Math.min(posicao < 0 ? prev.length : posicao, prev.length);
            return [...prev.slice(0, onde), t, ...prev.slice(onde)];
          });
        toast("Não foi possível eliminar a tarefa. Tenta novamente.", "error");
      }
    },
    [setTasks, toast],
  );

  // Uma passagem só: as pessoas, e quantas tarefas por fazer tem cada uma. Antes
  // cada botão de pessoa varria a lista toda (`tasks.filter`) a cada render.
  const { people, openByPerson } = useMemo(() => {
    const counts = new Map<string, number>();
    const seen: string[] = [];
    for (const t of tasks) {
      if (!t.assignee) continue;
      if (!counts.has(t.assignee)) {
        counts.set(t.assignee, 0);
        seen.push(t.assignee);
      }
      if (!t.done) counts.set(t.assignee, counts.get(t.assignee)! + 1);
    }
    return { people: ["Todos", ...seen], openByPerson: counts };
  }, [tasks]);

  // Filtrar e ordenar acontecia em CADA render — inclusive a cada tecla escrita
  // no campo "Nova tarefa", que é estado deste componente. Só depende da lista
  // e do filtro de pessoa.
  const { open, done } = useMemo(() => {
    const visible = who === "Todos" ? tasks : tasks.filter((t) => t.assignee === who);
    const openTasks = visible.filter((t) => !t.done);
    const doneTasks = visible.filter((t) => t.done);
    openTasks.sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate)
        return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });
    return { open: openTasks, done: doneTasks };
  }, [tasks, who]);

  const todayStr = todayKey();

  function row(t: Task) {
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
      <TaskRow
        key={t.id}
        t={t}
        overdue={!!t.dueDate && !t.done && t.dueDate < todayStr}
        onToggle={toggle}
        onEdit={startEditTask}
        onRemove={remove}
      />
    );
  }

  // A falha ANTES de tudo: sem isto, uma leitura que rebentou desenhava
  // "Tudo em dia — não há tarefas pendentes". É a frase mais tranquilizadora do
  // ecrã, e é exactamente o contrário do que se sabe. Ela fecha o separador e
  // vai fazer outra coisa, com a semana da montagem por combinar.
  if (error && tasks.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as tarefas"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Add task — a single, obvious primary action; the optional detail fields
          (responsável, área, prioridade, prazo) collapse behind a disclosure so
          the daily "add a to-do" flow stays a title + one button. */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            containerClassName="flex-1"
            label="Nova tarefa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="O que há para fazer?"
          />
          <Button
            onClick={add}
            loading={adding}
            disabled={!title.trim()}
            className="w-full shrink-0 sm:w-auto"
          >
            Adicionar
          </Button>
        </div>
        <details className="group mt-3">
          {/* ── 122×15 NUM TELEMÓVEL ────────────────────────────────────────
              MEDIDO a 375 px: este interruptor tinha 15 px de altura — um
              terço do mínimo de 44 — e é a ÚNICA porta para o responsável, o
              prazo e a área de uma tarefa nova. Num telemóvel, falhar-lhe o
              toque é ficar sem esses campos.

              Escapou a todos os varrimentos porque um `<summary>` não é
              `<button>`, não tem `role` e não tem `tabindex` escrito: a rede da
              ergonomia táctil não o via (agora vê — ver `ergonomia-tactil.mjs`).

              `alvo-toque` cresce só sob `(pointer: coarse)`, portanto no
              portátil a linha fica exactamente como estava; `!justify-start`
              porque o conteúdo é uma seta e um rótulo alinhados à esquerda, e
              a classe centra por omissão. */}
          <summary className="alvo-toque !justify-start bo-eyebrow inline-flex cursor-pointer list-none items-center gap-1.5 text-foreground/55 hover:text-foreground/75 [&::-webkit-details-marker]:hidden">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="motion-safe:transition-transform group-open:rotate-90"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            Detalhes (opcional)
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Responsável"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              // Um cargo, não uma pessoa: o nome de uma colega verdadeira num
              // exemplo acaba por sair daqui para sítios onde não devia estar.
              placeholder="Ex.: quem fica responsável"
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
        </details>
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
                  {openByPerson.get(p) ?? 0}
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
                  description="Não há tarefas pendentes. Adiciona uma acima para começar a organizar a equipa."
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
