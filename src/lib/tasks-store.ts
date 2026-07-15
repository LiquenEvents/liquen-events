import { randomUUID } from "node:crypto";
import type { Task } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<Task> = {
  table: "tasks",
  fileName: "tasks.json",
  getId: (t) => t.id,
  toRow: (t) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    priority: t.priority,
    due_date: t.dueDate || null,
    quote_id: t.quoteId || null,
    client_name: t.clientName || null,
    assignee: t.assignee || null,
    area: t.area || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    done: Boolean(r.done),
    priority: (r.priority as Task["priority"]) ?? "normal",
    dueDate: (r.due_date as string) ?? undefined,
    quoteId: (r.quote_id as string) ?? undefined,
    clientName: (r.client_name as string) ?? undefined,
    assignee: (r.assignee as string) ?? undefined,
    area: (r.area as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
};

const repo = createRepository(mapper);

export const listTasks = (): Promise<Task[]> => repo.list();

export async function createTask(
  input: Omit<Task, "id" | "createdAt" | "done"> & { done?: boolean },
): Promise<Task> {
  const task: Task = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    done: input.done ?? false,
    title: input.title,
    priority: input.priority,
    dueDate: input.dueDate,
    quoteId: input.quoteId,
    clientName: input.clientName,
    assignee: input.assignee,
    area: input.area,
  };
  await repo.create(task);
  return task;
}

export const updateTask = (id: string, updates: Partial<Task>): Promise<Task | null> =>
  repo.update(id, updates);

export const deleteTask = (id: string): Promise<void> => repo.remove(id);
