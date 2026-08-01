"use client";

/**
 * The reading pane of the Inbox email client: full message body, the action bar
 * (read/unread, star, archive, pin, labels, link-to-pedido), the received
 * attachments, a reply composer, and — for a message from an unknown sender —
 * "Criar pedido a partir deste email". Presentational: all mutations are handed
 * up to the container via callbacks.
 *
 * SAFETY: there is no permanent delete here. "Arquivar" maps to the reversible
 * overlay archive (a hide timestamp), and it asks for confirmation in the
 * container before it runs.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InboxMessage, MessageLink } from "@/lib/inbox-types";
import { Button } from "./ui";
import { SkeletonBar } from "./Skeleton";
import {
  fmtBytes,
  fmtDate,
  IconArchive,
  IconLink,
  IconMail,
  IconMailOpen,
  IconPaperclip,
  IconPin,
  IconPlusDoc,
  IconReply,
  IconStar,
  IconTag,
  LabelPill,
  LinkedChip,
  MetaLine,
  SUGGESTED_LABELS,
} from "./InboxShared";

export interface ThreadQuote {
  id: string;
  name: string;
  email?: string;
}

interface Props {
  message: InboxMessage | null;
  link?: MessageLink;
  seen: boolean;
  flagged: boolean;
  loadingMsg: boolean;
  lang: string;
  quotes: ThreadQuote[];
  quoteName: (id: string) => string | undefined;
  /** True when the message carries a durable Message-ID (overlay actions need it). */
  canOverlay: boolean;
  creating: boolean;
  onToggleSeen: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onSetPinned: (pinned: boolean) => void;
  onToggleLabel: (label: string) => void;
  onLinkQuote: (quoteId: string | null) => void;
  onCreateQuote: () => void;
  onReply: (text: string) => Promise<boolean>;
}

