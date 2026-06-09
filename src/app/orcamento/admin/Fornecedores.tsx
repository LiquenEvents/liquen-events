"use client";

import { useEffect, useMemo, useState } from "react";
import type { Supplier } from "../types";
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

export default function Fornecedores() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Todos");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Catering",
    phone: "",
    email: "",
    location: "",
    notes: "",
  });

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
    () => ["Todos", ...Array.from(new Set(suppliers.map((s) => s.category)))],
    [suppliers],
  );
  const filtered = suppliers.filter((s) => {
    if (cat !== "Todos" && s.category !== cat) return false;
    const q = search.trim().toLowerCase();
    if (
      q &&
      ![s.name, s.email, s.phone, s.location, s.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    )
      return false;
    return true;
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
            <div key={s.id} className="group bo-card bo-card-interactive p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-foreground/78 text-sm font-semibold truncate">{s.name}</p>
                  <p className="text-[#4d6350]/70 text-[10px] tracking-[0.15em] uppercase mt-0.5">
                    {s.category}
                  </p>
                </div>
                <button
                  onClick={() => remove(s.id)}
                  className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all shrink-0"
                  aria-label="Remover"
                >
                  ×
                </button>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
