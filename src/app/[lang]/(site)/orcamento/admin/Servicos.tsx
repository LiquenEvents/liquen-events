"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServicoDaBiblioteca } from "./BibliotecaServicos";
import { Button, Card, EmptyState } from "./ui";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BIBLIOTECA DE SERVIÇOS — onde a redacção se corrige
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O seletor do estúdio serve para USAR a biblioteca. Este ecrã serve para a
 * manter: corrigir uma descrição, escrever a versão inglesa que ficou por
 * fazer, arrumar em categorias, arquivar o que já não se vende.
 *
 * ── O INGLÊS EM FALTA É A PRIMEIRA COISA QUE SE VÊ ─────────────────────────
 * Um contador no topo e uma etiqueta em cada linha. Não é arrumação: é que uma
 * proposta para um casal estrangeiro com metade dos serviços em português
 * lê-se como descuido, e o momento de o evitar é este — com tempo, não com o
 * casal à espera.
 *
 * ── ARQUIVAR, NÃO APAGAR ───────────────────────────────────────────────────
 * Um serviço arquivado sai do seletor e continua nas propostas antigas, que é
 * onde as palavras dele ainda fazem sentido. Apagar é para o que nunca devia
 * ter entrado, e por isso pede confirmação.
 */

export default function Servicos() {
  const { toast } = useToast();
  const [servicos, setServicos] = useState<ServicoDaBiblioteca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [aCriar, setACriar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/servicos-catalogo");
      const j = await res.json();
      if (!res.ok) setErro(j?.error ?? "Não foi possível ler a biblioteca.");
      else {
        setServicos(j as ServicoDaBiblioteca[]);
        setErro(null);
      }
    } catch {
      setErro("Não foi possível falar com o servidor.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => (servicos ?? []).filter((s) => (mostrarArquivados ? s.arquivado : !s.arquivado)),
    [servicos, mostrarArquivados],
  );

  const semIngles = useMemo(
    () => (servicos ?? []).filter((s) => !s.arquivado && !s.nomeEn).length,
    [servicos],
  );

  const gravar = useCallback(
    async (id: string, patch: Partial<ServicoDaBiblioteca>, comoDizer: string) => {
      const antes = servicos ?? [];
      setServicos(antes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      try {
        const res = await fetch(`/api/servicos-catalogo/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("falhou");
        const actualizado = (await res.json()) as ServicoDaBiblioteca;
        setServicos(antes.map((s) => (s.id === id ? actualizado : s)));
        toast(comoDizer, "success");
      } catch {
        setServicos(antes);
        toast("Não foi possível gravar. Verifique a ligação.", "error");
      }
    },
    [servicos, toast],
  );

  if (erro && servicos === null) {
    return (
      <Card padding="md">
        <p className="text-xs leading-relaxed text-[#b5654a]">{erro}</p>
      </Card>
    );
  }
  if (servicos === null) return <SkeletonList rows={4} />;

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-foreground/70">
              {servicos.filter((s) => !s.arquivado).length} serviços na biblioteca
            </p>
            {semIngles > 0 && (
              <p className="mt-1 text-[11px] text-[#8a6420]">
                {semIngles === 1 ? "1 sem versão inglesa" : `${semIngles} sem versão inglesa`} — uma
                proposta para um casal estrangeiro com metade dos serviços em português lê-se como
                descuido.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-foreground/55">
              <input
                type="checkbox"
                checked={mostrarArquivados}
                onChange={(e) => setMostrarArquivados(e.target.checked)}
                className="h-4 w-4 accent-[#4d6350]"
              />
              Ver arquivados
            </label>
            <Button size="sm" onClick={() => setACriar((v) => !v)}>
              Serviço novo
            </Button>
          </div>
        </div>

        {aCriar && (
          <Editor
            servico={null}
            onCancelar={() => setACriar(false)}
            onGravado={async () => {
              setACriar(false);
              await carregar();
            }}
          />
        )}
      </Card>

      {visiveis.length === 0 ? (
        <EmptyState
          title={mostrarArquivados ? "Nada arquivado" : "A biblioteca está vazia"}
          description={
            mostrarArquivados
              ? "Os serviços que arquivar aparecem aqui, e continuam nas propostas antigas."
              : "Escreva os serviços à mão nas propostas e guarde aqui os que valer a pena reutilizar — ou crie um de raiz."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map((s) => (
            <li key={s.id}>
              <Card padding="md">
                {aEditar === s.id ? (
                  <Editor
                    servico={s}
                    onCancelar={() => setAEditar(null)}
                    onGravado={async () => {
                      setAEditar(null);
                      await carregar();
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground/85">{s.nome}</p>
                      {s.descricao && (
                        <p className="mt-0.5 text-xs leading-relaxed text-foreground/55">
                          {s.descricao}
                        </p>
                      )}
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 tracking-[0.08em] uppercase text-foreground/45">
                          {s.categoria || "Outros"}
                        </span>
                        {s.nomeEn ? (
                          <span className="text-foreground/40">EN: {s.nomeEn}</span>
                        ) : (
                          <span className="rounded-full bg-[#c08a3e]/15 px-2 py-0.5 tracking-[0.08em] uppercase text-[#8a6420]">
                            sem versão inglesa
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => setAEditar(s.id)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          gravar(
                            s.id,
                            { arquivado: !s.arquivado },
                            s.arquivado
                              ? `"${s.nome}" volta ao seletor`
                              : `"${s.nome}" arquivado — continua nas propostas antigas`,
                          )
                        }
                      >
                        {s.arquivado ? "Desarquivar" : "Arquivar"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O formulário de escrever ou corrigir um serviço. */
function Editor({
  servico,
  onCancelar,
  onGravado,
}: {
  servico: ServicoDaBiblioteca | null;
  onCancelar: () => void;
  onGravado: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [descricao, setDescricao] = useState(servico?.descricao ?? "");
  const [nomeEn, setNomeEn] = useState(servico?.nomeEn ?? "");
  const [descricaoEn, setDescricaoEn] = useState(servico?.descricaoEn ?? "");
  const [categoria, setCategoria] = useState(servico?.categoria ?? "Outros");
  const [ocupado, setOcupado] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || ocupado) return;
    setOcupado(true);
    const corpo = { nome: nome.trim(), descricao, nomeEn, descricaoEn, categoria };
    try {
      const res = servico
        ? await fetch(`/api/servicos-catalogo/${servico.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          })
        : await fetch("/api/servicos-catalogo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "falhou");
      toast(servico ? "Serviço corrigido" : "Serviço guardado na biblioteca", "success");
      await onGravado();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível gravar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  const campo = "bo-input w-full px-2.5 py-2 text-xs";
  const rotulo = "text-[10px] tracking-[0.1em] uppercase text-foreground/50";

  return (
    <form onSubmit={submeter} className="mt-3 flex flex-col gap-3">
      {/* Os dois idiomas lado a lado, de propósito: é a maneira de se ver que
          um está por escrever enquanto se escreve o outro. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Nome (PT)</span>
          <input
            className={campo}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Decoração da cerimónia"
            maxLength={200}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Name (EN)</span>
          <input
            className={campo}
            value={nomeEn}
            onChange={(e) => setNomeEn(e.target.value)}
            placeholder="Ceremony styling"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Descrição (PT)</span>
          <textarea
            className={`${campo} resize-y`}
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="A descrição que vai na proposta, escrita com tempo."
            maxLength={2000}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Description (EN)</span>
          <textarea
            className={`${campo} resize-y`}
            rows={3}
            value={descricaoEn}
            onChange={(e) => setDescricaoEn(e.target.value)}
            maxLength={2000}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Categoria</span>
          <input
            className="bo-input w-40 px-2.5 py-2 text-xs"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Flores"
            maxLength={120}
          />
        </label>
        {/* `type="submit"` explícito: o `Button` do back office é
            `type="button"` por omissão, de propósito, para um botão largado
            dentro de um form nunca submeter por acidente. */}
        <Button type="submit" size="sm" disabled={ocupado || !nome.trim()}>
          {servico ? "Guardar correcção" : "Guardar na biblioteca"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
