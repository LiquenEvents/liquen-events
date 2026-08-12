"use client";

import { useMemo, useState, useDeferredValue, useRef } from "react";
import type { MaterialItem, MaterialKind } from "@/lib/material-types";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  MATERIAL_KIND_LABEL,
  abaixoDoMinimo,
} from "@/lib/material-types";
import type { PlanoCsv } from "@/lib/material-csv";
import { useToast } from "./Toast";
import { downloadCsv, dateStamp } from "./export";
import { Button, Card, EmptyState, Field, Segmented, Toolbar } from "./ui";
import MaterialListas from "./MaterialListas";
import MaterialRegras from "./MaterialRegras";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";

/**
 * CATÁLOGO DE MATERIAL DE LOGÍSTICA.
 *
 * O que faz a montagem acontecer: escadote, extensões, ferramentas, fita-cola,
 * sacos do lixo. NÃO são adereços — esses vivem no ecrã Inventário e são outra
 * coisa (MATERIAL.md §0.1).
 *
 * O que este ecrã tem e o Inventário não:
 *  • `kind` — consumível gasta-se e desconta; reutilizável tem de VOLTAR;
 *  • `minStock` — abaixo dele, entra na lista de compras. Sem mínimo, não se
 *    vigia, e é por isso que o campo distingue vazio de zero;
 *  • importação CSV com pré-visualização, porque quem carrega isto passa o
 *    inventário todo de uma vez e um ficheiro mal lido custa mais a desfazer
 *    do que a escrever de novo.
 */

const KIND_CHIP: Record<MaterialKind, { bg: string; text: string }> = {
  consumivel: { bg: "#f6efe1", text: "#8a6d2f" },
  reutilizavel: { bg: "#e7efe4", text: "#3a5c39" },
};

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

interface FormState {
  name: string;
  category: string;
  kind: MaterialKind;
  unit: string;
  stock: string;
  minStock: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  category: MATERIAL_CATEGORIES[0],
  kind: "reutilizavel",
  unit: "unidade",
  stock: "1",
  minStock: "",
  notes: "",
};

function fromItem(i: MaterialItem): FormState {
  return {
    name: i.name,
    category: i.category,
    kind: i.kind,
    unit: i.unit ?? "",
    stock: String(i.stock),
    minStock: typeof i.minStock === "number" ? String(i.minStock) : "",
    notes: i.notes ?? "",
  };
}

function toPayload(f: FormState) {
  const min = f.minStock.trim();
  return {
    name: f.name.trim(),
    category: f.category,
    kind: f.kind,
    unit: f.unit.trim(),
    stock: Math.max(0, Number(f.stock.replace(",", ".")) || 0),
    // Vazio vai como `null` — a instrução "não vigies este item" — e não como
    // 0, que seria "avisa-me quando houver menos do que nenhum".
    minStock: min === "" ? null : Math.max(0, Number(min.replace(",", ".")) || 0),
    notes: f.notes.trim(),
  };
}

function KindChip({ kind }: { kind: MaterialKind }) {
  const c = KIND_CHIP[kind];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[10px] tracking-[0.08em] uppercase font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {MATERIAL_KIND_LABEL[kind]}
    </span>
  );
}

export default function Material() {
  // Catálogo e listas são a mesma matéria vista de dois ângulos — o que existe,
  // e o que costuma ir junto — por isso vivem no mesmo sítio em vez de
  // ocuparem duas entradas do menu.
  const [aba, setAba] = useState<"catalogo" | "listas" | "regras">("catalogo");
  return (
    <Card>
      <Segmented
        ariaLabel="Catálogo, listas base ou regras"
        value={aba}
        onChange={(v) => setAba(v as "catalogo" | "listas" | "regras")}
        options={[
          { value: "catalogo", label: "Catálogo" },
          { value: "listas", label: "Listas base" },
          { value: "regras", label: "Regras" },
        ]}
      />
      <div className="mt-5">
        {aba === "catalogo" ? (
          <Catalogo />
        ) : aba === "listas" ? (
          <MaterialListas />
        ) : (
          <MaterialRegras />
        )}
      </div>
    </Card>
  );
}

