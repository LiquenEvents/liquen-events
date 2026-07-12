"use client";

import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect on the client (runs before paint → no flash of the pre-reveal
// state), useEffect on the server (React warns otherwise). Standard SSR-safe
// shim, used by the GSAP reveal primitives so hidden "from" states are applied
// before the first visible paint.
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
