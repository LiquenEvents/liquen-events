"use client";

import { useState } from "react";
import type { MaterialItem } from "@/lib/material-types";
import type { MaterialList } from "@/lib/material-list-types";
import type { MaterialRule, MatchKind } from "@/lib/material-rules";
import { useToast } from "./Toast";
import { Button, EmptyState, Field } from "./ui";
import { useCachedList } from "./useCachedList";

/**
 * AS REGRAS — o que a proposta implica em material.
 *
 * Escritas em linguagem corrente: "Quando a proposta disser *arco floral* →
 * acrescenta a lista *Estrutura e fixação*". Uma condição por regra, sem E/OU:
 * duas condições fazem-se com duas regras, e a checklist mostra qual disparou.
 */

const TIPO_LABEL: Record<MatchKind, string> = {
  sempre: "Em todos os eventos",
  servico: "Quando a proposta tiver o serviço…",
  texto: "Quando a proposta disser…",
  pax: "A partir de N convidados",
};

interface Listas {
  listas: MaterialList[];
}

export default function MaterialRegras() {
  const { toast } = useToast();
  const { data: regras = [], setData: setRegras } = useCachedList<MaterialRule[]>(
    "material-regras",
    "/api/material/regras",
  );
  const { data: dados } = useCachedList<Listas>("material-listas", "/api/material/listas");
  const { data: catalogo = [] } = useCachedList<MaterialItem[]>("material", "/api/material");
  const listas = dados?.listas ?? [];

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<MatchKind>("servico");
  const [valor, setValor] = useState("");
  const [acao, setAcao] = useState<"add_list" | "add_item">("add_list");
  const [listaId, setListaId] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [ocupado, setOcupado] = useState(false);

  async function recarregar() {
    setRegras(await fetch("/api/material/regras").then((r) => r.json()));
  }

  async function criar() {
    setOcupado(true);
    try {
      const res = await fetch("/api/material/regras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome.trim(),
          matchKind: tipo,
          matchValue: valor.trim(),
          action: acao,
          listId: acao === "add_list" ? listaId : undefined,
          itemId: acao === "add_item" ? itemId : undefined,
          qty: acao === "add_item" ? Number(qty) || 1 : undefined,
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r?.error ?? "");
      setNome("");
      setValor("");
      await recarregar();
      toast("Regra criada.", "success");
    } catch (e) {
      toast(
        e instanceof Error && e.message ? e.message : "Não foi possível criar a regra.",
        "error",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function alternar(regra: MaterialRule) {
    // Desligar em vez de apagar: deixa experimentar sem perder o que se
    // escreveu, que é o gesto mais útil quando se está a afinar regras.
    try {
      const res = await fetch(`/api/material/regras/${regra.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !regra.enabled }),
      });
      if (!res.ok) throw new Error();
      await recarregar();
    } catch {
      toast("Não foi possível guardar.", "error");
    }
  }

  async function apagar(regra: MaterialRule) {
    try {
      const res = await fetch(`/api/material/regras/${regra.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await recarregar();
      toast("Regra apagada.", "success");
    } catch {
      toast("Não foi possível apagar.", "error");
    }
  }

  const alvo = (r: MaterialRule) =>
    r.action === "add_list"
      ? (listas.find((l) => l.id === r.listId)?.name ?? "(lista apagada)")
      : (catalogo.find((i) => i.id === r.itemId)?.name ?? "(item apagado)");

  return (
    <div>
      <div className="rounded-xl border border-foreground/12 p-4">
        <p className="mb-3 text-sm font-medium">Regra nova</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome (para si)">
            <input
              className="bo-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Arco floral leva estrutura"
            />
          </Field>
          <Field label="Quando">
            <select
              className="bo-input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as MatchKind)}
            >
              {(Object.keys(TIPO_LABEL) as MatchKind[]).map((k) => (
                <option key={k} value={k}>
                  {TIPO_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          {tipo !== "sempre" && (
            <Field label={tipo === "pax" ? "Número de convidados" : "Palavras a procurar"}>
              <input
                className="bo-input"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode={tipo === "pax" ? "numeric" : "text"}
                placeholder={tipo === "pax" ? "100" : "arco floral"}
              />
            </Field>
          )}
          <Field label="Então acrescenta">
            <select
              className="bo-input"
              value={acao}
              onChange={(e) => setAcao(e.target.value as "add_list" | "add_item")}
            >
              <option value="add_list">Uma lista inteira</option>
              <option value="add_item">Um item</option>
            </select>
          </Field>
          {acao === "add_list" ? (
            <Field label="Lista">
              <select
                className="bo-input"
                value={listaId}
                onChange={(e) => setListaId(e.target.value)}
              >
                <option value="">Escolher…</option>
                {listas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Item">
                <select
                  className="bo-input"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                >
                  <option value="">Escolher…</option>
                  {catalogo.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantos">
                <input
                  className="bo-input"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        <div className="mt-3">
          <Button size="sm" onClick={criar} disabled={ocupado || !nome.trim()}>
            Criar regra
          </Button>
        </div>
      </div>

      {regras.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Sem regras"
            description="As regras acrescentam material a partir do que a proposta diz. Sem elas, a checklist leva só os essenciais de carrinha."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-foreground/[0.08]">
          {regras.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className={r.enabled ? "font-medium" : "font-medium opacity-45"}>{r.name}</span>
              <span className="bo-text-muted text-xs">
                {TIPO_LABEL[r.matchKind]}
                {r.matchValue ? ` “${r.matchValue}”` : ""} → {alvo(r)}
              </span>
              {!r.enabled && (
                <span className="rounded bg-foreground/[0.08] px-1.5 text-[10px] tracking-wide uppercase">
                  desligada
                </span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => alternar(r)}>
                  {r.enabled ? "Desligar" : "Ligar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => apagar(r)}>
                  Apagar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
