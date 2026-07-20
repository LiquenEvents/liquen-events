// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, afterAll, beforeAll, describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement, Fragment } from "react";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Behavioural coverage for the modal focus trap (WCAG 2.4.3 / 2.1.2). The hook
 * is the single guard keeping keyboard focus inside every back-office dialog, so
 * these tests pin its contract: initial focus, Tab/Shift+Tab wrapping, exclusion
 * of non-tabbable elements, empty-container safety, no-op while disabled, and
 * focus restoration + listener/inert cleanup on close.
 *
 * jsdom performs no layout, so `HTMLElement.prototype.offsetParent` is always
 * null — that would make the hook's visibility filter treat every child as
 * hidden and defeat the whole test. We emulate the browser: an element (or any
 * ancestor) with display:none / [hidden] has no offsetParent, otherwise it
 * reports its nearest connected ancestor. This is a test-harness shim only; the
 * hook itself is untouched.
 */
let originalOffsetParent: PropertyDescriptor | undefined;
beforeAll(() => {
  originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement): Element | null {
      // Check this element, then walk ancestors (starting from parentElement so
      // `this` is never aliased to a local — keeps @typescript-eslint/no-this-alias happy).
      if (this.hidden || (this.style && this.style.display === "none")) return null;
      for (let el = this.parentElement; el; el = el.parentElement) {
        if (el.hidden) return null;
        if (el.style && el.style.display === "none") return null;
      }
      return this.isConnected ? this.parentElement : null;
    },
  });
});
afterAll(() => {
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Harness — a trigger button that lives OUTSIDE the trapped container (so we can
// assert focus restoration to it) plus a ref'd dialog with arbitrary children.
// Authored with createElement so the file stays a `.ts` module.
// ---------------------------------------------------------------------------
function Dialog({ active, children }: { active: boolean; children?: ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return createElement(
    Fragment,
    null,
    createElement("button", { "data-testid": "trigger" }, "trigger"),
    createElement(
      "div",
      { ref, "data-testid": "dialog" },
      children ??
        createElement(
          Fragment,
          null,
          createElement("button", { "data-testid": "a" }, "A"),
          createElement("button", { "data-testid": "b" }, "B"),
          createElement("button", { "data-testid": "c" }, "C"),
        ),
    ),
  );
}

// A trap-only harness (no in-tree trigger) for the unmount case, where the
// opener must live outside the subtree that gets torn down.
function DialogOnly({ active }: { active: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return createElement(
    "div",
    { ref, "data-testid": "dialog" },
    createElement("button", { "data-testid": "a" }, "A"),
    createElement("button", { "data-testid": "b" }, "B"),
    createElement("button", { "data-testid": "c" }, "C"),
  );
}

const activeEl = () => document.activeElement as HTMLElement | null;
const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey });

describe("useFocusTrap — enabled", () => {
  it("moves focus to the first focusable child on activation", () => {
    render(createElement(Dialog, { active: true }));
    expect(activeEl()).toBe(screen.getByTestId("a"));
  });

  it("respects a child that already holds focus (autoFocus) instead of stealing it", () => {
    const { rerender } = render(createElement(Dialog, { active: false }));
    screen.getByTestId("b").focus();
    rerender(createElement(Dialog, { active: true }));
    // Focus was already inside the container, so the trap must not yank it to A.
    expect(activeEl()).toBe(screen.getByTestId("b"));
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(createElement(Dialog, { active: true }));
    screen.getByTestId("c").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("a"));
  });

  it("wraps Shift+Tab from the first focusable back to the last", () => {
    render(createElement(Dialog, { active: true }));
    screen.getByTestId("a").focus();
    tab(true);
    expect(activeEl()).toBe(screen.getByTestId("c"));
  });

  it("pulls stray focus (outside the container) back inside on Tab", () => {
    render(createElement(Dialog, { active: true }));
    // Simulate focus escaping to the trigger; the guard must reclaim it.
    screen.getByTestId("trigger").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("a"));
  });

  it("leaves focus alone for a Tab away from the boundary (native order proceeds)", () => {
    render(createElement(Dialog, { active: true }));
    screen.getByTestId("b").focus();
    tab();
    // Not at an edge: the hook must not intervene, so focus stays put (jsdom does
    // not implement native Tab traversal).
    expect(activeEl()).toBe(screen.getByTestId("b"));
  });

  it("ignores non-Tab keys", () => {
    render(createElement(Dialog, { active: true }));
    screen.getByTestId("c").focus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(activeEl()).toBe(screen.getByTestId("c"));
  });
});

describe("useFocusTrap — focusable set edge cases", () => {
  it("keeps focus on the sole focusable for both Tab directions", () => {
    render(
      createElement(
        Dialog,
        { active: true },
        createElement("button", { "data-testid": "only" }, "Only"),
      ),
    );
    const only = screen.getByTestId("only");
    expect(activeEl()).toBe(only);
    tab();
    expect(activeEl()).toBe(only);
    tab(true);
    expect(activeEl()).toBe(only);
  });

  it("excludes disabled, display:none and tabindex=-1 elements from the cycle", () => {
    render(
      createElement(
        Dialog,
        { active: true },
        createElement("button", { "data-testid": "a" }, "A"),
        createElement("button", { "data-testid": "d", disabled: true }, "D"),
        createElement("button", { "data-testid": "h", style: { display: "none" } }, "H"),
        createElement("span", { "data-testid": "x", tabIndex: -1 }, "X"),
        createElement("button", { "data-testid": "c" }, "C"),
      ),
    );
    // Only A and C participate: Tab from C wraps to A, Shift+Tab from A wraps to C.
    screen.getByTestId("c").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("a"));
    screen.getByTestId("a").focus();
    tab(true);
    expect(activeEl()).toBe(screen.getByTestId("c"));
  });

  it("does not crash on Tab when the container has no focusable children", () => {
    render(createElement(Dialog, { active: true }, createElement("p", null, "nothing tabbable")));
    const dialog = screen.getByTestId("dialog");
    // Falls back to focusing the container itself so focus never sits on the page.
    expect(activeEl()).toBe(dialog);
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(() => tab()).not.toThrow();
    expect(() => tab(true)).not.toThrow();
  });

  // NEEDS DECISION: the empty-container fallback adds tabindex="-1" to the
  // container to make it programmatically focusable, but the cleanup never
  // removes it (unlike the aria-hidden/inert bookkeeping it does restore). On an
  // unmounting dialog this is harmless; on a persistent container that toggles
  // `active` it leaves a stray attribute behind. Pinning current behaviour —
  // whether to also strip it (and whether to preserve a pre-existing tabindex)
  // is a judgment call, not an obvious defect.
  it("pins that the container's fallback tabindex is left in place after close", () => {
    const { rerender } = render(
      createElement(Dialog, { active: true }, createElement("p", null, "nothing tabbable")),
    );
    const dialog = screen.getByTestId("dialog");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    rerender(
      createElement(Dialog, { active: false }, createElement("p", null, "nothing tabbable")),
    );
    // Not cleaned up on deactivation (documented, not asserted-as-desirable).
    expect(dialog).toHaveAttribute("tabindex", "-1");
  });

  it("uses freshly added children when computing the wrap boundary", () => {
    const two = [
      createElement("button", { key: "a", "data-testid": "a" }, "A"),
      createElement("button", { key: "b", "data-testid": "b" }, "B"),
    ];
    const three = [...two, createElement("button", { key: "c", "data-testid": "c" }, "C")];
    const { rerender } = render(createElement(Dialog, { active: true }, two));
    // With two buttons B is the last; Tab from B wraps to A.
    screen.getByTestId("b").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("a"));
    // Add a third; the new last (C) must now be the wrap target.
    rerender(createElement(Dialog, { active: true }, three));
    screen.getByTestId("c").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("a"));
    // And B (now the middle) no longer wraps.
    screen.getByTestId("b").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("b"));
  });
});