function Catalogo() {
  const { toast } = useToast();
  const {
    data: items = [],
    setData: setItems,
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<MaterialItem[]>("material", "/api/material");
  const [search, setSearch] = useState("");
  const dSearch = useDeferredValue(search);
  const [cat, setCat] = useState("Todas");
  const [kind, setKind] = useState<"Todos" | MaterialKind>("Todos");
  /** Só o que está abaixo do mínimo — o atalho para a lista de compras. */
  const [soEmFalta, setSoEmFalta] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Importação CSV ────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [plano, setPlano] = useState<PlanoCsv | null>(null);
  const [importando, setImportando] = useState(false);

  const emFalta = useMemo(() => items.filter(abaixoDoMinimo), [items]);

  const visiveis = useMemo(() => {
    const q = dSearch.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== "Todas" && i.category !== cat) return false;
      if (kind !== "Todos" && i.kind !== kind) return false;
      if (soEmFalta && !abaixoDoMinimo(i)) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, dSearch, cat, kind, soEmFalta]);

  async function add() {
    const payload = toPayload(form);
    if (!payload.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created: MaterialItem = await res.json();
        setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setForm(EMPTY_FORM);
        setAdding(false);
        toast("Material adicionado.", "success");
      } else {
        toast("Não foi possível guardar.", "error");
      }
    } catch {
      toast("Erro de ligação ao guardar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    const payload = toPayload(editForm);
    if (!payload.name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/material/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated: MaterialItem = await res.json();
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
        setEditingId(null);
        toast("Guardado.", "success");
      } else {
        toast("Não foi possível guardar.", "error");
      }
    } catch {
      toast("Erro de ligação ao guardar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const antes = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/material/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      // Reversão: o catálogo no ecrã não pode divergir do que está gravado.
      setItems(antes);
      toast("Não foi possível remover.", "error");
    }
  }

  function pedirFicheiro() {
    fileRef.current?.click();
  }

  async function lerFicheiro(file: File) {
    const texto = await file.text();
    setCsv(texto);
    setImportando(true);
    try {
      const res = await fetch("/api/material/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: texto, aplicar: false }),
      });
      if (!res.ok) throw new Error();
      setPlano(await res.json());
    } catch {
      toast("Não foi possível ler o ficheiro.", "error");
      setCsv(null);
    } finally {
      setImportando(false);
    }
  }

  async function aplicarImportacao() {
    if (!csv) return;
    setImportando(true);
    try {
      const res = await fetch("/api/material/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, aplicar: true }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json();
      // Recarrega em vez de remendar o estado: a importação mexe em muitas
      // linhas de uma vez e adivinhar o resultado aqui era a maneira de o ecrã
      // ficar a dizer uma coisa e a base de dados outra.
      const lista = await fetch("/api/material").then((x) => x.json());
      setItems(lista);
      setCsv(null);
      setPlano(null);
      toast(
        `${r.criados} novos, ${r.atualizados} atualizados` +
          (r.ignorados ? `, ${r.ignorados} ignorados` : "") +
          ".",
        "success",
      );
    } catch {
      toast("A importação falhou.", "error");
    } finally {
      setImportando(false);
    }
  }

  function exportar() {
    // O cabeçalho é o MESMO que a importação lê: exportar, corrigir no Excel e
    // reimportar tem de ser uma volta fechada, senão a exportação é um beco.
    downloadCsv(`material-${dateStamp()}.csv`, [
      ["nome", "categoria", "unidade", "tipo", "stock", "minimo", "notas"],
      ...items.map((i) => [
        i.name,
        i.category,
        i.unit ?? "",
        i.kind,
        String(i.stock),
        typeof i.minStock === "number" ? String(i.minStock) : "",
        i.notes ?? "",
      ]),
    ]);
  }

  // O `Field` DESENHA o controlo — recebe as propriedades dele e devolve
  // `<label for>` + `<input>`/`<select>` já ligados. Passar-lhe um `<input>`
  // por dentro punha um filho num elemento vazio e o React abortava o ecrã
  // inteiro (era isto que fazia o Material "não funcionar"). Ver `ui/Field`.
  const campos = (f: FormState, set: (f: FormState) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field
        label="Nome"
        value={f.name}
        onChange={(e) => set({ ...f, name: e.target.value })}
        placeholder="Escadote 3 degraus"
      />
      <Field
        as="select"
        label="Categoria"
        value={f.category}
        onChange={(e) => set({ ...f, category: e.target.value })}
      >
        {MATERIAL_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Field>
      <Field
        as="select"
        label="Tipo"
        value={f.kind}
        onChange={(e) => set({ ...f, kind: e.target.value as MaterialKind })}
      >
        <option value="reutilizavel">Reutilizável (tem de voltar)</option>
        <option value="consumivel">Consumível (gasta-se)</option>
      </Field>
      <div>
        <Field
          label="Unidade"
          list="material-units"
          value={f.unit}
          onChange={(e) => set({ ...f, unit: e.target.value })}
        />
        <datalist id="material-units">
          {MATERIAL_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>
      <Field
        label="Stock"
        inputMode="decimal"
        value={f.stock}
        onChange={(e) => set({ ...f, stock: e.target.value })}
      />
      <Field
        label="Mínimo (vazio = não vigiar)"
        inputMode="decimal"
        value={f.minStock}
        onChange={(e) => set({ ...f, minStock: e.target.value })}
        placeholder="—"
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Field
          label="Notas"
          value={f.notes}
          onChange={(e) => set({ ...f, notes: e.target.value })}
          placeholder="Onde está guardado, cuidados, o que costuma faltar…"
        />
      </div>
    </div>
  );

  return (
    <>
      <Toolbar>
        <input
          className="bo-input max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar material…"
          aria-label="Procurar material"
        />
        <select
          className="bo-input w-auto"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option>Todas</option>
          {MATERIAL_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          className="bo-input w-auto"
          value={kind}
          onChange={(e) => setKind(e.target.value as "Todos" | MaterialKind)}
          aria-label="Filtrar por tipo"
        >
          <option value="Todos">Todos</option>
          <option value="reutilizavel">Reutilizável</option>
          <option value="consumivel">Consumível</option>
        </select>
        {emFalta.length > 0 && (
          <Button
            size="sm"
            variant={soEmFalta ? "primary" : "ghost"}
            onClick={() => setSoEmFalta((v) => !v)}
          >
            Abaixo do mínimo ({emFalta.length})
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={exportar}>
            Exportar
          </Button>
          <Button size="sm" variant="ghost" onClick={pedirFicheiro}>
            Importar CSV
          </Button>
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {PlusIcon}
            Adicionar
          </Button>
        </div>
      </Toolbar>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lerFicheiro(f);
          // Limpa o valor para reimportar o MESMO ficheiro depois de o corrigir
          // no Excel — sem isto, escolher o mesmo nome não disparava nada.
          e.target.value = "";
        }}
      />

      {/* ── Pré-visualização da importação ──────────────────────────────── */}
      {plano && (
        <div className="mt-4 rounded-xl border border-foreground/12 bg-foreground/[0.02] p-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-sm font-medium">Antes de gravar:</p>
            <p className="text-sm text-foreground/75">
              <strong>{plano.novos}</strong> novos · <strong>{plano.atualizados}</strong>{" "}
              atualizados
              {plano.erros > 0 && (
                <>
                  {" · "}
                  <strong className="text-[#a03a1a]">{plano.erros}</strong> por perceber
                </>
              )}
            </p>
          </div>

          {plano.erros > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-foreground/70">
              {plano.linhas
                .filter((l) => l.estado === "erro")
                .slice(0, 8)
                .map((l) => (
                  <li key={l.linha}>
                    <span className="font-medium">Linha {l.linha}:</span> {l.erro}
                  </li>
                ))}
              {plano.erros > 8 && <li>… e mais {plano.erros - 8}.</li>}
            </ul>
          )}

          <p className="bo-text-muted mt-3 text-xs">
            As linhas por perceber não são gravadas. As outras entram na mesma.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={aplicarImportacao}
              disabled={importando || plano.novos + plano.atualizados === 0}
            >
              {importando ? "A gravar…" : "Gravar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPlano(null);
                setCsv(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {adding && (
        <div className="mt-4 rounded-xl border border-foreground/12 p-4">
          {campos(form, setForm)}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={add} disabled={saving || !form.name.trim()}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {/* A falha ANTES do estado vazio: sem isto, uma leitura que rebentou
          aparecia como "Catálogo vazio" e mandava-a carregar o que já lá
          estava. Ver `AvisoDeFalha`. */}
      {error && items.length === 0 ? (
        <AvisoDeFalha
          titulo="Não foi possível ler o material"
          mensagem={errorMessage}
          aoTentarDeNovo={refresh}
        />
      ) : loading && items.length === 0 ? (
        <p className="bo-text-muted mt-6 text-sm">A carregar…</p>
      ) : visiveis.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Catálogo vazio" : "Nada com estes filtros"}
          description={
            items.length === 0
              ? "Adiciona o material à mão, ou importa o inventário de uma vez a partir de um CSV."
              : "Experimenta outra categoria, outro tipo, ou limpa a pesquisa."
          }
        />
      ) : (
        <ul className="mt-4 divide-y divide-foreground/[0.08]">
          {visiveis.map((i) =>
            editingId === i.id ? (
              <li key={i.id} className="py-4">
                {campos(editForm, setEditForm)}
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={() => saveEdit(i.id)} disabled={saving}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancelar
                  </Button>
                </div>
              </li>
            ) : (
              <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="font-medium">{i.name}</span>
                <KindChip kind={i.kind} />
                <span className="bo-text-muted text-xs">{i.category}</span>
                <span className="text-sm">
                  {i.stock}
                  {i.unit ? ` ${i.unit}` : ""}
                </span>
                {abaixoDoMinimo(i) && (
                  <span className="rounded-md bg-[#f6e6df] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[#a03a1a] uppercase">
                    Repor (mín. {i.minStock})
                  </span>
                )}
                {i.notes && <span className="bo-text-muted text-xs">{i.notes}</span>}
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(i.id);
                      setEditForm(fromItem(i));
                    }}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(i.id)}>
                    Remover
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  );
}
