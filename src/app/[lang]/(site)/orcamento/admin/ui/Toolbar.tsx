"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * A thin horizontal action bar: content pushed to the `start`, content pushed to
 * the `end`, with sensible wrapping and spacing between. Use it above a list or
 * table for filters/search on the left and primary actions on the right.
 *
 * Purely a layout primitive — it holds no state and owns no styling beyond
 * rhythm, so it composes with `Button`, `Segmented`, `Field`, etc.
 *
 * @example
 * <Toolbar
 *   start={<Segmented options={tabs} value={tab} onChange={setTab} ariaLabel="Filtrar" />}
 *   end={<Button size="sm" iconLeft={<PlusIcon />}>Novo</Button>}
 * />
 */

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Left-aligned content. */
  start?: ReactNode;
  /** Right-aligned content. */
  end?: ReactNode;
}

export function Toolbar({ start, end, className, children, ...rest }: ToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)} {...rest}>
      {(start || children) && (
        <div className="flex flex-wrap items-center gap-2">
          {start}
          {children}
        </div>
      )}
      {end && <div className="flex flex-wrap items-center gap-2">{end}</div>}
    </div>
  );
}
