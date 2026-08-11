import "server-only";
import { randomUUID } from "node:crypto";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<CalendarEvent> = {
  table: "calendar_events",
  fileName: "calendar-events.json",
  getId: (e) => e.id,
  toRow: (e) => ({
    id: e.id,
    event_date: e.date,
    title: e.title,
    kind: e.kind,
    event_time: e.time || null,
    note: e.note || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: String(r.event_date ?? ""),
    title: String(r.title ?? ""),
    kind: (r.kind as CalendarEvent["kind"]) ?? "evento",
    time: (r.event_time as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "event_date", ascending: true },
  fileCompare: (a, b) => a.date.localeCompare(b.date),
  /**
   * SEM `touch`, e de propósito: esta tabela não tem caminho de actualização
   * nenhum. O store expõe `listCalendarEvents`, `createCalendarEvent` e
   * `deleteCalendarEvent`, a rota `/api/calendario/[id]` só tem `DELETE`, e uma
   * entrada corrige-se apagando e voltando a criar. Não havendo `update`, o
   * compare-and-set não protegeria escrita nenhuma — seria uma coluna a ser
   * escrita por ninguém.
   *
   * QUEM ACRESCENTAR AQUI UM `updateCalendarEvent` tem de fazer as duas metades
   * na mesma alteração: `alter table public.calendar_events add column if not
   * exists updated_at timestamptz` em `db/schema.sql` E `touch: true` aqui. Uma
   * sem a outra ou não protege nada, ou faz falhar todas as escritas.
   */
};

const repo = createRepository(mapper);

export const listCalendarEvents = (): Promise<CalendarEvent[]> => repo.list();

export async function createCalendarEvent(
  input: Omit<CalendarEvent, "id" | "createdAt">,
): Promise<CalendarEvent> {
  const event: CalendarEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    date: input.date,
    title: input.title,
    kind: input.kind,
    time: input.time,
    note: input.note,
  };
  await repo.create(event);
  return event;
}

export const deleteCalendarEvent = (id: string): Promise<void> => repo.remove(id);
