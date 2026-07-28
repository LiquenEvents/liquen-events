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
  // `cover_path` só entra na linha quando o tema TEM capa escolhida (ou está a
  // ser limpa). Numa base onde o `alter table` de db/schema.sql ainda não
  // correu, a coluna não existe: escrevê-la sempre partia até um simples
  // renomear. Assim só quem escolhe uma capa é que apanha o 503 que manda
  // correr o schema (isMissingTable reconhece o 42703/PGRST204).
  toRow: (t) => ({
    id: t.id,
    name: t.name,
    notes: t.notes || null,
    ...("coverPath" in t ? { cover_path: t.coverPath || null } : {}),
    ...("photoOrder" in t ? { photo_order: t.photoOrder?.length ? t.photoOrder : null } : {}),
    created_at: t.createdAt || new Date().toISOString(),
    updated_at: t.updatedAt || new Date().toISOString(),
  }),
  // Simétrico: sem capa gravada, a propriedade nem aparece — é o que mantém a
  // linha acima calada nas instalações sem a coluna.
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    notes: (r.notes as string) ?? undefined,
    ...(typeof r.cover_path === "string" && r.cover_path ? { coverPath: r.cover_path } : {}),
    // A coluna é jsonb; uma base sem ela (ou com null) lê-se como "sem ordem
    // manual", que é exatamente o comportamento de antes desta funcionalidade.
    ...(Array.isArray(r.photo_order) && r.photo_order.length
      ? {
          photoOrder: (r.photo_order as unknown[]).filter(
            (p): p is string => typeof p === "string",
          ),
        }
      : {}),
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

/**
 * Renomeia / anota / escolhe a capa. `coverPath: ""` limpa a escolha (a linha
 * fica com `cover_path` a null e o cartão volta a mostrar a foto mais recente).
 */
export const updateTheme = (
  id: string,
  patch: Partial<Pick<ProposalTheme, "name" | "notes" | "coverPath">>,
): Promise<ProposalTheme | null> => repo.update(id, patch);

export const deleteTheme = (id: string): Promise<void> => repo.remove(id);
