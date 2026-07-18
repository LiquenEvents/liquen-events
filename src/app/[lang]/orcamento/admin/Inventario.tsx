"use client";

import { useEffect, useMemo, useState } from "react";
import type { PropItem } from "@/lib/inventory-types";
import { PROP_CATEGORIES } from "@/lib/inventory-types";
import { useToast } from "./Toast";
import { downloadCsv, dateStamp } from "./export";

type Condition = PropItem["condition"];

const CONDITIONS: Condition[] = ["novo", "bom", "usado", "danificado"];

const CONDITION_LABEL: Record<Condition, string> = {
  novo: "Novo",
  bom: "Bom",
  usado: "Usado",
  danificado: "Danificado",
};

// Moss-forward chip palette, matching the back-office accent language.
const CONDITION_CHIP: Record<Condition, { bg: string; text: string }> = {
  novo: { bg: "#e7efe4", text: "#3a5c39" },
  bom: { bg: "#eef1e6", text: "#525a2f" },
  usado: { bg: "#f6efe1", text: "#8a6d2f" },
  danificado: { bg: "#f6e6df", text: "#a03a1a" },
};

interface FormState {
  name: string;
  category: string;
  quantity: string;
  unit: string;
  condition: Condition;
  location: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  category: PROP_CATEGORIES[0],
  quantity: "1",
  unit: "",
  condition: "bom",
  location: "",
  notes: "",
};

function fromItem(i: PropItem): FormState {
  return {
    name: i.name,
    category: i.category,
    quantity: String(i.quantity),
    unit: i.unit ?? "",
    condition: i.condition,
    location: i.location ?? "",
    notes: i.notes ?? "",
  };
}

function toPayload(f: FormState) {
  return {
    name: f.name.trim(),
    category: f.category,
    quantity: Math.max(0, Math.floor(Number(f.quantity) || 0)),
    unit: f.unit.trim(),
    condition: f.condition,
    location: f.location.trim(),
    notes: f.notes.trim(),
  };
}

function ConditionChip({ condition }: { condition: Condition }) {
  const c = CONDITION_CHIP[condition];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[10px] tracking-[0.08em] uppercase font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {CONDITION_LABEL[condition]}
    </span>
  );
}

