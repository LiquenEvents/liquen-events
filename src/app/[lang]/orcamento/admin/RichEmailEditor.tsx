"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  readDocFromEditor,
  renderRichInnerHtml,
  BRAND_TEXT_COLORS,
  type RichDoc,
} from "@/lib/email-rich-format";

/**
 * The visual ("WYSIWYG") email composer — the PRIMARY editing experience on the
 * "Modelos de email" screen. A non-technical operator formats rich, on-brand
 * emails entirely visually and never sees markup.
 *
 * How it stays safe: the editor's own DOM is the live editing surface, but it is
 * NEVER stored. On every change we read the DOM into a controlled document model
 * ({@link RichDoc}) via `readDocFromEditor` — a whitelist that keeps only
 * recognized structure + escaped text — and the parent rebuilds the email HTML
 * from that model. So nothing a contentEditable can produce is ever persisted
 * verbatim.
 *
 * The component is keyed by the parent (per template + mode) so it remounts on a
 * template switch; the initial model is painted into the DOM once on mount and
 * thereafter the DOM leads, emitting model updates through `onChange`.
 */

export interface RichEmailEditorHandle {
  /** Insert a `{token}` at the caret (used by the merge-field chips). */
  insertToken: (token: string) => void;
  /** Focus the editable region. */
  focus: () => void;
}

interface Props {
  /** Model painted into the editor on mount. */
  initialDoc: RichDoc;
  /** Called with the freshly-read model on every edit. */
  onChange: (doc: RichDoc) => void;
  /** Marks this editor as the active merge-field target when focused. */
  onFocus?: () => void;
  /** Accessible name for the editable region. */
  ariaLabel?: string;
}

/** exec a `document.execCommand`, tolerating environments without it (tests). */
function exec(command: string, value?: string): void {
  try {
    document.execCommand(command, false, value);
  } catch {
    /* jsdom / unsupported — the editor DOM is still read on change */
  }
}

