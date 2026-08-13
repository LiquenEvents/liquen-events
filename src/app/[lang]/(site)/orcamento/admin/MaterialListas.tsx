"use client";

import { useMemo, useState } from "react";
import type { MaterialItem } from "@/lib/material-types";
import type { MaterialList, MaterialListItem } from "@/lib/material-list-types";
import { quantidadePara, porCadaQuantos } from "@/lib/material-list-types";
import { useToast } from "./Toast";
import { Button, EmptyState, Field } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";

/**
 * LISTAS BASE — as receitas do que costuma ir em cada montagem.
 *
 * Uma lista base não é uma checklist: é o molde de onde a checklist de um
 * evento é COPIADA. Mudar aqui nunca mexe num evento já preparado, e é isso
 * que torna seguro andar a afiná-las ao longo do ano.
 *
 * "Essenciais de carrinha" é a que vai sempre. As outras entram por regra ou à
 * mão, quando o bloco 3 existir.
 */

interface Resposta {
  listas: MaterialList[];
  linhas: MaterialListItem[];
}

/** Quantos convidados usar na pré-visualização das quantidades que escalam. */
const PAX_EXEMPLO = 120;

/** Gravou-se, mas o ecrã ficou a mostrar a versão anterior. Calar isto é o que
 *  faz alguém repetir a alteração — ou dar uma lista por vazia. */
const AVISO_RELEITURA = "Gravado, mas não foi possível reler as listas. Atualiza a página.";

