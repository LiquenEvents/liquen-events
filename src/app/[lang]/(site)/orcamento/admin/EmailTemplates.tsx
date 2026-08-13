"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { useToast } from "./Toast";
import { SkeletonList } from "./Skeleton";
import { Button } from "./ui";
import { RichEmailEditor, type RichEmailEditorHandle } from "./RichEmailEditor";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import {
  extractSimpleText,
  htmlToPlainText,
  insertToken,
  renderPreview,
  renderPreviewSubject,
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE ESCREVEU AQUI NÃO SE DEITA FORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `onClick={() => selectInto(t)}` na lista da esquerda substituía o assunto, o
 * documento visual e o HTML sem guarda nenhuma — apesar de o `dirty` já estar
 * calculado ao lado, a activar o botão «Guardar». Meia hora a compor um email
 * ia-se num clique, sem pergunta e sem aviso. E não havia `beforeunload`:
 * fechar o separador fazia o mesmo, em silêncio.
 *
 * ── Porquê um rascunho local e não gravar sozinho no servidor ──────────────
 *
 * O resto do back office vai passar a gravar sozinho, e aqui isso seria uma
 * má ideia com boas intenções: esta rota (`PUT /api/email-templates`) não
 * guarda um rascunho — PUBLICA. O que ficar gravado é o texto que sai para
 * clientes na hora seguinte, e uma gravação automática a cada 800 ms punha
 * frases a meio («Olá {nome}, venho por este») no email que o próximo cliente
 * recebe. Guardar a mais é a regra em todo o lado; publicar a mais não é
 * guardar a mais, é enviar a mais.
 *
 * Por isso a divisão: **o rascunho grava-se sozinho, a publicação continua a
 * ser um gesto**. O texto por publicar fica no navegador desde a primeira
 * tecla, volta ao voltar ao modelo (e ao recarregar a página), a lista marca
 * quais os modelos que têm trabalho por publicar, e enquanto assim for o ecrã
 * di-lo com as palavras do estúdio: guardado, mas só neste computador.
 *
 * ── E o que fica por fazer ────────────────────────────────────────────────
 *
 * Só neste computador é MENOS do que o estúdio dá (esse leva o rascunho ao
 * servidor). Um rascunho de modelo no servidor precisa de uma gaveta que os
 * modelos ainda não têm — e que não se inventa a meio disto, porque a gaveta
 * errada é a que publica sem querer.
 */
const PREFIXO_RASCUNHO = "liquen-email-template-draft:";
const chaveDoRascunho = (key: string) => `${PREFIXO_RASCUNHO}${key}`;

/** O que se guarda por publicar: tudo o que o editor tem no ecrã. */
interface RascunhoDeModelo {
  subject: string;
  mode: Mode;
  doc: RichDoc;
  htmlBody: string;
  /** Quando ficou escrito no navegador — é a hora que o indicador mostra. */
  at: number;
}

function lerRascunho(key: string): RascunhoDeModelo | null {
  try {
    const cru = localStorage.getItem(chaveDoRascunho(key));
    if (!cru) return null;
    const r = JSON.parse(cru) as Partial<RascunhoDeModelo>;
    // Desconfiança de propósito: isto pode vir de uma versão anterior do ecrã
    // ou de um `localStorage` mexido à mão. O que não tiver forma ignora-se —
    // nunca faz a página estoirar nem publica coisa nenhuma sozinho.
    if (typeof r?.subject !== "string" || (r.mode !== "visual" && r.mode !== "advanced")) {
      return null;
    }
    return {
      subject: r.subject,
      mode: r.mode,
      doc: (r.doc ?? emptyRichDoc()) as RichDoc,
      htmlBody: typeof r.htmlBody === "string" ? r.htmlBody : "",
      at: typeof r.at === "number" ? r.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Devolve se ficou mesmo escrito. Um `false` não é detalhe: é a diferença
 *  entre poder trocar de modelo à vontade e ter de perguntar antes. */
function escreverRascunho(key: string, r: RascunhoDeModelo): boolean {
  try {
    localStorage.setItem(chaveDoRascunho(key), JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

function apagarRascunho(key: string): void {
  try {
    localStorage.removeItem(chaveDoRascunho(key));
  } catch {
    /* indisponível — não há nada a apagar que se possa apagar */
  }
}

/** Que modelos têm trabalho por publicar guardado neste navegador. Lê-se ao
 *  abrir o ecrã para a lista poder marcá-los logo — inclusive os que ficaram
 *  de uma sessão anterior, que são exactamente os que se esqueciam. */
function modelosComRascunho(chaves: string[]): Set<string> {
  const out = new Set<string>();
  for (const k of chaves) if (lerRascunho(k)) out.add(k);
  return out;
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

  /** Os modelos com trabalho por publicar guardado neste navegador. */
  const [porPublicar, setPorPublicar] = useState<Set<string>>(() => new Set());
  /** Quando é que o rascunho deste modelo ficou escrito no navegador. */
  const [rascunhoEm, setRascunhoEm] = useState<Date | null>(null);
  /**
   * O `localStorage` recusou guardar o rascunho (modo privado, quota cheia).
   *
   * É o único caso em que trocar de modelo VOLTA a poder perder trabalho — e
   * por isso é o único caso em que se pergunta antes. Perguntar sempre seria
   * ensinar a carregar em «OK» sem ler.
   */
  const rascunhoFalhou = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email-templates", { cache: "no-store" });
        if (res.ok) {
          const data: EmailTemplate[] = await res.json();
          setTemplates(data);
          setPorPublicar(modelosComRascunho(data.map((t) => t.key)));
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

  /**
   * Abre um modelo: primeiro o que está PUBLICADO (que é o que define a linha
   * de base do «tem alterações?»), e por cima, se houver, o que ficou escrito e
   * ainda não foi publicado.
   *
   * Por esta ordem e não pela inversa: a linha de base tem de ser sempre a
   * versão do servidor, senão o texto recuperado abria como se já estivesse
   * publicado — e o botão «Guardar» apagado é uma maneira silenciosa de dizer
   * «está tudo tratado» a quem ainda tem trabalho por publicar.
   */
  function selectInto(t: EmailTemplate) {
    abrirOPublicado(t);
    const r = lerRascunho(t.key);
    if (!r) {
      setRascunhoEm(null);
      return;
    }
    setSubject(r.subject);
    setMode(r.mode);
    setDoc(r.doc);
    setHtmlBody(r.htmlBody);
    activeFieldRef.current = r.mode === "advanced" ? "advanced" : "visual";
    setRascunhoEm(new Date(r.at));
  }

  function abrirOPublicado(t: EmailTemplate) {
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

  /**
   * ── O RASCUNHO GRAVA-SE SOZINHO, 800 ms DEPOIS DA ÚLTIMA TECLA ────────────
   *
   * O mesmo travão do estúdio, e pela mesma razão: gravar a cada tecla é
   * gravar cem vezes uma frase que ainda está a ser escrita. Escrever no
   * `localStorage` não custa uma ida à rede, mas serializar o documento
   * inteiro a cada letra fazia o editor engasgar-se — e um editor que
   * engasga é um editor onde se escreve pior.
   *
   * Quando NÃO há alterações, o rascunho é apagado: um rascunho igual ao que
   * está publicado não é trabalho por publicar, é ruído à espera de assustar
   * alguém daqui a três semanas.
   */
  const guardarRascunhoAgora = useCallback(() => {
    const chave = selectedKey;
    if (!chave) return;
    if (dirty) {
      const ok = escreverRascunho(chave, { subject, mode, doc, htmlBody, at: Date.now() });
      rascunhoFalhou.current = !ok;
      if (ok) {
        setRascunhoEm(new Date());
        setPorPublicar((prev) => (prev.has(chave) ? prev : new Set(prev).add(chave)));
      }
      return;
    }
    apagarRascunho(chave);
    rascunhoFalhou.current = false;
    setRascunhoEm(null);
    setPorPublicar((prev) => {
      if (!prev.has(chave)) return prev;
      const next = new Set(prev);
      next.delete(chave);
      return next;
    });
  }, [selectedKey, dirty, subject, mode, doc, htmlBody]);

  useEffect(() => {
    const t = setTimeout(guardarRascunhoAgora, 800);
    return () => clearTimeout(t);
  }, [guardarRascunhoAgora]);

  /**
   * ── OS 800 ms SÃO EXACTAMENTE A JANELA EM QUE SE PERDIA TUDO ──────────────
   *
   * O gesto que motivou isto — escrever e clicar noutro modelo — acontece,
   * quase por definição, ANTES de o travão da gravação disparar: escreve-se a
   * última palavra e clica-se. Um rascunho que só existe passados 800 ms não
   * apanhava nada disto. Por isso a troca de modelo grava PRIMEIRO (ver
   * `trocarDeModelo`), e sair do ecrã inteiro grava também.
   */
  const gravacaoPendente = useRef(guardarRascunhoAgora);
  useEffect(() => {
    gravacaoPendente.current = guardarRascunhoAgora;
  }, [guardarRascunhoAgora]);
  useEffect(() => {
    return () => gravacaoPendente.current();
  }, []);

  /**
   * ── ESTE MODELO NO REGISTO DO BACK OFFICE ─────────────────────────────────
   *
   * Este ecrã é o caso estranho do registo, e vale a pena dizer porquê: aqui
   * «guardar» é PUBLICAR — o que ficar gravado é o texto que sai para clientes
   * na hora seguinte. Por isso o gesto «Guardar tudo» NÃO publica nada. O que
   * faz é o mesmo que o ecrã já faz sozinho: põe o rascunho a salvo neste
   * navegador, e diz exactamente isso.
   *
   * E é por isso que se inscreve na mesma, em vez de ficar de fora: um modelo
   * com alterações por publicar é trabalho feito que não existe no servidor. Um
   * botão que dissesse «tudo guardado» com isso à espera estaria a mentir por
   * omissão — e a resposta, quando ela carrega, diz-lhe em duas linhas o que
   * falta fazer e onde.
   */
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: selected ? `Modelo de email «${selected.name}»` : "",
    porGravar: dirty,
    gravarJa: async (): Promise<ResultadoDoEcra> => {
      guardarRascunhoAgora();
      if (rascunhoFalhou.current) {
        // O único caso em que o trabalho não está mesmo em lado nenhum: este
        // computador recusou guardar o rascunho (modo privado, quota cheia).
        return {
          estado: "nao-guardado",
          porque: "Este computador não deixa guardar o rascunho deste modelo.",
        };
      }
      return {
        estado: "so-neste-computador",
        porque: "O modelo só vai para os clientes depois de «Guardar» neste ecrã.",
      };
    },
    activo: !!selected,
  });

  /**
   * Fechar o separador com alterações por publicar.
   *
   * O rascunho local já as segura, portanto isto não é o último recurso que
   * era — é o aviso de que o que está no ecrã ainda NÃO saiu para lado nenhum.
   * E volta a ser o último recurso no computador onde o `localStorage` recusou
   * escrever, que é precisamente onde ninguém está à espera disso.
   *
   * Havendo registo, quem trava é ele — e nomeia o modelo. Sem registo, este
   * continua a valer.
   */
  useEffect(() => {
    if (oRegistoFalaPorMim || !dirty) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [oRegistoFalaPorMim, dirty]);

  /**
   * Trocar de modelo na lista da esquerda.
   *
   * Deixou de deitar fora o que estava escrito: o rascunho fica guardado e
   * volta quando se voltar a este modelo. Só se pergunta quando o rascunho NÃO
   * pôde ser guardado — aí a troca volta a ser destrutiva, e é o único caso em
   * que uma pergunta antes vale mais do que o incómodo de a responder.
   */
  function trocarDeModelo(t: EmailTemplate) {
    if (t.key === selectedKey) return;
    // Guarda ANTES de trocar: o travão de 800 ms ainda não disparou e é
    // precisamente isso que se perdia.
    guardarRascunhoAgora();
    if (dirty && rascunhoFalhou.current) {
      const ok = window.confirm(
        "Este computador não deixa guardar o rascunho, e as alterações que fez a este modelo ainda não foram guardadas. Se mudar de modelo agora, perde-as. Continuar?",
      );
      if (!ok) return;
    }
    selectInto(t);
  }

  /** Deitar fora o que está por publicar — mas por decisão dela, e num botão
   *  que diz o que faz, não como efeito colateral de clicar noutro modelo. */
  function descartarRascunho() {
    if (!selected) return;
    const ok = window.confirm(
      "Descartar as alterações por publicar e voltar ao modelo que está guardado no servidor?",
    );
    if (!ok) return;
    apagarRascunho(selected.key);
    rascunhoFalhou.current = false;
    setRascunhoEm(null);
    setPorPublicar((prev) => {
      const next = new Set(prev);
      next.delete(selected.key);
      return next;
    });
    abrirOPublicado(selected);
  }

  // Live preview: subject + body with example merge values, exactly as the send
  // path resolves them. The preview body is DEFERRED: rebuilding it resets the
  // iframe's srcDoc, which forces the browser to reparse a whole HTML document +
  // reflow — doing that per keystroke made composing an email stutter. The
  // contentEditable stays instant; the iframe catches up after a typing pause.
  // (`dirty`/save use the immediate effectiveBody, so save-state stays exact.)
  // O assunto vai por `renderPreviewSubject`: é um cabeçalho e não leva escape
  // de HTML no envio, por isso a pré-visualização também não o pode levar.
  const previewSubject = renderPreviewSubject(subject);
  const deferredBody = useDeferredValue(effectiveBody);
  const previewSrcDoc = useMemo(() => {
    const rendered = renderPreview(deferredBody);
    return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}body{padding:20px;background:#f7f4ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}</style></head><body>${rendered}</body></html>`;
  }, [deferredBody]);

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
        toast("Não foi possível guardar. Tenta novamente.", "error");
        return;
      }
      const saved: EmailTemplate = await res.json();
      setTemplates((prev) => prev.map((t) => (t.key === saved.key ? saved : t)));
      setBaselineBody(saved.body);
      setSavedKey(saved.key);
      // Publicado: o rascunho já não representa trabalho por publicar. Deixá-lo
      // ficar era pior do que não o ter — daqui a uma semana ressuscitava por
      // cima de uma versão já enviada a clientes.
      apagarRascunho(saved.key);
      rascunhoFalhou.current = false;
      setRascunhoEm(null);
      setPorPublicar((prev) => {
        if (!prev.has(saved.key)) return prev;
        const next = new Set(prev);
        next.delete(saved.key);
        return next;
      });
      toast("Modelo guardado.", "success");
    } catch {
      toast("Não foi possível guardar. Tenta novamente.", "error");
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
                onClick={() => trocarDeModelo(t)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  active ? "bg-[#4d6350]/10" : "hover:bg-foreground/[0.02]"
                }`}
              >
                <p
                  className={`text-sm truncate ${active ? "text-[#4d6350] font-medium" : "text-foreground/70"}`}
                >
                  {t.name}
                  {/* A MARCA DO TRABALHO POR PUBLICAR.
                      Sem ela, um modelo com meia hora de escrita por publicar
                      é indistinguível dos outros na lista — e o esquecimento
                      passa a ser só uma questão de tempo. Não é só cor: é uma
                      palavra, e vai também no nome acessível do botão. */}
                  {porPublicar.has(t.key) && (
                    <span className="ml-1.5 rounded-full bg-[#c98a2e]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#8a5d13] align-middle">
                      por publicar
                    </span>
                  )}
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
              <div className="flex shrink-0 items-center gap-2">
                {dirty && (
                  <Button variant="ghost" size="sm" onClick={descartarRascunho}>
                    Descartar alterações
                  </Button>
                )}
                <Button
                  variant={showSaved ? "subtle" : "primary"}
                  onClick={save}
                  loading={saving}
                  disabled={saving || !dirty}
                >
                  {saving ? "A guardar…" : showSaved ? "Guardado ✓" : "Guardar"}
                </Button>
              </div>
            </div>

            {/* ONDE É QUE ESTE TEXTO ESTÁ, NESTE MOMENTO.
                As palavras são as do estúdio, porque o facto é o mesmo: o
                trabalho existe e está guardado, mas só neste computador. O que
                muda é a razão — ali é uma avaria, aqui é de propósito, porque
                guardar no servidor seria PUBLICAR e o que está a meio de ser
                escrito não pode sair para clientes. Daí o âmbar e não o
                vermelho: isto é um estado normal do trabalho, não um alarme. */}
            {dirty && (
              <p
                className="mb-4 -mt-1 inline-flex rounded-full bg-[#c98a2e]/15 px-2 py-0.5 text-[11px] font-medium text-[#8a5d13]"
                aria-live="polite"
              >
                {rascunhoEm
                  ? `por publicar — guardado só neste computador às ${rascunhoEm.toLocaleTimeString(
                      "pt-PT",
                      { hour: "2-digit", minute: "2-digit" },
                    )}`
                  : "por publicar — alterações ainda não guardadas"}
              </p>
            )}

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
              Clica para inserir onde está o cursor — no envio, cada campo é preenchido com os dados
              reais.
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
                  Escreve e formata com a barra acima. À direita vês como o cliente recebe.
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
          Seleciona um modelo para editar.
        </div>
      )}
    </div>
  );
}
