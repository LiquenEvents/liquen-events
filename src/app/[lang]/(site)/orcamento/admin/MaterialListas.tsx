"use client";

import { useMemo, useState } from "react";
import type { MaterialItem } from "@/lib/material-types";
import type { MaterialList, MaterialListItem } from "@/lib/material-list-types";
import { quantidadePara, porCadaQuantos } from "@/lib/material-list-types";
import { useToast } from "./Toast";
import { Button, EmptyState, Field } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

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
    const { ok, corpo } = await gravar(
      "criar os «Essenciais de carrinha»",
      "/api/material/listas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semear: true }),
      },
    );
    setOcupado(false);
    if (!ok) return;
    const criados = Number((corpo as { criados?: unknown } | null)?.criados) || 0;
    toast(
      criados > 0
        ? `Lista criada, com ${criados} itens novos no catálogo.`
        : "Lista criada a partir do catálogo que já tinha.",
      "success",
    );
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * Este ficheiro tinha SETE cópias do mesmo `try { fetch } catch { toast("Não
   * foi possível …") }`, e as sete diziam a mesma coisa a seis situações
   * diferentes — a rede em baixo, a sessão expirada, a lista apagada por
   * outra pessoa, o nome repetido, o servidor em baixo. Quem lia carregava
   * outra vez, e em metade dos casos isso não podia funcionar.
   *
   * Agora há um sítio só, e a frase vem do `porque-falhou`, que nomeia a coisa
   * e acaba sempre numa instrução.
   *
   * Devolve o corpo porque há chamadas que precisam dele («Lista criada, com 4
   * itens novos no catálogo») — e devolve `ok` em vez de atirar, porque quem
   * chama tem de poder REPOR o ecrã quando falhou. É essa a segunda metade da
   * correcção: ver `alterarLinha`.
   */
  async function gravar(
    oQue: string,
    url: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; corpo: unknown }> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return { ok: false, corpo: null };
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return { ok: false, corpo };
    }
    return { ok: true, corpo };
  }

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setOcupado(true);
    const { ok } = await gravar(`criar a lista «${nome}»`, "/api/material/listas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome }),
    });
    setOcupado(false);
    if (!ok) return;
    setNovoNome("");
    toast("Lista criada.", "success");
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  async function duplicar(lista: MaterialList) {
    setOcupado(true);
    const { ok } = await gravar(`duplicar a lista «${lista.name}»`, "/api/material/listas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicarDe: lista.id, name: `${lista.name} (cópia)` }),
    });
    setOcupado(false);
    if (!ok) return;
    toast("Lista duplicada.", "success");
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  async function apagar(lista: MaterialList) {
    setOcupado(true);
    const { ok } = await gravar(
      `apagar a lista «${lista.name}»`,
      `/api/material/listas/${lista.id}`,
      { method: "DELETE" },
    );
    setOcupado(false);
    if (!ok) return;
    toast("Lista apagada.", "success");
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  async function acrescentarLinha(listId: string) {
    if (!aAcrescentar) return;
    const nome = porId.get(aAcrescentar)?.name ?? "o item";
    setOcupado(true);
    const { ok } = await gravar(`acrescentar «${nome}»`, `/api/material/listas/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linha: { itemId: aAcrescentar, qty: 1 } }),
    });
    setOcupado(false);
    if (!ok) return;
    setAAcrescentar("");
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
  }

  /**
   * DEVOLVE SE PASSOU, e é isso que corrige o defeito.
   *
   * A caixa da quantidade é não-controlada (`defaultValue`), e ninguém a
   * repunha quando a gravação era recusada: o ecrã ficava a dizer 12 e a base
   * de dados 8, sem nada a assinalar a diferença. E o pior é o que vem a
   * seguir — a checklist do evento é COPIADA da lista base, e quem carrega a
   * carrinha lê o número errado sem ter como o pôr em causa.
   */
  async function alterarLinha(
    oQue: string,
    listId: string,
    linhaId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const { ok } = await gravar(oQue, `/api/material/listas/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linhaId, patch }),
    });
    if (!ok) return false;
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
    return true;
  }

  async function removerLinha(oQue: string, listId: string, linhaId: string) {
    const { ok } = await gravar(oQue, `/api/material/listas/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remover: linhaId }),
    });
    if (!ok) return;
    if (!(await recarregar())) toast(AVISO_RELEITURA, "error");
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
                    // MEDIDO a 375px: 168×26px — é o botão que abre CADA lista,
                    // e ficava abaixo dos 44px mínimos. `alvo-toque` (globals.css)
                    // dá-lhe 44px de altura só no dedo; `!justify-start` porque é
                    // texto alinhado à esquerda, não um ícone a centrar.
                    className="alvo-toque !justify-start text-left font-medium"
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
                                  if (v === l.qty) return;
                                  /**
                                   * ── E A GRAVAÇÃO RECUSADA TINHA O MESMO
                                   *    DEFEITO, PELO OUTRO LADO ────────────
                                   *
                                   * A guarda acima repunha a caixa quando o
                                   * TEXTO era inválido. Não repunha nada
                                   * quando o texto era válido e o SERVIDOR
                                   * recusava: a caixa ficava com 12, a base de
                                   * dados com 8, e o único sinal era um toast
                                   * a dizer «Não foi possível guardar.» — que
                                   * desaparece sozinho.
                                   *
                                   * E o número errado não fica só aqui: a
                                   * checklist de cada evento é COPIADA desta
                                   * lista, e quem carrega a carrinha lê o
                                   * número sem ter como o pôr em causa.
                                   */
                                  const caixa = e.target;
                                  void alterarLinha(
                                    `guardar a quantidade de «${item?.name ?? "item"}»`,
                                    lista.id,
                                    l.id,
                                    { qty: v },
                                  ).then((passou) => {
                                    if (!passou) caixa.value = String(l.qty);
                                  });
                                }}
                              />
                              <span className="bo-text-muted text-xs">{item?.unit ?? ""}</span>
                              {porCada ? (
                                <span className="bo-text-muted text-xs">
                                  1 por cada {porCada} pax → {quantidadePara(l, PAX_EXEMPLO)} com{" "}
                                  {PAX_EXEMPLO}
                                </span>
                              ) : null}
                              {/* MEDIDO a 375px: o rótulo à volta da caixa
                                  ("crítico") tem só 53×16px — abaixo dos
                                  44px mínimos, e é o único caminho para marcar
                                  ou desmarcar uma linha como crítica numa
                                  lista base. `alvo-toque` cresce o RÓTULO (não
                                  o quadrado, que fica com o desenho de
                                  sempre) só no dedo. */}
                              <label className="alvo-toque !justify-start flex items-center gap-1.5 text-xs">
                                <input
                                  type="checkbox"
                                  checked={l.critical}
                                  onChange={(e) =>
                                    void alterarLinha(
                                      `${e.target.checked ? "marcar" : "desmarcar"} «${
                                        item?.name ?? "item"
                                      }» como crítico`,
                                      lista.id,
                                      l.id,
                                      { critical: e.target.checked },
                                    )
                                  }
                                />
                                crítico
                              </label>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  removerLinha(
                                    `remover «${item?.name ?? "item"}» da lista`,
                                    lista.id,
                                    l.id,
                                  )
                                }
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
