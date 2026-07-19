"use client";

import { useEffect, useMemo, useState } from "react";
import type { PropItem } from "@/lib/inventory-types";
import { PROP_CATEGORIES } from "@/lib/inventory-types";
import { useToast } from "./Toast";
import { downloadCsv, dateStamp } from "./export";
import { Button, Card, EmptyState, Field, Toolbar } from "./ui";

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
      <Toolbar
        className="mb-6"
        start={
          <>
            <div className="relative w-full max-w-md sm:w-72">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar item…"
                aria-label="Procurar itens do inventário"
                className="bo-input py-2.5 pl-10 pr-3 text-sm text-foreground/80 placeholder-foreground/30"
              />
            </div>
            <select
              value={cond}
              onChange={(e) => setCond(e.target.value as "Todos" | Condition)}
              aria-label="Filtrar por estado"
              className="bo-input px-3 py-2.5 text-sm text-foreground/70 sm:w-44"
            >
              <option value="Todos">Todos os estados</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </select>
          </>
        }
        end={
          <>
            {items.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={exportCsv}
                title="Exportar inventário para CSV"
              >
                Exportar
              </Button>
            )}
            <Button
              variant={adding ? "secondary" : "primary"}
              size="sm"
              iconLeft={adding ? undefined : PlusIcon}
              onClick={() => setAdding(!adding)}
            >
              {adding ? "Cancelar" : "Novo item"}
            </Button>
          </>
        }
      />

      {/* Add form */}
      {adding && (
        <Card padding="sm" className="mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do item"
            />
            <Field
              as="select"
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {PROP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Field>
            <Field
              label="Quantidade"
              type="number"
              min={0}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Quantidade"
            />
            <Field
              label="Unidade"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="Ex.: un., m, par"
            />
            <Field
              as="select"
              label="Estado"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </Field>
            <Field
              label="Localização"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Ex.: Armazém A, prateleira 3"
            />
            <Field
              containerClassName="sm:col-span-2"
              label="Notas"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas"
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={add} loading={saving} disabled={!form.name.trim() || saving}>
              Guardar item
            </Button>
          </div>
        </Card>
      )}

      {/* Category chips */}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
        {cats.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={cat === c ? "subtle" : "ghost"}
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      {/* Category totals */}
      {!loading && filtered.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {totals.map(([c, t]) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/[0.04] px-2.5 py-1 text-[11px] text-foreground/50"
            >
              <span className="font-medium text-foreground/70">{c}</span>
              <span className="text-foreground/35">
                {t.items} {t.items === 1 ? "item" : "itens"} · {t.qty} un.
              </span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#eef1e6] px-2.5 py-1 text-[11px] font-medium text-[#525a2f]">
            Total: {filtered.length} {filtered.length === 1 ? "item" : "itens"} · {totalQty} un.
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bo-skeleton h-9 w-full" aria-hidden />
            ))}
          </div>
          <p className="sr-only">A carregar inventário…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path
                  d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                  strokeLinejoin="round"
                />
                <path d="M3.27 6.96 12 12l8.73-5.04M12 22V12" strokeLinecap="round" />
              </svg>
            }
            title={items.length === 0 ? "Sem itens no inventário" : "Nenhum item encontrado"}
            description={
              items.length === 0
                ? "Registe aqui os adereços e materiais de decoração do estúdio."
                : "Tente outra pesquisa, categoria ou estado."
            }
            action={
              items.length === 0
                ? { label: "Adicionar item", onClick: () => setAdding(true) }
                : undefined
            }
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                {["Nome", "Categoria", "Qtd", "Estado", "Localização", ""].map((h, idx) => (
                  <th
                    key={h || "acoes"}
                    className={`bo-eyebrow text-foreground/35 font-medium px-4 py-3.5 ${idx === 2 ? "text-right" : "text-left"} ${idx === 5 ? "text-right" : ""}`}
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
                        aria-label="Nome"
                        className="bo-input px-2.5 py-1.5 text-sm text-foreground/80 w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        aria-label="Categoria"
                        className="bo-input px-2.5 py-1.5 text-sm text-foreground/70 w-full"
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
                        aria-label="Quantidade"
                        className="bo-input px-2.5 py-1.5 text-sm text-foreground/80 w-20 text-right"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.condition}
                        onChange={(e) =>
                          setEditForm({ ...editForm, condition: e.target.value as Condition })
                        }
                        aria-label="Estado"
                        className="bo-input px-2.5 py-1.5 text-sm text-foreground/70 w-full"
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
                        aria-label="Localização"
                        className="bo-input px-2.5 py-1.5 text-sm text-foreground/80 w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit(i.id)}
                          loading={saving}
                          disabled={!editForm.name.trim() || saving}
                        >
                          Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={i.id}
                    className="group border-b border-foreground/[0.06] motion-safe:transition-colors hover:bg-foreground/[0.015]"
                  >
                    <td className="px-4 py-3.5">
                      <p className="text-foreground/80 font-medium">{i.name}</p>
                      {i.notes && (
                        <p className="text-foreground/40 text-xs mt-0.5 line-clamp-1">{i.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[#4d6350]/70 text-[11px] tracking-[0.1em] uppercase">
                      {i.category}
                    </td>
                    <td className="px-4 py-3.5 text-right text-foreground/70 tabular-nums whitespace-nowrap">
                      {i.quantity}
                      {i.unit ? <span className="text-foreground/35"> {i.unit}</span> : null}
                    </td>
                    <td className="px-4 py-3.5">
                      <ConditionChip condition={i.condition} />
                    </td>
                    <td className="px-4 py-3.5 text-foreground/50">{i.location || "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(i)}
                          className="text-foreground/25 hover:text-[#4d6350] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 motion-safe:transition-all rounded-md p-1"
                          aria-label="Editar"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => remove(i.id)}
                          className="text-foreground/25 hover:text-[#8a2a22] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 motion-safe:transition-all rounded-md p-1"
                          aria-label="Remover"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
