"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import { SkeletonList } from "./Skeleton";
import { RichEmailEditor, type RichEmailEditorHandle } from "./RichEmailEditor";
import {
  extractSimpleText,
  htmlToPlainText,
  insertToken,
  renderPreview,
} from "@/lib/email-template-format";
import {
  buildRichEmailHtml,
  docFromPlainText,
  emptyRichDoc,
  extractRichDoc,
  type RichDoc,
} from "@/lib/email-rich-format";

interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

/** Merge fields, each with a plain-language hint for the tooltip. */
const MERGE_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "nome", label: "Nome do cliente", hint: "insere o nome do cliente" },
  { key: "link", label: "Ligação", hint: "insere a ligação para a proposta" },
  { key: "valor", label: "Valor", hint: "insere o valor / montante" },
  { key: "data_evento", label: "Data do evento", hint: "insere a data do evento" },
  { key: "local", label: "Local", hint: "insere o local do evento" },
  { key: "empresa", label: "Empresa", hint: "insere o nome da empresa" },
];

/** One-line explanation of when each template is sent. */
const DESCRIPTIONS: Record<string, string> = {
  "proposta-enviada": "Enviado ao cliente quando a proposta segue.",
  "sinal-recebido": "Enviado quando o sinal é recebido e a reserva fica confirmada.",
  "semana-evento": "Enviado na semana anterior ao evento.",
  agradecimento: "Enviado depois do evento, a agradecer ao cliente.",
};

type Mode = "visual" | "advanced";
type Field = "subject" | "visual" | "advanced";

const inputCls = "bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22";

/** The body as stored/sent, given the current editor state. */
function computeBody(mode: Mode, doc: RichDoc, html: string): string {
  return mode === "advanced" ? html : buildRichEmailHtml(doc);
}

