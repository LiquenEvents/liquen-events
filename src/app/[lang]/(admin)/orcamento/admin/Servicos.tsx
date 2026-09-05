"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServicoDaBiblioteca } from "./BibliotecaServicos";
import { Button, Card, EmptyState } from "./ui";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ QUAL SERVIÇO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * As escritas deste ficheiro diziam «Não foi possível gravar. Verifica a
 * ligação.» e «Não foi possível gravar.» — a mesma frase para a rede em baixo,
 * a sessão expirada, o serviço apagado por outra pessoa e o servidor em baixo.
 * Só uma dessas quatro se resolve a verificar a ligação.
 *
 * O gancho está aqui, e não dentro de um dos componentes, porque os dois deste
 * ficheiro gravam — a lista (arquivar) e o formulário (criar/corrigir) — e não
 * podem voltar a ter duas versões da mesma frase. É o padrão de
 * `MaterialListas`.
 */
function useGravar() {
  const { toast } = useToast();
  return useCallback(
    async (
      oQue: string,
      url: string,
      init?: RequestInit,
    ): Promise<{ ok: boolean; corpo: unknown }> => {
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
    },
    [toast],
  );
}

export default function Servicos() {
  const { toast } = useToast();
  const gravar = useGravar();
  const [servicos, setServicos] = useState<ServicoDaBiblioteca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [aCriar, setACriar] = useState(false);

  const carregar = useCallback(async () => {
    // A leitura passa pela mesma escolha de palavras das gravações: um 401 aqui
    // dizia «Não foi possível ler a biblioteca.» e mandava-a olhar para um ecrã
    // vazio sem lhe dizer que a sessão tinha caído.
    try {
      const res = await fetch("/api/servicos-catalogo");
      const j = await res.json().catch(() => null);
      if (!res.ok) setErro(porqueFalhou("ler a biblioteca de serviços", res, j).mensagem);
      else {
        setServicos(j as ServicoDaBiblioteca[]);
        setErro(null);
      }
    } catch {
      setErro(porqueRebentou("ler a biblioteca de serviços").mensagem);
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

  /**
   * Arquivar e desarquivar, otimista — e a reposição é DESTE serviço.
   *
   * Guardava-se a lista inteira de antes do pedido e repunha-se essa. Arquivar
   * dois serviços seguidos punha dois PATCH no ar; o segundo, ao passar,
   * escrevia a lista velha de volta com o primeiro por arquivar, e o primeiro,
   * ao falhar, desfazia o segundo — em qualquer das ordens ficava um serviço a
   * aparecer no seletor do estúdio depois de ela o ter arquivado, sem nada a
   * assinalá-lo. Mexe-se só na linha em causa, e por função (`prev => …`), que
   * é o que impede uma gravação de escrever por cima da outra.
   */
  const alterarServico = useCallback(
    async (id: string, patch: Partial<ServicoDaBiblioteca>, oQue: string, comoDizer: string) => {
      const anterior = (servicos ?? []).find((s) => s.id === id);
      setServicos((prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)));
      const { ok, corpo } = await gravar(oQue, `/api/servicos-catalogo/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!ok) {
        if (anterior) {
          setServicos((prev) => (prev ?? []).map((s) => (s.id === id ? anterior : s)));
        }
        return;
      }
      const actualizado = corpo as ServicoDaBiblioteca | null;
      if (actualizado?.id) {
        setServicos((prev) => (prev ?? []).map((s) => (s.id === id ? actualizado : s)));
      }
      toast(comoDizer, "success");
    },
    [servicos, toast, gravar],
  );

  if (erro && servicos === null) {
    return (
      <Card padding="md">
        <p className="text-xs leading-relaxed text-[#8a2a22]">{erro}</p>
      </Card>
    );
  }
  if (servicos === null) return <SkeletonList rows={4} />;

  return (
    /* ── O ESQUELETO DÁ LUGAR À BIBLIOTECA, EM VEZ DE SALTAR PARA ELA ──────
       Enquanto `servicos` é `null` mostra-se o `SkeletonList` (aqui em cima);
       quando a lista chega, esta árvore monta de raiz e o esqueleto sai. Era
       uma troca de um fotograma para o outro.

       `.bo-cena` (600 ms, doze píxeis, `cubic-bezier(0, 0, 0.2, 1)`): a banda
       de APRESENTAÇÃO, porque quem se está a mostrar é o sistema. Uma vez só e
       no contentor — os serviços lá dentro não levam degrau próprio, que é a
       regra da casa para listas de dados.

       Não é preciso código nenhum a coordenar as duas metades: o `return` de
       cima devolve a espera, este devolve o conteúdo, e o que monta anima. O
       esqueleto continua sem entrada — um esqueleto é a espera, não uma
       apresentação. */
    <div className="bo-cena flex flex-col gap-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--bo-tinta-72)]">
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
            {/* 111×19 medidos a 375 px: o alvo de um checkbox é o RÓTULO
                inteiro (o HTML manda o toque no rótulo activar o controlo), e
                era o rótulo que estava baixo — não a caixa. `alvo-toque` no
                `label`, como nas listas base do Material, cresce o alvo sem
                mexer no quadrado desenhado. */}
            <label className="alvo-toque !justify-start flex items-center gap-2 text-[11px] text-[var(--bo-text-muted)]">
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
              ? "Os serviços que arquivares aparecem aqui, e continuam nas propostas antigas."
              : "Escreve os serviços à mão nas propostas e guarda aqui os que valer a pena reutilizar — ou cria um de raiz."
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
                      <p className="text-sm font-medium text-[var(--bo-text)]">{s.nome}</p>
                      {s.descricao && (
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--bo-text-muted)]">
                          {s.descricao}
                        </p>
                      )}
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="rounded-full bg-[var(--bo-tinta-6)] px-2 py-0.5 tracking-[0.08em] uppercase text-foreground/45">
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
                          alterarServico(
                            s.id,
                            { arquivado: !s.arquivado },
                            s.arquivado ? `desarquivar «${s.nome}»` : `arquivar «${s.nome}»`,
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
  const gravar = useGravar();
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
    const { ok } = servico
      ? await gravar(`corrigir «${servico.nome}»`, `/api/servicos-catalogo/${servico.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        })
      : await gravar(`guardar «${nome.trim()}» na biblioteca`, "/api/servicos-catalogo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
    setOcupado(false);
    // O formulário só fecha quando o servidor aceitou (é o `onGravado` que o
    // fecha): fechá-lo à mesma deixava-a a olhar para o texto antigo na lista,
    // com o que escreveu perdido e um aviso que já desapareceu.
    if (!ok) return;
    toast(servico ? "Serviço corrigido" : "Serviço guardado na biblioteca", "success");
    await onGravado();
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
