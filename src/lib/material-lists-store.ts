import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { MaterialList } from "./material-list-types";
import { listItemsOf, addListItem, removeItemsOf } from "./material-list-items-store";

/**
 * Listas base de material — conjuntos reutilizáveis.
 *
 * Uma lista base é uma receita: descreve o que costuma ir numa montagem
 * daquele tipo. A checklist de um evento é uma CÓPIA dela, e é por isso que
 * mudar a lista base nunca mexe em eventos já preparados.
 *
 * As LINHAS vivem no `material-list-items-store`, ao lado. Ver lá porquê.
 */
export type { MaterialList } from "./material-list-types";
export { quantidadePara, porCadaQuantos } from "./material-list-types";

export const mapper: Mapper<MaterialList> = {
  table: "material_lists",
  fileName: "material-lists.json",
  getId: (l) => l.id,
  toRow: (l) => ({
    id: l.id,
    name: l.name,
    is_default: l.isDefault,
    notes: l.notes || null,
    created_at: l.createdAt,
    updated_at: l.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    isDefault: Boolean(r.is_default),
    notes: (r.notes as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
  touch: true,
  beforeUpdate: (l) => ({ ...l, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const newListId = (): string => randomUUID();

export const listLists = (): Promise<MaterialList[]> => repo.list();
export const getList = (id: string): Promise<MaterialList | null> => repo.get(id);

export async function createList(
  input: Omit<MaterialList, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<MaterialList> {
  const agora = new Date().toISOString();
  const l: MaterialList = {
    ...input,
    id: input.id || newListId(),
    createdAt: agora,
    updatedAt: agora,
  };
  await repo.create(l);
  return l;
}

export const updateList = (
  id: string,
  patch: Partial<MaterialList>,
): Promise<MaterialList | null> => repo.update(id, patch);

/**
 * Apaga a lista E as suas linhas.
 *
 * O `on delete cascade` só existe no Supabase; em ficheiro, quem limpa somos
 * nós. Sem isto, um ambiente de desenvolvimento acumulava linhas órfãs que
 * ninguém via e que voltavam a aparecer se um id fosse reutilizado.
 */
export async function deleteList(id: string): Promise<void> {
  await removeItemsOf(id);
  await repo.remove(id);
}

/**
 * Duplica uma lista com as suas linhas, com ids NOVOS.
 *
 * Ids novos e não os mesmos: a cópia é uma lista independente, e partilhar ids
 * faria editar uma mexer na outra — o contrário de duplicar.
 *
 * A cópia nunca herda o `isDefault`: só uma lista vai sempre a todos os
 * eventos, e duplicar essa não pode criar uma segunda calada.
 */
export async function duplicateList(id: string, nome: string): Promise<MaterialList | null> {
  const original = await repo.get(id);
  if (!original) return null;
  const copia = await createList({ name: nome, isDefault: false, notes: original.notes });
  for (const linha of await listItemsOf(id)) {
    await addListItem({ ...linha, id: randomUUID(), listId: copia.id });
  }
  return copia;
}
