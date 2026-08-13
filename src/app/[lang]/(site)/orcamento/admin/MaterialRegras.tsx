"use client";

import { useState } from "react";
import type { MaterialItem } from "@/lib/material-types";
import type { MaterialList } from "@/lib/material-list-types";
import type { MaterialRule, MatchKind } from "@/lib/material-rules";
import { useToast } from "./Toast";
import { Button, EmptyState, Field } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";

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

/** Gravou-se, mas o ecrã ficou a mostrar a versão anterior. Dizer as duas
 *  coisas: o silêncio aqui é o que faz alguém repetir a alteração. */
const AVISO_RELEITURA = "Gravado, mas não foi possível reler as regras. Atualiza a página.";

export default function MaterialRegras() {
  const { toast } = useToast();
  const {
    data: regras = [],
    setData: setRegras,
    error,
    errorMessage,
    refresh,
  } = useCachedList<MaterialRule[]>("material-regras", "/api/material/regras");
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

  /**
   * Relê as regras. `false` quando a leitura falhou — e aí não escreve nada.
   *
   * Isto era um `.then((r) => r.json())` sem `res.ok`. O corpo de um 401 (a
   * sessão caduca sozinha, e basta caducar entre gravar e reler) é
   * `{ error: "…" }` — um objecto, que entrava no estado no lugar do array. A
   * linha `regras.map(...)` mais abaixo atirava, e como este ecrã é desenhado
   * dentro do back office a excepção levava o back office todo.
   *
   * O `setRegras` escreve através para a cache do `useCachedList`, portanto o
   * objecto de erro nem sequer desaparecia ao mudar de separador.
   */
  async function recarregar(): Promise<boolean> {
    try {
      const res = await fetch("/api/material/regras");
      if (!res.ok) return false;
      const lista = await res.json();
      if (!Array.isArray(lista)) return false;
      setRegras(lista);
      return true;
    } catch {
      return false;
    }
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
      toast("Regra criada.", "success");
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
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
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível guardar.", "error");
    }
  }

  async function apagar(regra: MaterialRule) {
    try {
      const res = await fetch(`/api/material/regras/${regra.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Regra apagada.", "success");
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível apagar.", "error");
    }
  }

  const alvo = (r: MaterialRule) =>
    r.action === "add_list"
      ? (listas.find((l) => l.id === r.listId)?.name ?? "(lista apagada)")
      : (catalogo.find((i) => i.id === r.itemId)?.name ?? "(item apagado)");

  // A falha primeiro, e SEM o formulário: criar uma regra contra uma tabela
  // que não existe só produzia um segundo erro, este sem explicação nenhuma.
  if (error && regras.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as regras"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  return (
    <div>
      <div className="rounded-xl border border-foreground/12 p-4">
        <p className="mb-3 text-sm font-medium">Regra nova</p>
        {/* O `Field` desenha o controlo a partir das propriedades. Um `<input>`
            ou `<select>` passado por DENTRO ia parar aos filhos de um elemento
            vazio e o React abortava o ecrã todo. Ver `ui/Field`. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Nome (para ti)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Arco floral leva estrutura"
          />
          <Field
            as="select"
            label="Quando"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as MatchKind)}
          >
            {(Object.keys(TIPO_LABEL) as MatchKind[]).map((k) => (
              <option key={k} value={k}>
                {TIPO_LABEL[k]}
              </option>
            ))}
          </Field>
          {tipo !== "sempre" && (
            <Field
              label={tipo === "pax" ? "Número de convidados" : "Palavras a procurar"}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode={tipo === "pax" ? "numeric" : "text"}
              placeholder={tipo === "pax" ? "100" : "arco floral"}
            />
          )}
          <Field
            as="select"
            label="Então acrescenta"
            value={acao}
            onChange={(e) => setAcao(e.target.value as "add_list" | "add_item")}
          >
            <option value="add_list">Uma lista inteira</option>
            <option value="add_item">Um item</option>
          </Field>
          {acao === "add_list" ? (
            <Field
              as="select"
              label="Lista"
              value={listaId}
              onChange={(e) => setListaId(e.target.value)}
            >
              <option value="">Escolher…</option>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Field>
          ) : (
            <>
              <Field
                as="select"
                label="Item"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">Escolher…</option>
                {catalogo.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Field>
              <Field
                label="Quantos"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
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
