/**
 * Barrel for the back-office UI primitives (the redesign foundation).
 *
 * Import from here so screens pull the shared, calm ChatGPT-app-like primitives
 * instead of re-hand-rolling Tailwind strings:
 *
 *   import { Button, Card, SectionCard, Field, PageHeader, EmptyState,
 *            Toolbar, Segmented } from "@/app/[lang]/(site)/orcamento/admin/ui";
 *
 * All are `"use client"`, presentational, and free of any store import.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Card, SectionCard } from "./Card";
export type { CardProps, CardPadding, SectionCardProps } from "./Card";

export { Ajuda } from "./Ajuda";

// A espera desenhada de uma maneira só. Ver `EmCurso.tsx`: uma espera com doze
// desenhos diferentes não é uma linguagem, e o olho reaprende em cada ecrã.
export { EmCurso, useDecorrido } from "./EmCurso";
export type { EmCursoProps } from "./EmCurso";

export { Field } from "./Field";
export type { FieldProps } from "./Field";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Toolbar } from "./Toolbar";
export type { ToolbarProps } from "./Toolbar";

export { Segmented } from "./Segmented";
export type { SegmentedProps, SegmentedOption } from "./Segmented";

export { cn } from "./cn";

// ── Fundações adaptativas ──────────────────────────────────────────────────
// Responsivo ≠ adaptativo: estes não encolhem, mudam de forma. Ver
// ADAPTIVE-PRIMITIVES.md para quando usar cada um (e quando NÃO usar nenhum,
// que é sempre que a diferença for só de estilo — isso faz-se em CSS).
export {
  CORTES,
  useAdaptativo,
  useLargura,
  useCapacidade,
  useMontado,
  usePodeEsconderNoHover,
} from "./adaptativo";
export type { Largura, Capacidade, Adaptativo } from "./adaptativo";

export { FolhaOuDialogo } from "./FolhaOuDialogo";
export type { FolhaOuDialogoProps } from "./FolhaOuDialogo";

export { TabelaOuCartoes } from "./TabelaOuCartoes";
export type { TabelaOuCartoesProps, Coluna } from "./TabelaOuCartoes";

export { MenuDeAccoes } from "./MenuDeAccoes";
export type { MenuDeAccoesProps, AccaoDeItem } from "./MenuDeAccoes";

export { CampoData, porExtenso } from "./CampoData";
export type { CampoDataProps } from "./CampoData";