export default function InboxThread({
  message,
  link,
  seen,
  flagged,
  loadingMsg,
  lang,
  quotes,
  quoteName,
  canOverlay,
  creating,
  onToggleSeen,
  onToggleStar,
  onArchive,
  onUnarchive,
  onSetPinned,
  onToggleLabel,
  onLinkQuote,
  onCreateQuote,
  onReply,
}: Props) {
  if (loadingMsg) {
    return (
      <div className="rounded-2xl border border-foreground/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
        <SkeletonBar className="mb-3 h-4 w-3/5" />
        <SkeletonBar className="mb-6 h-2.5 w-2/5" />
        <SkeletonBar className="mb-2 h-2.5 w-full" />
        <SkeletonBar className="mb-2 h-2.5 w-full" />
        <SkeletonBar className="h-2.5 w-4/5" />
      </div>
    );
  }

  if (!message) {
    return (
      <div className="hidden items-center justify-center rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.015] px-6 py-16 text-center lg:flex">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4d6350]/[0.08] text-[#4d6350]">
            <IconMailOpen className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground/70">Selecione uma mensagem</p>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-foreground/45">
            Abra um e-mail à esquerda para o ler, responder ou ligar a um pedido.
          </p>
        </div>
      </div>
    );
  }

  const archived = !!link?.archivedAt;
  const pinned = !!link?.pinned;
  const labels = link?.labels ?? [];
  const linkedName = link?.quoteId ? quoteName(link.quoteId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Header + primary actions */}
      <div className="rounded-2xl border border-foreground/[0.08] bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
        <div className="border-b border-foreground/[0.07] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 break-words font-display text-lg leading-tight text-foreground/90">
              {message.subject}
            </h2>
            <button
              type="button"
              onClick={onToggleStar}
              aria-pressed={flagged}
              aria-label={flagged ? "Retirar estrela" : "Marcar com estrela"}
              className={`shrink-0 rounded-lg p-1 transition-colors ${
                flagged
                  ? "text-[#c19a3e] hover:text-[#a9852f]"
                  : "text-foreground/30 hover:text-foreground/55"
              }`}
            >
              <IconStar className="h-5 w-5" filled={flagged} />
            </button>
          </div>
          <MetaLine>
            <span className="text-foreground/70">{message.from}</span>
            {message.fromAddress && (
              <span className="text-foreground/40"> · {message.fromAddress}</span>
            )}
          </MetaLine>
          <MetaLine>{fmtDate(message.date)}</MetaLine>

          {(linkedName || labels.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {linkedName && <LinkedChip name={linkedName} />}
              {labels.map((l) => (
                <LabelPill key={l} label={l} onRemove={() => onToggleLabel(l)} />
              ))}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSeen}
            title={
              seen
                ? "Voltar a marcar como não lido (fica em destaque na lista)"
                : "Marcar como já lido"
            }
            iconLeft={
              seen ? <IconMail className="h-4 w-4" /> : <IconMailOpen className="h-4 w-4" />
            }
          >
            {seen ? "Marcar como não lido" : "Marcar como lido"}
          </Button>

          {canOverlay && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSetPinned(!pinned)}
                aria-pressed={pinned}
                title={
                  pinned ? "Tirar do topo da lista" : "Manter este e-mail sempre no topo da lista"
                }
                iconLeft={<IconPin className="h-4 w-4" filled={pinned} />}
              >
                {pinned ? "Tirar do topo" : "Fixar no topo"}
              </Button>

              <LabelMenu labels={labels} onToggle={onToggleLabel} />

              {archived ? (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={onUnarchive}
                  title="Trazer de volta para a caixa de entrada"
                  iconLeft={<IconArchive className="h-4 w-4" />}
                >
                  Tirar do arquivo
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onArchive}
                  title="Esconder da caixa de entrada. Não apaga nada — pode voltar a mostrá-lo quando quiser"
                  iconLeft={<IconArchive className="h-4 w-4" />}
                >
                  Arquivar
                </Button>
              )}
            </>
          )}
        </div>

        {!canOverlay && (
          <p className="border-t border-foreground/[0.06] px-5 py-2.5 text-[11px] leading-relaxed text-foreground/40">
            Este e-mail chegou sem a marca que o identifica, por isso não é possível pôr etiquetas,
            fixá-lo no topo, arquivá-lo nem ligá-lo a um pedido. Pode na mesma lê-lo e responder.
          </p>
        )}
      </div>

      {/* Associate to a pedido */}
      {canOverlay && (
        <div className="rounded-2xl border border-foreground/[0.08] bg-white p-4 shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
          {link?.quoteId && linkedName ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm text-foreground/70">
                <IconLink className="h-4 w-4 shrink-0 text-[#4d6350]" />
                <span className="truncate">
                  Ligado ao pedido de <span className="font-medium">{linkedName}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Link href={`/${lang}/orcamento/admin/evento/${link.quoteId}`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Ir para a ficha completa deste pedido"
                  >
                    Abrir o pedido
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onLinkQuote(null)}
                  title="Deixar de ligar este e-mail ao pedido"
                >
                  Desligar
                </Button>
              </div>
            </div>
          ) : (
            <AssociatePicker
              quotes={quotes}
              defaultQuery={message.fromAddress || message.from}
              onPick={(id) => onLinkQuote(id)}
              onCreate={onCreateQuote}
              creating={creating}
            />
          )}
        </div>
      )}

      {/* Body */}
      <div className="rounded-2xl border border-foreground/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/70">
          {message.text || "(sem conteúdo de texto)"}
        </p>
      </div>

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="rounded-2xl border border-foreground/[0.08] bg-white p-4 shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
          <p className="bo-eyebrow mb-3">Anexos recebidos ({message.attachments.length})</p>
          <ul className="flex flex-col gap-1.5">
            {message.attachments.map((a, i) => {
              const size = fmtBytes(a.size);
              return (
                <li
                  key={`${a.partId}-${i}`}
                  className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.03] px-3 py-2"
                >
                  <IconPaperclip className="h-4 w-4 shrink-0 text-foreground/40" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/70">
                    {a.filename}
                  </span>
                  {size && <span className="shrink-0 text-[11px] text-foreground/40">{size}</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/40">
            Transferência de anexos ainda não disponível a partir desta caixa.
          </p>
        </div>
      )}

      {/* Reply */}
      <ReplyBox to={message.fromAddress} onReply={onReply} />

      {/* Send-a-proposal-with-attachment — intentionally disabled (not yet wired). */}
      <div className="rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.015] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-foreground/45">
            <IconPlusDoc className="h-4 w-4" />
            Enviar proposta com anexo
          </div>
          <Button variant="secondary" size="sm" disabled title="Ainda não disponível no servidor">
            Indisponível
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-foreground/40">
          O envio de propostas com ficheiro anexado ainda não está ligado no servidor. Use a
          resposta acima para enviar texto; os anexos chegarão numa próxima atualização.
        </p>
      </div>
    </div>
  );
}

// ── Label editor ──

