"use client";

/**
 * The master list of the Inbox email client: one calm row per message with the
 * sender, subject, date, unread weight, a star toggle, an attachment paperclip,
 * label pills, and a brand chip when the email is linked to a pedido. Rows are
 * buttons; the selected one is highlighted. Purely presentational — every action
 * is delegated to the container via props.
 */

import type { InboxItemEnriched } from "@/lib/inbox-types";
import { SkeletonBar } from "./Skeleton";
import { fmtDate, IconPaperclip, IconPin, IconStar, LabelPill, LinkedChip } from "./InboxShared";

interface Props {
  items: InboxItemEnriched[];
  selectedUid: number | null;
  loading: boolean;
  flaggedUids: Set<number>;
  /** Resolve a linked pedido id to a display name for the "ligado a:" chip. */
  quoteName: (quoteId: string) => string | undefined;
  onOpen: (uid: number) => void;
  onToggleStar: (item: InboxItemEnriched) => void;
}

export default function InboxList({
  items,
  selectedUid,
  loading,
  flaggedUids,
  quoteName,
  onOpen,
  onToggleStar,
}: Props) {
  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col divide-y divide-foreground/[0.06]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <SkeletonBar className="h-3 w-2/5" />
              <SkeletonBar className="h-2.5 w-12 shrink-0" />
            </div>
            <SkeletonBar className="h-2.5 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-foreground/[0.06]">
      {items.map((m) => {
        const selected = m.uid === selectedUid;
        const starred = flaggedUids.has(m.uid);
        const linkedName = m.link?.quoteId ? quoteName(m.link.quoteId) : undefined;
        const labels = m.link?.labels ?? [];
        const pinned = m.link?.pinned;
        return (
          <li key={m.uid} className="relative">
            {/* Selected accent rail */}
            {selected && (
              <span
                className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-[#4d6350]"
                aria-hidden
              />
            )}
            <div
              className={`flex items-start gap-2.5 px-3.5 py-3 transition-colors ${
                selected ? "bg-[#4d6350]/[0.07]" : "hover:bg-foreground/[0.025]"
              }`}
            >
              {/* Star */}
              <button
                type="button"
                onClick={() => onToggleStar(m)}
                aria-pressed={starred}
                aria-label={starred ? "Retirar estrela" : "Marcar com estrela"}
                className={`mt-0.5 shrink-0 rounded-md p-0.5 transition-colors ${
                  starred
                    ? "text-[#c19a3e] hover:text-[#a9852f]"
                    : "text-foreground/25 hover:text-foreground/50"
                }`}
              >
                <IconStar className="h-4 w-4" filled={starred} />
              </button>

              {/* Row body — the clickable open target */}
              <button
                type="button"
                onClick={() => onOpen(m.uid)}
                aria-current={selected ? "true" : undefined}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${
                      m.seen ? "font-normal text-foreground/60" : "font-semibold text-foreground/90"
                    }`}
                  >
                    {!m.seen && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4d6350]"
                        aria-label="Por ler"
                      />
                    )}
                    <span className="truncate">{m.from}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-foreground/35">
                    {pinned && <IconPin className="h-3 w-3 text-[#4d6350]" filled />}
                    {m.attachments.length > 0 && (
                      <IconPaperclip className="h-3 w-3 text-foreground/40" />
                    )}
                    {fmtDate(m.date)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate text-xs ${
                    m.seen ? "text-foreground/45" : "text-foreground/70"
                  }`}
                >
                  {m.subject}
                </p>
                {(linkedName || labels.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {linkedName && <LinkedChip name={linkedName} />}
                    {labels.map((l) => (
                      <LabelPill key={l} label={l} size="sm" />
                    ))}
                  </div>
                )}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
