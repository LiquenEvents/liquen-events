import * as React from "react";

/**
 * React's <ViewTransition> (View Transitions API integration).
 *
 * In the App Router, "react" resolves to Next's vendored React build, which
 * already ships `ViewTransition` (enabled via experimental.viewTransition in
 * next.config.ts). The stable @types/react doesn't declare it yet, so this
 * module is the single, typed access point. `ViewTransition` may be undefined
 * if the vendored React ever drops the export — consumers must keep a
 * no-animation fallback path.
 */
export interface ViewTransitionProps {
  children: React.ReactNode;
  /** Shared identity across renders/routes — matching names morph. */
  name?: string;
  enter?: string | Record<string, string>;
  exit?: string | Record<string, string>;
  share?: string | Record<string, string>;
  update?: string | Record<string, string>;
  default?: string;
}

export const ViewTransition = (
  React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }
).ViewTransition;
