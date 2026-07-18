"use client";

import { useEffect, useRef } from "react";

/**
 * Accessible modal focus management (WCAG 2.4.3 Focus Order / 2.1.2 No Keyboard
 * Trap — i.e. focus is *contained* while open but always escapable via the
 * dialog's own close/Escape). While `active`:
 *   · focus moves into the ref'd container on mount (first focusable, or the
 *     container itself);
 *   · Tab / Shift+Tab wrap within the container so keyboard focus can't leak to
 *     the (visually obscured) background;
 *   · the rest of the app is marked `aria-hidden`/`inert` so assistive tech and
 *     pointer/again-tab focus skip it;
 *   · on close/unmount, focus is restored to the element that was focused before
 *     the dialog opened.
 *
 * SSR-safe: every `document` access is guarded and only runs inside the effect
 * (client-only). Pass `active=false` to disable the trap without unmounting —
 * used so the detail panel traps only in its mobile overlay state, never as the
 * inline desktop (xl+) panel.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;
    const container = ref.current;
    if (!container) return;

    // Remember who had focus so we can hand it back on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus in — unless something inside already has it (e.g. an autoFocus
    // field), which we respect. Prefer the first focusable; fall back to the
    // container (made programmatically focusable) so focus never stays on the
    // background.
    if (!container.contains(document.activeElement)) {
      const focusables = getFocusable();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.setAttribute("tabindex", "-1");
        container.focus();
      }
    }

    // Mark siblings inert/hidden so background content leaves the a11y tree and
    // the tab order — the whole point of a modal. Restored on cleanup.
    const siblings: { el: HTMLElement; ariaHidden: string | null; hadInert: boolean }[] = [];
    if (document.body) {
      for (const node of Array.from(document.body.children)) {
        if (!(node instanceof HTMLElement)) continue;
        if (node === container || node.contains(container)) continue;
        siblings.push({
          el: node,
          ariaHidden: node.getAttribute("aria-hidden"),
          hadInert: node.inert,
        });
        node.setAttribute("aria-hidden", "true");
        node.inert = true;
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      for (const { el, ariaHidden, hadInert } of siblings) {
        if (ariaHidden === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", ariaHidden);
        el.inert = hadInert;
      }
      // Restore focus to where the user was before the dialog opened.
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
