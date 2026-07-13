"use client";

import { useEffect, useMemo, useState } from "react";
import type { Supplier } from "@/lib/orcamento/types";
import { downloadCsv, dateStamp } from "./export";
import { SkeletonCard } from "./Skeleton";
import EmptyState from "./EmptyState";

const CATEGORIES = [
  "Catering",
  "Floristas",
  "Música/DJ",
  "Fotografia",
  "Vídeo",
  "Decoração",
  "Espaços",
  "Audiovisual",
  "Transporte",
  "Outro",
];

const EMPTY_FORM = {
  name: "",
  category: "Catering",
  phone: "",
  email: "",
  location: "",
  notes: "",
};

export default function Fornecedores() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Todos");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fornecedores", { cache: "no-store" });
        if (res.ok) setSuppliers(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function add() {
    if (!form.name.trim()) return;
    const res = await fetch("/api/fornecedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: "", category: "Catering", phone: "", email: "", location: "", notes: "" });
      setAdding(false);
    }
  }
  async function remove(id: string) {
    const s = suppliers.find((x) => x.id === id);
    if (!confirm(`Remover o fornecedor${s ? ` "${s.name}"` : ""}? Esta ação não pode ser anulada.`))
      return;
    setSuppliers((prev) => prev.filter((x) => x.id !== id));
    await fetch(`/api/fornecedores/${id}`, { method: "DELETE" });
  }

  async function patchSupplier(id: string, patch: Partial<Supplier>) {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await fetch(`/api/fornecedores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      category: s.category,
      phone: s.phone ?? "",
      email: s.email ?? "",
      location: s.location ?? "",
      notes: s.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    await patchSupplier(id, editForm);
    setEditingId(null);
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ["Nome", "Categoria", "Telefone", "Email", "Localização", "Notas"],
      ...filtered.map((s) => [
        s.name,
        s.category,
        s.phone ?? "",
        s.email ?? "",
        s.location ?? "",
        s.notes ?? "",
      ]),
    ];
    downloadCsv(`fornecedores-${dateStamp()}`, rows);
  }

  const cats = useMemo(
    () => ["Todos", "Preferidos", ...Array.from(new Set(suppliers.map((s) => s.category)))],
    [suppliers],
  );
  const filtered = suppliers
    .filter((s) => {
      if (cat === "Preferidos" && !s.preferred) return false;
      if (cat !== "Todos" && cat !== "Preferidos" && s.category !== cat) return false;
      const q = search.trim().toLowerCase();
      if (
        q &&
        ![s.name, s.email, s.phone, s.location, s.notes]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      )
        return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (a.preferred && !b.preferred) return -1;
      if (!a.preferred && b.preferred) return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div>
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
            placeholder="Procurar fornecedor…"
            className="bo-input pl-10 pr-3 py-2.5 text-sm text-foreground/70 placeholder-foreground/22"
          />
        </div>
        {suppliers.length > 0 && (
          <button
            onClick={exportCsv}
            className="px-3 py-2.5 bg-white border border-foreground/[0.09] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm shrink-0"
            title="Exportar fornecedores para CSV"
          >
            Exportar
          </button>
        )}
        <button
          onClick={() => setAdding(!adding)}
          className="px-4 py-2.5 rounded-xl bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors shadow-sm shrink-0"
        >
          {adding ? "Cancelar" : "+ Fornecedor"}
        </button>
      </div>

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
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Telefone"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="E-mail"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Localização"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notas"
            className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
          />
          <button
            onClick={add}
            disabled={!form.name.trim()}
            className="sm:col-span-2 py-2.5 rounded-xl bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors disabled:opacity-40"
          >
            Guardar Fornecedor
          </button>
        </div>
      )}

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 mb-5">
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path
                d="M3 9l1-5h16l1 5M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z"
                strokeLinejoin="round"
              />
              <path d="M9 13h6" strokeLinecap="round" />
            </svg>
          }
          title={suppliers.length === 0 ? "Sem fornecedores ainda" : "Nenhum fornecedor encontrado"}
          hint={
            suppliers.length === 0
              ? "Guarde aqui os contactos de catering, floristas, fotógrafos e outros parceiros de confiança."
              : "Tente outra pesquisa ou categoria."
          }
          action={
            suppliers.length === 0
              ? { label: "+ Adicionar fornecedor", onClick: () => setAdding(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="group bo-card p-4">
              {editingId === s.id ? (
                /* ── Edit mode ── */
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-foreground/30">
                      Editar fornecedor
                    </p>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-foreground/30 hover:text-foreground/60 text-sm"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Nome *"
                    className="bo-input px-3 py-2 text-sm text-foreground/70"
                  />
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="bo-input px-3 py-2 text-sm text-foreground/60"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="Telefone"
                    className="bo-input px-3 py-2 text-sm text-foreground/70"
                  />
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="E-mail"
                    className="bo-input px-3 py-2 text-sm text-foreground/70"
                  />
                  <input
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    placeholder="Localização"
                    className="bo-input px-3 py-2 text-sm text-foreground/70"
                  />
                  <input
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Notas"
                    className="bo-input px-3 py-2 text-sm text-foreground/70"
                  />
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => saveEdit(s.id)}
                      disabled={!editForm.name.trim()}
                      className="flex-1 py-2 bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase rounded-xl hover:bg-[#2a3227] transition-colors disabled:opacity-40"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 text-foreground/40 text-[10px] uppercase tracking-[0.1em] hover:text-foreground/60 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-foreground/78 text-sm font-semibold truncate">
                          {s.name}
                        </p>
                        {s.preferred && (
                          <span className="shrink-0 text-amber-500" title="Fornecedor preferido">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              stroke="none"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="text-[#4d6350]/70 text-[10px] tracking-[0.15em] uppercase mt-0.5">
                        {s.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => patchSupplier(s.id, { preferred: !s.preferred })}
                        className={`transition-colors ${s.preferred ? "text-amber-500 hover:text-amber-400" : "text-foreground/15 hover:text-amber-400 opacity-0 group-hover:opacity-100"}`}
                        title={s.preferred ? "Remover dos preferidos" : "Marcar como preferido"}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill={s.preferred ? "currentColor" : "none"}
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path
                            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => startEdit(s)}
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
                        onClick={() => remove(s.id)}
                        className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                        aria-label="Remover"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {/* Star rating */}
                  <div className="flex items-center gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() =>
                          patchSupplier(s.id, { rating: s.rating === star ? 0 : star })
                        }
                        className="transition-colors focus:outline-none"
                        aria-label={`${star} estrela${star !== 1 ? "s" : ""}`}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill={star <= (s.rating ?? 0) ? "#b5894a" : "none"}
                          stroke={star <= (s.rating ?? 0) ? "#b5894a" : "#d0c9be"}
                          strokeWidth="1.6"
                        >
                          <path
                            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ))}
                    <span className="text-foreground/25 text-[10px] ml-1">
                      {s.rating ? `${s.rating}/5` : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    {s.phone && (
                      <a
                        href={`tel:${s.phone}`}
                        className="text-foreground/45 hover:text-[#4d6350] transition-colors"
                      >
                        {s.phone}
                      </a>
                    )}
                    {s.email && (
                      <a
                        href={`mailto:${s.email}`}
                        className="text-foreground/45 hover:text-[#4d6350] transition-colors truncate"
                      >
                        {s.email}
                      </a>
                    )}
                    {s.location && <span className="text-foreground/30">{s.location}</span>}
                    {s.notes && (
                      <span className="text-foreground/35 leading-relaxed mt-1">{s.notes}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
