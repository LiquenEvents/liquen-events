"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import { SkeletonList } from "./Skeleton";

interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "nome", label: "Nome do cliente" },
  { key: "link", label: "Ligação (ex.: proposta)" },
  { key: "valor", label: "Valor / montante" },
  { key: "data_evento", label: "Data do evento" },
  { key: "local", label: "Local do evento" },
  { key: "empresa", label: "Nome da empresa" },
];

const inputCls = "bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22";

export default function EmailTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // editor draft (subject + body) for the selected template
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
    setBody(t.body);
  }

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  const dirty = selected ? subject !== selected.subject || body !== selected.body : false;

  function insertMerge(field: string) {
    const token = `{${field}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    // restore caret just after the inserted token
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function save() {
    if (!selected || saving) return;
    if (!subject.trim()) {
      toast("O assunto não pode ficar vazio.", "error");
      return;
    }
    setSaving(true);
    try {
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
      toast("Modelo guardado.", "success");
    } catch {
      toast("Não foi possível guardar. Tente novamente.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl">
        <SkeletonList rows={4} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
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
                <p className="text-[10px] text-foreground/30 font-mono mt-0.5 truncate">{t.key}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: editor */}
      {selected ? (
        <div className="bo-card p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="bo-eyebrow">A editar</p>
              <p className="text-sm text-foreground/70 mt-1 truncate">{selected.name}</p>
            </div>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className={`px-5 py-2 rounded-xl text-[11px] tracking-[0.18em] uppercase transition-colors shrink-0 ${
                saving || !dirty
                  ? "bg-[#1b2119]/30 text-white/50 cursor-not-allowed"
                  : "bg-[#1b2119] text-white/90 hover:bg-[#2a3227]"
              }`}
            >
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>

          {/* Subject */}
          <label className="bo-eyebrow block mb-1.5">Assunto</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Assunto do email"
            className={`${inputCls} w-full mb-4`}
          />

          {/* Merge-field cheatsheet */}
          <label className="bo-eyebrow block mb-1.5">Campos disponíveis</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {MERGE_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => insertMerge(f.key)}
                title={`${f.label} — clique para inserir`}
                className="px-2 py-1 rounded-md text-[10px] font-mono bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/20 transition-colors"
              >
                {"{" + f.key + "}"}
              </button>
            ))}
          </div>

          {/* Body */}
          <label className="bo-eyebrow block mb-1.5">Corpo (HTML)</label>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            rows={16}
            placeholder="<div>…</div>"
            className={`${inputCls} w-full font-mono !text-xs leading-relaxed resize-y`}
          />

          <p className="text-[10px] text-foreground/30 mt-2 leading-relaxed">
            Escreva HTML. Os campos entre chavetas (ex.:{" "}
            <span className="font-mono text-foreground/45">{"{nome}"}</span>) são substituídos no
            envio; campos sem valor ficam em branco.
          </p>
        </div>
      ) : (
        <div className="bo-card p-8 text-center text-foreground/30 text-sm">
          Selecione um modelo para editar.
        </div>
      )}
    </div>
  );
}