export default function Inventario() {
  const { toast } = useToast();
  const [items, setItems] = useState<PropItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Todas");
  const [cond, setCond] = useState<"Todos" | Condition>("Todos");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inventario", { cache: "no-store" });
        if (res.ok) setItems(await res.json());
        else toast("Não foi possível carregar o inventário.", "error");
      } catch {
        toast("Erro de ligação ao carregar o inventário.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  async function add() {
    const payload = toPayload(form);
    if (!payload.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created: PropItem = await res.json();
        setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setForm(EMPTY_FORM);
        setAdding(false);
        toast("Item adicionado.", "success");
      } else {
        toast("Não foi possível guardar o item.", "error");
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
    // Optimistic — reconcile with the server response.
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...payload } : i)));
    try {
      const res = await fetch(`/api/inventario/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated: PropItem = await res.json();
        setItems((prev) =>
          prev.map((i) => (i.id === id ? updated : i)).sort((a, b) => a.name.localeCompare(b.name)),
        );
        setEditingId(null);
        toast("Alterações guardadas.", "success");
      } else {
        toast("Não foi possível guardar as alterações.", "error");
      }
    } catch {
      toast("Erro de ligação ao guardar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (!confirm(`Remover o item${it ? ` "${it.name}"` : ""}? Esta ação não pode ser anulada.`))
      return;
    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/inventario/${id}`, { method: "DELETE" });
      if (res.ok) toast("Item removido.", "success");
      else {
        setItems(snapshot);
        toast("Não foi possível remover o item.", "error");
      }
    } catch {
      setItems(snapshot);
      toast("Erro de ligação ao remover.", "error");
    }
  }

  function startEdit(i: PropItem) {
    setEditingId(i.id);
    setEditForm(fromItem(i));
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ["Nome", "Categoria", "Quantidade", "Unidade", "Estado", "Localização", "Notas"],
      ...filtered.map((i) => [
        i.name,
        i.category,
        i.quantity,
        i.unit ?? "",
        CONDITION_LABEL[i.condition],
        i.location ?? "",
        i.notes ?? "",
      ]),
    ];
    downloadCsv(`inventario-${dateStamp()}`, rows);
  }

  const cats = useMemo(
    () => ["Todas", ...Array.from(new Set(items.map((i) => i.category)))],
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => {
        if (cat !== "Todas" && i.category !== cat) return false;
        if (cond !== "Todos" && i.condition !== cond) return false;
        if (
          q &&
          ![i.name, i.category, i.location, i.notes]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))
        )
          return false;
        return true;
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, cat, cond]);

  // Category totals (over the filtered set): distinct items + summed quantity.
  const totals = useMemo(() => {
    const map = new Map<string, { items: number; qty: number }>();
    for (const i of filtered) {
      const t = map.get(i.category) ?? { items: 0, qty: 0 };
      t.items += 1;
      t.qty += i.quantity;
      map.set(i.category, t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totalQty = filtered.reduce((s, i) => s + i.quantity, 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar item…"
            className="bo-input pl-10 pr-3 py-2.5 text-sm text-foreground/70 placeholder-foreground/22"
          />
        </div>
        <select
          value={cond}
          onChange={(e) => setCond(e.target.value as "Todos" | Condition)}
          className="bo-input px-3 py-2.5 text-sm text-foreground/60 sm:w-44"
        >
          <option value="Todos">Todos os estados</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </select>
        {items.length > 0 && (
          <button
            onClick={exportCsv}
            className="px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm shrink-0"
            title="Exportar inventário para CSV"
          >
            Exportar
          </button>
        )}
        <button
          onClick={() => setAdding(!adding)}
          className="px-4 py-2.5 rounded-xl bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors shadow-sm shrink-0"
        >
          {adding ? "Cancelar" : "+ Novo item"}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bo-card p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome *"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="bo-input px-3 py-2 text-sm text-foreground/60"
          >
            {PROP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="Quantidade"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <input
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="Unidade (ex.: un., m, par)"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <select
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
            className="bo-input px-3 py-2 text-sm text-foreground/60"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Localização (ex.: Armazém A, prateleira 3)"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notas"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 sm:col-span-2"
          />
          <button
            onClick={add}
            disabled={!form.name.trim() || saving}
            className="sm:col-span-2 py-2.5 rounded-xl bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors disabled:opacity-40"
          >
            {saving ? "A guardar…" : "Guardar item"}
          </button>
        </div>
      )}

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${cat === c ? "bg-[#1b2119] text-white shadow-sm" : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Category totals */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {totals.map(([c, t]) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-foreground/[0.04] text-[11px] text-foreground/50"
            >
              <span className="text-foreground/70 font-medium">{c}</span>
              <span className="text-foreground/35">
                {t.items} {t.items === 1 ? "item" : "itens"} · {t.qty} un.
              </span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#eef1e6] text-[11px] text-[#525a2f] font-medium">
            Total: {filtered.length} {filtered.length === 1 ? "item" : "itens"} · {totalQty} un.
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="bo-eyebrow text-foreground/30 py-8 text-center">A carregar inventário…</p>
      ) : filtered.length === 0 ? (
        <div className="bo-card p-10 text-center">
          <p className="text-foreground/60 text-sm font-medium mb-1">
            {items.length === 0 ? "Sem itens no inventário" : "Nenhum item encontrado"}
          </p>
          <p className="text-foreground/35 text-xs">
            {items.length === 0
              ? "Registe aqui os adereços e materiais de decoração do estúdio."
              : "Tente outra pesquisa, categoria ou estado."}
          </p>
        </div>
      ) : (
        <div className="bo-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                {["Nome", "Categoria", "Qtd", "Estado", "Localização", ""].map((h, idx) => (
                  <th
                    key={h || "acoes"}
                    className={`bo-eyebrow text-foreground/35 font-medium px-4 py-3 ${idx === 2 ? "text-right" : "text-left"} ${idx === 5 ? "text-right" : ""}`}
                  >
                    {idx === 5 ? "Ações" : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) =>
                editingId === i.id ? (
                  <tr
                    key={i.id}
                    className="border-b border-foreground/[0.06] bg-foreground/[0.015]"
                  >
                    <td className="px-4 py-2">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Nome *"
                        className="bo-input px-2 py-1.5 text-sm text-foreground/70 w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="bo-input px-2 py-1.5 text-sm text-foreground/60 w-full"
                      >
                        {PROP_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                        className="bo-input px-2 py-1.5 text-sm text-foreground/70 w-20 text-right"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.condition}
                        onChange={(e) =>
                          setEditForm({ ...editForm, condition: e.target.value as Condition })
                        }
                        className="bo-input px-2 py-1.5 text-sm text-foreground/60 w-full"
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {CONDITION_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                        placeholder="Localização"
                        className="bo-input px-2 py-1.5 text-sm text-foreground/70 w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => saveEdit(i.id)}
                          disabled={!editForm.name.trim() || saving}
                          className="px-3 py-1.5 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[#2a3227] transition-colors disabled:opacity-40"
                        >
                          {saving ? "…" : "Guardar"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-foreground/40 text-[10px] uppercase tracking-[0.1em] hover:text-foreground/60 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={i.id}
                    className="group border-b border-foreground/[0.06] hover:bg-foreground/[0.015] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-foreground/78 font-medium">{i.name}</p>
                      {i.notes && (
                        <p className="text-foreground/35 text-xs mt-0.5 line-clamp-1">{i.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#4d6350]/70 text-[11px] tracking-[0.1em] uppercase">
                      {i.category}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground/70 tabular-nums whitespace-nowrap">
                      {i.quantity}
                      {i.unit ? <span className="text-foreground/35"> {i.unit}</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <ConditionChip condition={i.condition} />
                    </td>
                    <td className="px-4 py-3 text-foreground/45">{i.location || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(i)}
                          className="text-foreground/20 hover:text-[#4d6350] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                          aria-label="Editar"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => remove(i.id)}
                          className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all text-base leading-none px-1"
                          aria-label="Remover"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
