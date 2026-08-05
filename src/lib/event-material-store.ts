import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { EventMaterial, EventMaterialStatus, Veiculo } from "./event-material-types";

/** A checklist de material de um evento (o cabeçalho; as linhas ao lado). */
export type { EventMaterial } from "./event-material-types";

export const mapper: Mapper<EventMaterial> = {
  table: "event_material",
  fileName: "event-material.json",
  getId: (e) => e.id,
  toRow: (e) => ({
    id: e.id,
    quote_id: e.quoteId,
    status: e.status,
    generated_at: e.generatedAt,
    vehicles: e.vehicles,
    notes: e.notes || null,
    updated_at: e.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    quoteId: String(r.quote_id ?? ""),
    status: (r.status as EventMaterialStatus) ?? "preparada",
    generatedAt: String(r.generated_at ?? new Date().toISOString()),
    vehicles: Array.isArray(r.vehicles) ? (r.vehicles as Veiculo[]) : [],
    notes: (r.notes as string) ?? undefined,
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }),
  order: { column: "generated_at", ascending: false },
  fileCompare: (a, b) => b.generatedAt.localeCompare(a.generatedAt),
  touch: true,
  beforeUpdate: (e) => ({ ...e, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const listEventMaterial = (): Promise<EventMaterial[]> => repo.list();
export const getEventMaterial = (id: string): Promise<EventMaterial | null> => repo.get(id);

export async function getForQuote(quoteId: string): Promise<EventMaterial | null> {
  return (await repo.list()).find((e) => e.quoteId === quoteId) ?? null;
}

/**
 * A checklist deste evento, criando-a só se ainda não existir.
 *
 * Verificar e criar em dois passos é uma corrida: dois "gerar" ao mesmo tempo
 * leem ambos "não existe" e criam ambos, e as marcações passam a dividir-se por
 * duas checklists. O índice único em `quote_id` é a rede verdadeira; aqui
 * apanha-se o choque e devolve-se a que ganhou, para quem perdeu continuar a
 * trabalhar em vez de ver um erro que não sabe explicar.
 */
export async function obterOuCriarParaPedido(quoteId: string): Promise<EventMaterial> {
  const existente = await getForQuote(quoteId);
  if (existente) return existente;
  try {
    return await createEventMaterial({ quoteId, status: "preparada", vehicles: [] });
  } catch {
    const depois = await getForQuote(quoteId);
    if (depois) return depois;
    throw new Error("não foi possível criar a checklist");
  }
}

export async function createEventMaterial(
  input: Omit<EventMaterial, "id" | "generatedAt" | "updatedAt"> & { id?: string },
): Promise<EventMaterial> {
  const agora = new Date().toISOString();
  const e: EventMaterial = {
    ...input,
    id: input.id || randomUUID(),
    generatedAt: agora,
    updatedAt: agora,
  };
  await repo.create(e);
  return e;
}

export const updateEventMaterial = (
  id: string,
  patch: Partial<EventMaterial>,
): Promise<EventMaterial | null> => repo.update(id, patch);

export const deleteEventMaterial = (id: string): Promise<void> => repo.remove(id);
