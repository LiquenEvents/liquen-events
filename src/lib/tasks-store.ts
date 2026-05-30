import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { Task } from "@/app/orcamento/types";
import { getSupabase } from "./supabase";

const TABLE = "tasks";
const DATA_FILE = path.join(process.cwd(), "data", "tasks.json");

async function fileRead(): Promise<Task[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}
async function fileWrite(tasks: Task[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2));
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
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
  };
}

export async function listTasks(): Promise<Task[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from(TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToTask);
  }
  const all = await fileRead();
  return all.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function createTask(input: Omit<Task, "id" | "createdAt" | "done"> & { done?: boolean }): Promise<Task> {
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
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).insert({
      id: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority,
      due_date: task.dueDate || null,
      quote_id: task.quoteId || null,
      client_name: task.clientName || null,
      assignee: task.assignee || null,
      area: task.area || null,
    });
    if (error) throw error;
    return task;
  }
  const all = await fileRead();
  all.push(task);
  await fileWrite(all);
  return task;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const sb = getSupabase();
  if (sb) {
    const patch: Record<string, unknown> = {};
    if ("done" in updates) patch.done = updates.done;
    if ("title" in updates) patch.title = updates.title;
    if ("priority" in updates) patch.priority = updates.priority;
    if ("dueDate" in updates) patch.due_date = updates.dueDate || null;
    if ("assignee" in updates) patch.assignee = updates.assignee || null;
    if ("area" in updates) patch.area = updates.area || null;
    const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return data ? rowToTask(data) : null;
  }
  const all = await fileRead();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...updates };
  await fileWrite(all);
  return all[idx];
}

export async function deleteTask(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const all = await fileRead();
  await fileWrite(all.filter((t) => t.id !== id));
}
