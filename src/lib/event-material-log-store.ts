import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { AccaoOffline } from "./material-offline";

/**
 * O REGISTO: quem marcou o quê e quando.
 *
 * Guarda também as marcações que PERDERAM um conflito (`superseded`). Uma
 * marcação que desaparece sem rasto é o que faz duas pessoas discutirem sobre
 * quem carregou o escadote — e ninguém consegue provar nada.
 */
export interface EventMaterialLog {
  id: string;
  eventId: string;
  itemId: string;
  action: AccaoOffline;
  value?: string;
  actor: string;
  /** Relógio de quem marcou. Pode vir do passado: o telemóvel esteve offline. */
  markedAt: string;
  /** Relógio do servidor, quando a marcação chegou. */
  syncedAt: string;
  /** Chegou, mas perdeu para uma mais recente. */
  superseded: boolean;
}

export const mapper: Mapper<EventMaterialLog> = {
  table: "event_material_log",
  fileName: "event-material-log.json",
  getId: (l) => l.id,
  toRow: (l) => ({
    id: l.id,
    event_id: l.eventId,
    item_id: l.itemId,
    action: l.action,
    value: l.value || null,
    actor: l.actor,
    marked_at: l.markedAt,
    synced_at: l.syncedAt,
    superseded: l.superseded,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    eventId: String(r.event_id ?? ""),
    itemId: String(r.item_id ?? ""),
    action: (r.action as AccaoOffline) ?? "loaded",
    value: (r.value as string) ?? undefined,
    actor: String(r.actor ?? ""),
    markedAt: String(r.marked_at ?? new Date().toISOString()),
    syncedAt: String(r.synced_at ?? new Date().toISOString()),
    superseded: Boolean(r.superseded),
  }),
  order: { column: "marked_at", ascending: false },
  fileCompare: (a, b) => b.markedAt.localeCompare(a.markedAt),
};

const repo = createRepository(mapper);

export const listAllLog = (): Promise<EventMaterialLog[]> => repo.list();

export async function listLogOf(eventId: string): Promise<EventMaterialLog[]> {
  return (await repo.list())
    .filter((l) => l.eventId === eventId)
    .sort((a, b) => b.markedAt.localeCompare(a.markedAt));
}

export async function registar(
  input: Omit<EventMaterialLog, "id" | "syncedAt"> & { id?: string },
): Promise<EventMaterialLog> {
  const l: EventMaterialLog = {
    ...input,
    id: input.id || randomUUID(),
    syncedAt: new Date().toISOString(),
  };
  await repo.create(l);
  return l;
}
