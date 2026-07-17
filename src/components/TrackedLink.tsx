"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "@/lib/track";

/**
 * A next/link that fires a Plausible custom event on click, so conversion CTAs
 * rendered inside server components can still be measured. `track()` is inert
 * without Plausible configured, so this is a safe no-op by default.
 *
 * Keeps the link a tiny client leaf — the surrounding page stays server-rendered.
 */
type Props = ComponentProps<typeof Link> & {
  /** Plausible event name. Defaults to the shared CTA funnel event. */
  event?: string;
  /** Extra props for the event, e.g. { source: "hero" }. */
  trackProps?: Record<string, string | number | boolean>;
};

export default function TrackedLink({ event = "CTAClick", trackProps, onClick, ...rest }: Props) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        track(event, trackProps);
        onClick?.(e);
      }}
    />
  );
}