describe("useFocusTrap — disabled (no-op)", () => {
  it("does not steal focus when inactive", () => {
    render(createElement(Dialog, { active: false }));
    screen.getByTestId("trigger").focus();
    expect(activeEl()).toBe(screen.getByTestId("trigger"));
  });

  it("registers no keydown handler while inactive", () => {
    render(createElement(Dialog, { active: false }));
    screen.getByTestId("c").focus();
    tab();
    // No trap → the boundary Tab is left untouched.
    expect(activeEl()).toBe(screen.getByTestId("c"));
  });
});

describe("useFocusTrap — teardown", () => {
  it("restores focus to the trigger when deactivated", () => {
    const { rerender } = render(createElement(Dialog, { active: false }));
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    rerender(createElement(Dialog, { active: true }));
    expect(activeEl()).toBe(screen.getByTestId("a"));
    rerender(createElement(Dialog, { active: false }));
    expect(activeEl()).toBe(trigger);
  });

  it("restores focus to the previously focused element on unmount", () => {
    // The opener lives OUTSIDE the modal subtree (as in real usage), so it stays
    // mounted after the dialog unmounts and can legitimately receive focus back.
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    try {
      opener.focus();
      expect(activeEl()).toBe(opener);
      const { unmount } = render(createElement(DialogOnly, { active: true }));
      expect(activeEl()).toBe(screen.getByTestId("a"));
      unmount();
      expect(activeEl()).toBe(opener);
    } finally {
      opener.remove();
    }
  });

  it("removes the keydown listener on deactivation (no leak)", () => {
    const { rerender } = render(createElement(Dialog, { active: false }));
    screen.getByTestId("trigger").focus();
    rerender(createElement(Dialog, { active: true }));
    rerender(createElement(Dialog, { active: false }));
    // If the capture-phase listener leaked, a Tab from the last child would wrap
    // to the first. With it removed, focus stays put.
    screen.getByTestId("c").focus();
    tab();
    expect(activeEl()).toBe(screen.getByTestId("c"));
  });

  it("marks background siblings inert/aria-hidden while open and restores them on close", () => {
    const bg = document.createElement("div");
    bg.appendChild(document.createElement("button"));
    document.body.appendChild(bg);
    try {
      const { rerender } = render(createElement(Dialog, { active: true }));
      expect(bg.getAttribute("aria-hidden")).toBe("true");
      expect(bg.inert).toBeTruthy();
      rerender(createElement(Dialog, { active: false }));
      expect(bg.getAttribute("aria-hidden")).toBeNull();
      expect(bg.inert).toBeFalsy();
    } finally {
      bg.remove();
    }
  });
});