export const RichEmailEditor = forwardRef<RichEmailEditorHandle, Props>(function RichEmailEditor(
  { initialDoc, onChange, onFocus, ariaLabel = "Corpo do email" },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [buttonOpen, setButtonOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [btnLabel, setBtnLabel] = useState("");
  const [btnUrl, setBtnUrl] = useState("");

  // Paint the initial model once; thereafter the DOM is the source of truth.
  useEffect(() => {
    const el = editorRef.current;
    if (el) el.innerHTML = renderRichInnerHtml(initialDoc, { editable: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const el = editorRef.current;
    if (el) onChange(readDocFromEditor(el));
  }

  function saveSelection() {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    } else {
      // No stored caret inside the editor → place it at the end.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  useImperativeHandle(ref, () => ({
    insertToken(token: string) {
      restoreSelection();
      exec("insertText", token);
      emit();
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  /** Run a simple formatting command on the current selection, then re-read. */
  function run(command: string, value?: string) {
    editorRef.current?.focus();
    exec(command, value);
    emit();
  }

  function applyColor(hex: string) {
    restoreSelection();
    exec("styleWithCSS", "true");
    exec("foreColor", hex);
    setColorOpen(false);
    emit();
  }

  function insertHtml(html: string) {
    restoreSelection();
    exec("insertHTML", html);
    emit();
  }

  function confirmLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url) return;
    restoreSelection();
    const sel = window.getSelection();
    const collapsed = !sel || sel.isCollapsed;
    if (collapsed) {
      // No selection — insert the URL as its own linked text (safely built).
      insertHtml(
        renderRichInnerHtml(
          { version: 1, blocks: [{ type: "paragraph", runs: [{ text: url, href: url }] }] },
          { editable: true },
        ),
      );
    } else {
      exec("createLink", url);
      emit();
    }
    setLinkUrl("");
  }

  function confirmButton() {
    const label = btnLabel.trim();
    const href = btnUrl.trim();
    setButtonOpen(false);
    if (!label || !href) return;
    insertHtml(
      renderRichInnerHtml(
        { version: 1, blocks: [{ type: "button", href, label, align: "center" }] },
        { editable: true },
      ),
    );
    setBtnLabel("");
    setBtnUrl("");
  }

  function insertDivider() {
    insertHtml(
      renderRichInnerHtml({ version: 1, blocks: [{ type: "divider" }] }, { editable: true }),
    );
  }

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Ferramentas de formatação"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-1.5 mb-2"
      >
        <TbGroup>
          <TbButton label="Negrito" onRun={() => run("bold")}>
            <span className="font-bold">N</span>
          </TbButton>
          <TbButton label="Itálico" onRun={() => run("italic")}>
            <span className="italic font-serif">I</span>
          </TbButton>
          <TbButton label="Sublinhado" onRun={() => run("underline")}>
            <span className="underline">S</span>
          </TbButton>
        </TbGroup>

        <TbDivider />

        <TbGroup>
          <TbButton label="Título" onRun={() => run("formatBlock", "h2")}>
            <span className="font-semibold">T</span>
          </TbButton>
          <TbButton label="Subtítulo" onRun={() => run("formatBlock", "h3")}>
            <span className="text-[11px] font-semibold">T</span>
          </TbButton>
          <TbButton label="Texto normal" onRun={() => run("formatBlock", "p")}>
            <span aria-hidden>¶</span>
          </TbButton>
        </TbGroup>

        <TbDivider />

        <TbGroup>
          <TbButton label="Lista com pontos" onRun={() => run("insertUnorderedList")}>
            <span aria-hidden>•≡</span>
          </TbButton>
          <TbButton label="Lista numerada" onRun={() => run("insertOrderedList")}>
            <span aria-hidden>1.</span>
          </TbButton>
        </TbGroup>

        <TbDivider />

        <TbGroup>
          <TbButton label="Alinhar à esquerda" onRun={() => run("justifyLeft")}>
            <span aria-hidden>⇤</span>
          </TbButton>
          <TbButton label="Centrar" onRun={() => run("justifyCenter")}>
            <span aria-hidden>≡</span>
          </TbButton>
          <TbButton label="Alinhar à direita" onRun={() => run("justifyRight")}>
            <span aria-hidden>⇥</span>
          </TbButton>
        </TbGroup>

        <TbDivider />

        <TbGroup>
          <TbButton
            label="Inserir ligação"
            onOpen={() => {
              saveSelection();
              setLinkOpen((v) => !v);
              setColorOpen(false);
              setButtonOpen(false);
            }}
          >
            <span aria-hidden>🔗</span>
          </TbButton>
          <TbButton
            label="Inserir botão"
            onOpen={() => {
              saveSelection();
              setButtonOpen((v) => !v);
              setColorOpen(false);
              setLinkOpen(false);
            }}
          >
            <span aria-hidden>▭</span>
          </TbButton>
          <TbButton label="Inserir separador" onRun={insertDivider}>
            <span aria-hidden>―</span>
          </TbButton>
          <div className="relative">
            <TbButton
              label="Cor do texto"
              expanded={colorOpen}
              onOpen={() => {
                saveSelection();
                setColorOpen((v) => !v);
                setLinkOpen(false);
                setButtonOpen(false);
              }}
            >
              <span aria-hidden>A</span>
              <span
                aria-hidden
                className="ml-0.5 inline-block h-2.5 w-2.5 rounded-full border border-foreground/20 bg-[#4d6350]"
              />
            </TbButton>
            {colorOpen && (
              <div
                role="menu"
                aria-label="Cor do texto"
                className="absolute z-10 mt-1 flex gap-1 rounded-lg border border-foreground/10 bg-white p-1.5 shadow-md"
              >
                {BRAND_TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="menuitem"
                    title={c.label}
                    aria-label={c.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyColor(c.value)}
                    className="h-6 w-6 rounded-full border border-foreground/15"
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            )}
          </div>
        </TbGroup>
      </div>

      {linkOpen && (
        <MiniForm
          label="Endereço da ligação (https://… ou {link})"
          value={linkUrl}
          onChange={setLinkUrl}
          onConfirm={confirmLink}
          onCancel={() => setLinkOpen(false)}
          confirmLabel="Inserir ligação"
        />
      )}
      {buttonOpen && (
        <div className="mb-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
          <label className="bo-eyebrow block mb-1">Texto do botão</label>
          <input
            value={btnLabel}
            onChange={(e) => setBtnLabel(e.target.value)}
            placeholder="Ex.: Ver proposta"
            className="bo-input px-3 py-2 text-sm w-full mb-2"
          />
          <label className="bo-eyebrow block mb-1">
            Ligação do botão (https://… ou {"{link}"})
          </label>
          <input
            value={btnUrl}
            onChange={(e) => setBtnUrl(e.target.value)}
            placeholder="{link}"
            className="bo-input px-3 py-2 text-sm w-full mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmButton}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#4d6350] text-white hover:bg-[#415440]"
            >
              Inserir botão
            </button>
            <button
              type="button"
              onClick={() => setButtonOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-foreground/55 hover:bg-foreground/[0.06]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div
        ref={editorRef}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onFocus={onFocus}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        className="bo-input w-full min-h-[320px] px-3.5 py-3 text-sm leading-relaxed text-foreground/80 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:text-[#4d6350] [&_a]:underline"
      />
    </div>
  );
});

// ── Small presentational helpers ─────────────────────────────────────────────

function TbGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function TbDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-foreground/10" />;
}

function TbButton({
  label,
  children,
  onRun,
  onOpen,
  expanded,
}: {
  label: string;
  children: ReactNode;
  /** For formatting commands: keep the editor selection (preventDefault on mousedown). */
  onRun?: () => void;
  /** For controls that open a panel/menu (needs to steal focus normally). */
  onOpen?: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-haspopup={onOpen ? true : undefined}
      aria-expanded={onOpen ? !!expanded : undefined}
      onMouseDown={onRun ? (e) => e.preventDefault() : undefined}
      onClick={onOpen ?? onRun}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-foreground/70 hover:bg-white hover:text-foreground/90 hover:shadow-[0_1px_2px_rgba(42,38,32,0.08)] motion-safe:transition-colors"
    >
      {children}
    </button>
  );
}

function MiniForm({
  label,
  value,
  onChange,
  onConfirm,
  onCancel,
  confirmLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
}) {
  return (
    <div className="mb-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
      <label className="bo-eyebrow block mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onConfirm();
            }
          }}
          placeholder="https://…"
          className="bo-input px-3 py-2 text-sm flex-1"
        />
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1.5 rounded-lg text-xs bg-[#4d6350] text-white hover:bg-[#415440]"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs text-foreground/55 hover:bg-foreground/[0.06]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
