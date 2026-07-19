/**
 * Tiny, dependency-free class-name joiner for the back-office UI primitives.
 *
 * The redesign primitives compose Tailwind utility strings conditionally
 * (variant + size + state + caller overrides). Rather than pull in `clsx`, this
 * keeps the surface small: falsy parts are dropped, everything else is joined
 * with a single space. Later parts win only in the sense that they appear last
 * in the string — Tailwind's own cascade decides the rest, so keep caller
 * overrides (`className`) at the end of the list.
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-moss text-white", className)
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
