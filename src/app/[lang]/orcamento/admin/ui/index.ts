/**
 * Barrel for the back-office UI primitives (the redesign foundation).
 *
 * Import from here so screens pull the shared, calm ChatGPT-app-like primitives
 * instead of re-hand-rolling Tailwind strings:
 *
 *   import { Button, Card, SectionCard, Field, PageHeader, EmptyState,
 *            Toolbar, Segmented } from "@/app/[lang]/orcamento/admin/ui";
 *
 * All are `"use client"`, presentational, and free of any store import.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Card, SectionCard } from "./Card";
export type { CardProps, CardPadding, SectionCardProps } from "./Card";

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