export default function MaterialListas() {
  const { toast } = useToast();
  const { data, setData, loading, error, errorMessage, refresh } = useCachedList<Resposta>(
    "material-listas",
    "/api/material/listas",
  );
  const { data: catalogo = [] } = useCachedList<MaterialItem[]>("material", "/api/material");

  const listas = data?.listas ?? [];
  const linhas = data?.linhas ?? [];

  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [ocupado, setOcupado] = useState(false);
  /** O item escolhido no seletor de "acrescentar linha", por lista. */
  const [aAcrescentar, setAAcrescentar] = useState<string>("");

  const porId = useMemo(() => new Map(catalogo.map((i) => [i.id, i])), [catalogo]);
  const linhasDe = (listId: string) =>
    linhas.filter((l) => l.listId === listId).sort((a, b) => a.position - b.position);

  const temEssenciais = listas.some((l) => l.isDefault);

  /**
   * Relê listas e linhas. `false` quando a leitura falhou — e aí não escreve
   * nada.
   *
   * Isto era um `.then((x) => x.json())` sem `res.ok`. O corpo de um 401 ou de
   * um 503 é `{ error: "…" }`, e esse objecto entrava no estado no lugar da
   * resposta: como aqui se lê `data?.listas ?? []`, nada rebentava — as listas
   * ficavam VAZIAS, caladas. Logo a seguir a criar uma lista, o ecrã dizia
   * "Ainda não há listas" e voltava a oferecer semear os essenciais; e como a
   * cache do `useCachedList` é a MESMA que o separador das Regras lê, cada
   * regra passava a apontar para "(lista apagada)".
   *
   * Um erro de leitura não pode ser indistinguível de uma tabela vazia, ainda
   * por cima quando o passo seguinte que ele sugere é recriar o que já existe.
   */
  async function recarregar(): Promise<boolean> {
    try {
      const res = await fetch("/api/material/listas");
      if (!res.ok) return false;
      const r = await res.json();
      if (!Array.isArray(r?.listas) || !Array.isArray(r?.linhas)) return false;
      setData(r);
      return true;
    } catch {
      return false;
    }
  }

  async function semear() {
    setOcupado(true);
    try {
      const res = await fetch("/api/material/listas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semear: true }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r?.error);
      toast(
        r.criados > 0
          ? `Lista criada, com ${r.criados} itens novos no catálogo.`
          : "Lista criada a partir do catálogo que já tinha.",
        "success",
      );
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível criar os essenciais.", "error");
    } finally {
      setOcupado(false);
    }
  }

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setOcupado(true);
    try {
      const res = await fetch("/api/material/listas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome }),
      });
      if (!res.ok) throw new Error();
      setNovoNome("");
      toast("Lista criada.", "success");
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível criar a lista.", "error");
    } finally {
      setOcupado(false);
    }
  }

  async function duplicar(lista: MaterialList) {
    setOcupado(true);
    try {
      const res = await fetch("/api/material/listas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicarDe: lista.id, name: `${lista.name} (cópia)` }),
      });
      if (!res.ok) throw new Error();
      toast("Lista duplicada.", "success");
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível duplicar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar(lista: MaterialList) {
    setOcupado(true);
    try {
      const res = await fetch(`/api/material/listas/${lista.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Lista apagada.", "success");
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível apagar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  async function acrescentarLinha(listId: string) {
    if (!aAcrescentar) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/material/listas/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linha: { itemId: aAcrescentar, qty: 1 } }),
      });
      if (!res.ok) throw new Error();
      setAAcrescentar("");
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível acrescentar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  async function alterarLinha(listId: string, linhaId: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/material/listas/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhaId, patch }),
      });
      if (!res.ok) throw new Error();
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível guardar.", "error");
    }
  }

  async function removerLinha(listId: string, linhaId: string) {
    try {
      const res = await fetch(`/api/material/listas/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remover: linhaId }),
      });
      if (!res.ok) throw new Error();
      if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    } catch {
      toast("Não foi possível remover.", "error");
    }
  }

  // A falha primeiro: sem isto, uma leitura que rebentou passava por "ainda
  // não há listas" e o botão de semear ia falhar outra vez, sem explicação.
  if (error && listas.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as listas"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  if (loading && listas.length === 0) {
    return <p className="bo-text-muted text-sm">A carregar…</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        {/* O `Field` desenha o próprio controlo — dar-lhe um `<input>` por
            dentro rebentava o ecrã ao montar. Ver `ui/Field`. */}
        <Field
          label="Lista nova"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void criar();
          }}
          placeholder="Ex.: Montagem de cerimónia ao ar livre"
        />
        <Button size="sm" onClick={criar} disabled={ocupado || !novoNome.trim()}>
          Criar
        </Button>
        {!temEssenciais && (
          <Button size="sm" variant="ghost" onClick={semear} disabled={ocupado}>
            Criar “Essenciais de carrinha”
          </Button>
        )}
      </div>

      {listas.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Ainda não há listas"
            description="Começa pelos “Essenciais de carrinha” — o que vai em todos os eventos. Depois cria listas por tipo de montagem."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {listas.map((lista) => {
            const minhas = linhasDe(lista.id);
            const aberta = abertaId === lista.id;
            const criticas = minhas.filter((l) => l.critical).length;
            return (
              <li key={lista.id} className="rounded-xl border border-foreground/12">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
                  <button
                    type="button"
                    className="text-left font-medium"
                    onClick={() => setAbertaId(aberta ? null : lista.id)}
                    aria-expanded={aberta}
                  >
                    {lista.name}
                  </button>
                  {lista.isDefault && (
                    <span className="rounded-md bg-[#e7efe4] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[#3a5c39] uppercase">
                      Vai sempre
                    </span>
                  )}
                  <span className="bo-text-muted text-xs">
                    {minhas.length} {minhas.length === 1 ? "item" : "itens"}
                    {criticas > 0 && ` · ${criticas} crítico${criticas === 1 ? "" : "s"}`}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicar(lista)}
                      disabled={ocupado}
                    >
                      Duplicar
                    </Button>
                    {/* A que vai sempre não se apaga por engano: sem ela, todos
                        os eventos passavam a nascer sem essenciais. */}
                    {!lista.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => apagar(lista)}
                        disabled={ocupado}
                      >
                        Apagar
                      </Button>
                    )}
                  </span>
                </div>

                {aberta && (
                  <div className="border-t border-foreground/[0.08] p-4">
                    {minhas.length === 0 ? (
                      <p className="bo-text-muted text-sm">Lista vazia.</p>
                    ) : (
                      <ul className="divide-y divide-foreground/[0.06]">
                        {minhas.map((l) => {
                          const item = porId.get(l.itemId);
                          const porCada = porCadaQuantos(l.qtyPerPax);
                          return (
                            <li
                              key={l.id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
                            >
                              <span className={item ? "" : "text-[#a03a1a]"}>
                                {item?.name ?? "(item removido do catálogo)"}
                              </span>
                              {l.critical && (
                                <span className="rounded bg-[#f6e6df] px-1.5 text-[10px] font-medium tracking-wide text-[#a03a1a] uppercase">
                                  crítico
                                </span>
                              )}
                              <input
                                className="bo-input w-16"
                                inputMode="decimal"
                                defaultValue={String(l.qty)}
                                aria-label={`Quantidade de ${item?.name ?? "item"}`}
                                onBlur={(e) => {
                                  const escrito = e.target.value.trim();
                                  const v = Number(escrito.replace(",", "."));
                                  /**
                                   * Uma caixa APAGADA não é a quantidade zero.
                                   *
                                   * `Number("")` é 0, e sem esta guarda
                                   * seleccionar o número, apagá-lo e carregar
                                   * noutro sítio gravava zero na lista base. O
                                   * pior valor possível: a linha continua lá,
                                   * com o nome e o rótulo de crítico, e toda a
                                   * checklist gerada a partir dela passa a
                                   * pedir zero unidades. Quem carrega a
                                   * carrinha lê "Escadote 0" e passa à frente.
                                   *
                                   * Texto que não é número tinha o outro lado
                                   * do mesmo defeito: não gravava (bem), mas
                                   * ficava na caixa (mal) — e a caixa é
                                   * não-controlada (`defaultValue`), por isso
                                   * ninguém a repunha. O ecrã ficava a dizer
                                   * uma coisa e a base de dados outra.
                                   */
                                  if (!escrito || !Number.isFinite(v) || v < 0) {
                                    e.target.value = String(l.qty);
                                    return;
                                  }
                                  if (v !== l.qty) {
                                    void alterarLinha(lista.id, l.id, { qty: v });
                                  }
                                }}
                              />
                              <span className="bo-text-muted text-xs">{item?.unit ?? ""}</span>
                              {porCada ? (
                                <span className="bo-text-muted text-xs">
                                  1 por cada {porCada} pax → {quantidadePara(l, PAX_EXEMPLO)} com{" "}
                                  {PAX_EXEMPLO}
                                </span>
                              ) : null}
                              <label className="flex items-center gap-1.5 text-xs">
                                <input
                                  type="checkbox"
                                  checked={l.critical}
                                  onChange={(e) =>
                                    void alterarLinha(lista.id, l.id, {
                                      critical: e.target.checked,
                                    })
                                  }
                                />
                                crítico
                              </label>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removerLinha(lista.id, l.id)}
                              >
                                Remover
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Field
                        as="select"
                        label="Acrescentar do catálogo"
                        value={aAcrescentar}
                        onChange={(e) => setAAcrescentar(e.target.value)}
                      >
                        <option value="">Escolher…</option>
                        {catalogo.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </Field>
                      <Button
                        size="sm"
                        onClick={() => acrescentarLinha(lista.id)}
                        disabled={ocupado || !aAcrescentar}
                      >
                        Acrescentar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