export default function EmailTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Editor draft. `doc` is the visual (WYSIWYG) document model; `htmlBody` is the
  // hand-written HTML of the secondary "HTML avançado" escape hatch. `mode`
  // decides which is active. `baselineBody` is the stored/last-saved body used
  // for the dirty check (so re-opening a template is never falsely "dirty").
  const [subject, setSubject] = useState("");
  const [doc, setDoc] = useState<RichDoc>(emptyRichDoc);
  const [htmlBody, setHtmlBody] = useState("");
  const [mode, setMode] = useState<Mode>("visual");
  const [baselineBody, setBaselineBody] = useState("");

  const subjectRef = useRef<HTMLInputElement>(null);
  const advancedRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<RichEmailEditorHandle>(null);
  // Which editable last held focus — the merge chips insert into this one.
  const activeFieldRef = useRef<Field>("visual");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email-templates", { cache: "no-store" });
        if (res.ok) {
          const data: EmailTemplate[] = await res.json();
          setTemplates(data);
          if (data.length) selectInto(data[0]);
        } else {
          toast("Não foi possível carregar os modelos.", "error");
        }
      } catch {
        toast("Não foi possível carregar os modelos.", "error");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectInto(t: EmailTemplate) {
    setSelectedKey(t.key);
    setSubject(t.subject);
    setHtmlBody(t.body);

    const rich = extractRichDoc(t.body);
    if (rich) {
      // Already a visual template — restore the model exactly.
      setDoc(rich);
      setMode("visual");
      setBaselineBody(computeBody("visual", rich, t.body));
      activeFieldRef.current = "visual";
      return;
    }
    const simple = extractSimpleText(t.body);
    if (simple !== null) {
      // Older "modo simples" template — open its paragraphs in the visual editor.
      const converted = docFromPlainText(simple);
      setDoc(converted);
      setMode("visual");
      setBaselineBody(computeBody("visual", converted, t.body));
      activeFieldRef.current = "visual";
      return;
    }
    // Hand-written HTML — open the advanced escape hatch so nothing is mangled.
    setDoc(emptyRichDoc());
    setMode("advanced");
    setBaselineBody(t.body);
    activeFieldRef.current = "advanced";
  }

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  const effectiveBody = computeBody(mode, doc, htmlBody);
  const dirty = selected ? subject !== selected.subject || effectiveBody !== baselineBody : false;

  // Live preview: subject + body with example merge values, exactly as the send
  // path resolves them.
  const previewSubject = renderPreview(subject);
  const previewSrcDoc = useMemo(() => {
    const rendered = renderPreview(effectiveBody);
    return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}body{padding:20px;background:#f7f4ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}</style></head><body>${rendered}</body></html>`;
  }, [effectiveBody]);

  function insertMerge(field: string) {
    const token = `{${field}}`;
    const which = activeFieldRef.current;
    if (which === "visual") {
      editorRef.current?.insertToken(token);
      return;
    }
    const target =
      which === "advanced"
        ? { ref: advancedRef, value: htmlBody, set: setHtmlBody }
        : { ref: subjectRef, value: subject, set: setSubject };
    const el = target.ref.current;
    if (!el) {
      target.set(target.value + token);
      return;
    }
    const start = el.selectionStart ?? target.value.length;
    const end = el.selectionEnd ?? target.value.length;
    const { text, caret } = insertToken(target.value, start, end, token);
    target.set(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  /** Switch to the hand-HTML escape hatch, seeding it with the current body. */
  function switchToAdvanced() {
    setHtmlBody(computeBody("visual", doc, htmlBody));
    setMode("advanced");
    activeFieldRef.current = "advanced";
  }

  /** Return to the visual editor, recovering the model when possible. */
  function switchToVisual() {
    const rich = extractRichDoc(htmlBody);
    if (rich) {
      setDoc(rich);
      setMode("visual");
      activeFieldRef.current = "visual";
      return;
    }
    const simple = extractSimpleText(htmlBody);
    if (simple !== null) {
      setDoc(docFromPlainText(simple));
      setMode("visual");
      activeFieldRef.current = "visual";
      return;
    }
    const ok = window.confirm(
      "Este HTML foi escrito à mão. Ao voltar ao editor visual, a formatação avançada é convertida em texto simples e pode perder-se. Continuar?",
    );
    if (!ok) return;
    setDoc(docFromPlainText(htmlToPlainText(htmlBody)));
    setMode("visual");
    activeFieldRef.current = "visual";
  }

  async function save() {
    if (!selected || saving) return;
    if (!subject.trim()) {
      toast("O assunto não pode ficar vazio.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = effectiveBody;
      const res = await fetch("/api/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selected.key,
          name: selected.name,
          subject: subject.trim(),
          body,
        }),
      });
      if (!res.ok) {
        toast("Não foi possível guardar. Tente novamente.", "error");
        return;
      }
      const saved: EmailTemplate = await res.json();
      setTemplates((prev) => prev.map((t) => (t.key === saved.key ? saved : t)));
      setBaselineBody(saved.body);
      setSavedKey(saved.key);
      toast("Modelo guardado.", "success");
    } catch {
      toast("Não foi possível guardar. Tente novamente.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const showSaved = !dirty && !saving && savedKey === selectedKey;

  return (
    <div className="max-w-6xl grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
      {/* Left: template list */}
      <div className="bo-card overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-foreground/[0.07]">
          <p className="bo-eyebrow">Modelos ({templates.length})</p>
        </div>
        <div className="divide-y divide-foreground/[0.06]">
          {templates.map((t) => {
            const active = t.key === selectedKey;
            return (
              <button
                key={t.key}
                onClick={() => selectInto(t)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  active ? "bg-[#4d6350]/10" : "hover:bg-foreground/[0.02]"
                }`}
              >
                <p
                  className={`text-sm truncate ${active ? "text-[#4d6350] font-medium" : "text-foreground/70"}`}
                >
                  {t.name}
                </p>
                <p className="text-[11px] text-foreground/40 mt-0.5 leading-snug">
                  {DESCRIPTIONS[t.key] ?? "Modelo de email."}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: editor + live preview */}
      {selected ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {/* Editor */}
          <div className="bo-card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="bo-eyebrow">A editar</p>
                <p className="text-sm text-foreground/70 mt-1 truncate">{selected.name}</p>
                <p className="text-[11px] text-foreground/40 mt-1 leading-snug">
                  {DESCRIPTIONS[selected.key] ?? "Modelo de email."}
                </p>
              </div>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className={`px-5 py-2 rounded-xl text-[11px] tracking-[0.18em] uppercase transition-colors shrink-0 ${
                  saving || !dirty
                    ? showSaved
                      ? "bg-[#4d6350]/12 text-[#4d6350] cursor-default"
                      : "bg-[#1b2119]/30 text-white/50 cursor-not-allowed"
                    : "bg-[#1b2119] text-white/90 hover:bg-[#2a3227]"
                }`}
              >
                {saving ? "A guardar…" : showSaved ? "Guardado ✓" : "Guardar"}
              </button>
            </div>

            {/* Subject */}
            <label htmlFor="et-subject" className="bo-eyebrow block mb-1.5">
              Assunto
            </label>
            <input
              id="et-subject"
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => (activeFieldRef.current = "subject")}
              placeholder="Assunto do email"
              className={`${inputCls} w-full mb-4`}
            />

            {/* Merge-field insert buttons */}
            <label className="bo-eyebrow block mb-1.5">Dados do cliente</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  // Keep the editor's selection when clicking a chip so the token
                  // lands at the caret rather than the field losing focus first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMerge(f.key)}
                  title={f.hint}
                  className="px-2.5 py-1 rounded-md text-[11px] bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/20 transition-colors"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mb-4 leading-relaxed">
              Clique num botão para inserir o dado do cliente onde está o cursor. No envio, cada
              campo é substituído pelos dados reais.
            </p>

            {/* Body */}
            <div className="flex items-center justify-between mb-1.5">
              <label className="bo-eyebrow">Mensagem</label>
              {mode === "visual" ? (
                <button
                  type="button"
                  onClick={switchToAdvanced}
                  className="text-[11px] text-foreground/35 hover:text-foreground/60 underline underline-offset-2"
                >
                  HTML avançado
                </button>
              ) : (
                <button
                  type="button"
                  onClick={switchToVisual}
                  className="text-[11px] text-[#4d6350] hover:text-[#415440] underline underline-offset-2"
                >
                  ← Voltar ao editor visual
                </button>
              )}
            </div>

            {mode === "visual" ? (
              <>
                <RichEmailEditor
                  key={`${selectedKey}:visual`}
                  ref={editorRef}
                  initialDoc={doc}
                  onChange={setDoc}
                  onFocus={() => (activeFieldRef.current = "visual")}
                />
                <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                  Escreva e formate a mensagem com a barra acima. Use os botões dos dados do cliente
                  para inserir campos. À direita vê exatamente como o cliente a recebe.
                </p>
              </>
            ) : (
              <>
                <textarea
                  ref={advancedRef}
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  onFocus={() => (activeFieldRef.current = "advanced")}
                  spellCheck={false}
                  rows={16}
                  placeholder="<div>…</div>"
                  className={`${inputCls} w-full font-mono !text-xs leading-relaxed resize-y`}
                  aria-label="HTML do email"
                />
                <p className="text-[11px] text-foreground/40 mt-2 leading-relaxed">
                  Modo secundário para quem sabe HTML. Os campos entre chavetas (ex.:{" "}
                  <span className="font-mono text-foreground/55">{"{nome}"}</span>) são substituídos
                  no envio. À direita vê como fica.
                </p>
              </>
            )}
          </div>

          {/* Live preview */}
          <div className="bo-card p-5 xl:sticky xl:top-5">
            <p className="bo-eyebrow mb-1.5">Pré-visualização</p>
            <p className="text-[11px] text-foreground/40 mb-3 leading-relaxed">
              É assim que o cliente vê o email, com dados de exemplo.
            </p>
            <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
              <div className="px-3 py-2 bg-foreground/[0.03] border-b border-foreground/[0.06]">
                <p className="text-[10px] text-foreground/40">Assunto</p>
                <p className="text-sm text-foreground/75 truncate">
                  {previewSubject || <span className="text-foreground/30">(sem assunto)</span>}
                </p>
              </div>
              <iframe
                title="Pré-visualização do email"
                srcDoc={previewSrcDoc}
                sandbox=""
                className="w-full block bg-[#f7f4ee]"
                style={{ height: 460, border: "none" }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bo-card p-8 text-center text-foreground/30 text-sm">
          Selecione um modelo para editar.
        </div>
      )}
    </div>
  );
}
