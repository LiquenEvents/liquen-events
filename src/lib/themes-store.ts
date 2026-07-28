import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { ProposalTheme } from "./theme-types";

/**
 * Metadados da Biblioteca de Temas (nome + nota de cada tema), persistidos
 * pelo Repository partilhado — tabela `proposal_themes` no Supabase, ficheiro
 * JSON em desenvolvimento. As FOTOS não estão aqui: vivem no bucket
 * `theme-assets`, uma pasta por `id` de tema (ver `theme-storage.ts`), para
 * que a pasta seja sempre a única fonte de verdade do que existe.
 *
 * Os tipos client-safe vivem em `theme-types` (re-exportados por conveniência)
 * para que os componentes do back office não importem este módulo de servidor.
 */
export type { ProposalTheme, ThemeImage, ThemeSummary } from "./theme-types";

export const mapper: Mapper<ProposalTheme> = {
  table: "proposal_themes",
  fileName: "proposal-themes.json",
  getId: (t) => t.id,
  toRow: (t) => ({
    id: t.id,
    name: t.name,
    notes: t.notes || null,
    created_at: t.createdAt || new Date().toISOString(),
    updated_at: t.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    notes: (r.notes as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name, "pt"),
  touch: true,
  beforeUpdate: (t) => ({ ...t, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

/** Id novo e não adivinhável (é também o nome da pasta no Storage). */
export const newThemeId = (): string => randomUUID();

export const listThemes = (): Promise<ProposalTheme[]> => repo.list();

export const getTheme = (id: string): Promise<ProposalTheme | null> => repo.get(id);

export async function createTheme(input: { name: string; notes?: string }): Promise<ProposalTheme> {
  const now = new Date().toISOString();
  const theme: ProposalTheme = {
    id: newThemeId(),
    name: input.name,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  await repo.create(theme);
  return theme;
}

export const updateTheme = (
  id: string,
  patch: Partial<Pick<ProposalTheme, "name" | "notes">>,
): Promise<ProposalTheme | null> => repo.update(id, patch);

export const deleteTheme = (id: string): Promise<void> => repo.remove(id);
