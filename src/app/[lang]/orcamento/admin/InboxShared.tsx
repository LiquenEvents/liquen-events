"use client";

/**
 * Shared helpers, icons and small presentational atoms for the Inbox email
 * client (list + reading pane). Kept apart from the container so `InboxList`
 * and `InboxThread` share one visual language (chips, label pills, date/size
 * formatting) without re-hand-rolling it.
 *
 * Client-safe: imports only client-safe TYPES (`inbox-types`), never a
 * `*-store.ts` or any `server-only` module.
 */

import type { ReactNode } from "react";

export type InboxFilter = "todos" | "porler" | "estrela" | "ligados" | "arquivo";

/** Human-readable date, PT (AO90). Short and calm. */
export function fmtDate(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(+date)) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return date.toLocaleString("pt-PT", {
    day: sameDay ? undefined : "numeric",
    month: sameDay ? undefined : "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Bytes → "12 KB" / "1,4 MB". Returns "" when the server omitted the size (0). */
export function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
}

/**
 * A small, deterministic palette drawn only from the Líquen tokens (moss,
 * forest, clay, sand, ink) — no new brand colours. A label always renders in
 * the same tone so the eye learns it.
 */
const LABEL_PALETTE = [
  { bg: "rgba(77,99,80,0.12)", fg: "#41543f", dot: "#4d6350" }, // moss
  { bg: "rgba(99,122,95,0.16)", fg: "#455842", dot: "#637a5f" }, // moss light
  { bg: "rgba(138,42,34,0.10)", fg: "#8a2a22", dot: "#8a2a22" }, // clay
  { bg: "rgba(138,118,84,0.14)", fg: "#6b5a3e", dot: "#8a7654" }, // sand
  { bg: "rgba(43,38,32,0.08)", fg: "#57504700", dot: "#7a7268" }, // ink (fg overridden below)
] as const;

export function labelColor(label: string): { bg: string; fg: string; dot: string } {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  const p = LABEL_PALETTE[h % LABEL_PALETTE.length];
  // The ink tone needs a solid readable fg; keep the others as-is.
  return p.fg.length > 7 ? { bg: p.bg, fg: "#57504a", dot: p.dot } : p;
}

/** Suggested labels offered in the label editor (team can still type a custom one). */
export const SUGGESTED_LABELS = ["Urgente", "Cliente", "Fornecedor", "Seguimento", "Pago"];

// ── Small presentational atoms ──

/** Brand chip shown on a row/header when the email is linked to a pedido. */
export function LinkedChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex max-w-[14rem] items-center gap-1 rounded-lg bg-[#4d6350]/12 px-2 py-0.5 text-[11px] font-medium text-[#41543f]"
      title={`Ligado ao pedido de ${name}`}
    >
      <IconLink className="h-3 w-3 shrink-0" />
      <span className="truncate">ligado a: {name}</span>
    </span>
  );
}

/** A coloured label pill. `onRemove` turns it into a removable chip. */
export function LabelPill({
  label,
  onRemove,
  size = "md",
}: {
  label: string;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  const c = labelColor(label);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.dot }} aria-hidden />
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover etiqueta ${label}`}
          className="ml-0.5 leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
}

// ── Icons (stroke, currentColor) ──

type IconProps = { className?: string };

export function IconStar({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path
        d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPaperclip({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path
        d="M21 12.5 12.5 21a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPin({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path d="M12 17v5" strokeLinecap="round" />
      <path d="M9 3h6l-1 5 3 3v2H7v-2l3-3-1-5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconArchive({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" strokeLinecap="round" />
    </svg>
  );
}

export function IconTag({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path
        d="M3 11.5V4a1 1 0 0 1 1-1h7.5a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.5 6.5a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7Z"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path
        d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1.5-1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconReply({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMailOpen({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path d="M3 10 12 4l9 6v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z" strokeLinejoin="round" />
      <path d="m3 10 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMail({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconInbox({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        d="M4 13h4l1.5 3h5L16 13h4M4 13 6 5h12l2 8v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPlusDoc({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        strokeLinejoin="round"
      />
      <path d="M13 3v5h5M12 12v5M9.5 14.5h5" strokeLinecap="round" />
    </svg>
  );
}

/** Tiny inline row used to keep the reading-pane meta tidy. */
export function MetaLine({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-foreground/45">{children}</p>;
}