function LabelMenu({ labels, onToggle }: { labels: string[]; onToggle: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Juntar etiquetas para organizar e encontrar mais depressa"
        iconLeft={<IconTag className="h-4 w-4" />}
      >
        Etiquetas
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-xl border border-foreground/10 bg-white p-3 shadow-xl shadow-black/10">
            <p className="bo-eyebrow mb-1">Etiquetas</p>
            <p className="mb-2.5 text-[11px] leading-relaxed text-foreground/45">
              Toque numa para juntar ou tirar. Ajudam a organizar e a encontrar e-mails depois.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set([...SUGGESTED_LABELS, ...labels])).map((l) => {
                const active = labels.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onToggle(l)}
                    aria-pressed={active}
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                      active ? "ring-1 ring-[#4d6350]/40" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    <LabelPill label={l} size="sm" />
                  </button>
                );
              })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = custom.trim();
                if (!v) return;
                onToggle(v);
                setCustom("");
              }}
              className="mt-3 flex items-center gap-1.5"
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={64}
                placeholder="Nova etiqueta…"
                className="bo-input flex-1 px-2.5 py-1.5 text-xs text-foreground/80"
              />
              <Button type="submit" variant="subtle" size="sm" disabled={!custom.trim()}>
                Adicionar
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

// ── Associate / create-pedido picker ──

function AssociatePicker({
  quotes,
  defaultQuery,
  onPick,
  onCreate,
  creating,
}: {
  quotes: ThreadQuote[];
  defaultQuery: string;
  onPick: (id: string) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes.slice(0, 6);
    return quotes
      .filter((x) =>
        [x.name, x.email, x.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, quotes]);

  return (
    <div>
      <p className="bo-eyebrow mb-1 flex items-center gap-1.5">
        <IconLink className="h-3.5 w-3.5" /> Ligar a um pedido
      </p>
      <p className="mb-2 text-[11px] leading-relaxed text-foreground/45">
        Junte este e-mail ao pedido do cliente para ter tudo no mesmo sítio.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Escreva o nome ou o email do cliente…"
        className="bo-input mb-2 px-3 py-2 text-sm text-foreground/80"
      />
      {matches.length > 0 ? (
        <ul className="max-h-44 overflow-y-auto rounded-xl border border-foreground/[0.07]">
          {matches.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => onPick(x.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.03]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground/80">{x.name}</span>
                  {x.email && (
                    <span className="block truncate text-[11px] text-foreground/40">{x.email}</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#4d6350]">
                  Ligar
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-foreground/[0.03] px-3 py-2 text-xs text-foreground/45">
          Nenhum pedido corresponde a “{query}”.
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-foreground/[0.06] pt-3">
        <p className="text-[11px] leading-relaxed text-foreground/45">
          É um contacto novo? Crie já um pedido com os dados deste e-mail.
        </p>
        <Button
          variant="primary"
          size="sm"
          loading={creating}
          onClick={onCreate}
          iconLeft={!creating ? <IconPlusDoc className="h-4 w-4" /> : undefined}
          title={
            defaultQuery
              ? `Criar um novo pedido já ligado a ${defaultQuery}`
              : "Criar um novo pedido com os dados deste e-mail"
          }
        >
          Criar pedido
        </Button>
      </div>
    </div>
  );
}

// ── Reply composer ──

function ReplyBox({ to, onReply }: { to: string; onReply: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onReply(text.trim());
    setSending(false);
    if (ok) {
      setSent(true);
      setText("");
    }
  }

  return (
    <div className="rounded-2xl border border-foreground/[0.08] bg-white p-4 shadow-[0_1px_2px_rgba(42,38,32,0.04)]">
      <p className="bo-eyebrow mb-3 flex items-center gap-1.5">
        <IconReply className="h-3.5 w-3.5" /> Responder
      </p>
      {sent ? (
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-sm text-[#4d6350]">
            ✓ Resposta enviada para {to}.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            Escrever outra
          </Button>
        </div>
      ) : (
        <>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva a resposta…"
            className="bo-input mb-3 resize-none px-3 py-2 text-sm text-foreground/80"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-foreground/40">
              {to ? `Para: ${to}` : "Sem endereço de resposta"}
            </span>
            <Button
              variant="primary"
              size="sm"
              loading={sending}
              disabled={!text.trim() || !to}
              onClick={submit}
              iconRight={
                !sending ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : undefined
              }
            >
              Enviar resposta
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
