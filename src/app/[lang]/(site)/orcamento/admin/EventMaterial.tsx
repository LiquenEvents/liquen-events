"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { EventMaterial, EventMaterialItem } from "@/lib/event-material-types";
import { progresso } from "@/lib/event-material-types";
import { useToast } from "./Toast";
import { Button, SectionCard } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";

/**
 * A CHECKLIST DE MATERIAL DESTE EVENTO.
 *
 * Gerada a partir dos essenciais de carrinha mais o que as regras implicarem da
 * proposta. Cada linha diz DE ONDE VEIO — sem isso, uma lista automática é uma
 * lista que ninguém percebe e toda a gente começa a ignorar.
 *
 * Aqui é onde se prepara. O carregamento no telemóvel, offline, é o bloco 4.
 */

interface Resposta {
  evento: EventMaterial | null;
  itens: EventMaterialItem[];
}

export default function EventMaterialPanel({ quote }: { quote: Quote }) {
  const { toast } = useToast();
  const [dados, setDados] = useState<Resposta>({ evento: null, itens: [] });
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  /**
   * O que a leitura disse quando falhou. `null` é "correu bem"; a string vazia é
   * "falhou e o servidor não explicou". São três estados e não dois, porque
   * "não há checklist" e "não consegui perguntar" NÃO são a mesma coisa — ver o
   * desenho, mais abaixo.
   */
  const [falha, setFalha] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      /**
       * ══════════════════════════════════════════════════════════════════════
       * UM ERRO AQUI REBENTAVA O BACK OFFICE INTEIRO
       * ══════════════════════════════════════════════════════════════════════
       *
       * Não havia `res.ok`. Numa resposta de erro o corpo é `{ error: "…" }`,
       * portanto `dados.itens` ficava `undefined` — e a linha que conta o
       * progresso faz `itens.filter(...)`, que atira.
       *
       * Este painel é desenhado DENTRO da gaveta do pedido, por isso a excepção
       * subia até ao ecrã de erro da aplicação e substituía o back office todo.
       * Com a gaveta aberta, o preço meio escrito e as notas por gravar a irem
       * com ele.
       *
       * E os gatilhos não são exóticos: a rota devolve 401 quando a sessão
       * caduca ou quando alguém carrega em Sair noutro aparelho, e 500 se as
       * tabelas de material ainda não existirem.
       *
       * A guarda é a mesma que o ecrã da carrinha já fazia — este ficheiro era
       * a excepção. Nunca se escreve no estado o que não tem a forma certa.
       */
      const res = await fetch(`/api/orcamento/${quote.id}/material`);
      if (!res.ok) {
        // E a falha tem de CHEGAR AO ECRÃ. Ficar-se pelo `return` deixava o
        // painel a afirmar "Ainda sem checklist", com o botão de gerar ao lado,
        // sobre um evento que pode ter meia carrinha já carregada — ver o
        // desenho, mais abaixo.
        const corpo = await res.json().catch(() => null);
        setFalha(typeof corpo?.error === "string" ? corpo.error : "");
        return;
      }
      const r = await res.json();
      setDados({
        evento: r?.evento ?? null,
        itens: Array.isArray(r?.itens) ? r.itens : [],
      });
      setFalha(null);
    } catch {
      setFalha("");
    } finally {
      setCarregando(false);
    }
  }, [quote.id]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  async function gerar() {
    setGerando(true);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/material`, { method: "POST" });
      const r = await res.json();
      if (!res.ok) throw new Error();
      // A mesma regra do `buscar`: só entra no estado o que tem a forma certa.
      setDados({ evento: r?.evento ?? null, itens: Array.isArray(r?.itens) ? r.itens : [] });
      setFalha(null);
      toast(
        r.preservadas > 0
          ? `Checklist atualizada. ${r.preservadas} marcações mantidas.`
          : `Checklist gerada: ${r.itens.length} itens.`,
        "success",
      );
    } catch {
      toast("Não foi possível gerar a checklist.", "error");
    } finally {
      setGerando(false);
    }
  }

  const { itens } = dados;
  const p = useMemo(() => progresso(itens), [itens]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, EventMaterialItem[]>();
    for (const i of itens) {
      const lista = mapa.get(i.category) ?? [];
      lista.push(i);
      mapa.set(i.category, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens]);

  /**
   * ── A LEITURA FALHOU E NÃO TEMOS NADA ────────────────────────────────────
   * Aqui não se desenha o painel: desenha-se a falha, e sem o botão de gerar.
   *
   * "Ainda sem checklist" é uma AFIRMAÇÃO sobre o evento, e uma leitura que não
   * chegou a acontecer não a sabe fazer. O passo seguinte que ela sugere —
   * "Gerar checklist" — é o que faz estragos: a geração só preserva o que está
   * carregado, as notas e o veículo, e as marcações de devolvido e de em falta
   * ficam para trás. Não se convida a isso a partir de um 401.
   *
   * Se já tínhamos lido a checklist e é só a releitura que falha, fica o que
   * temos: velho, mas verdadeiro.
   */
  if (!carregando && falha !== null && !dados.evento) {
    return (
      <SectionCard
        title="Material do evento"
        description="O que tem de ir na carrinha para esta montagem"
      >
        <AvisoDeFalha
          titulo="Não foi possível ler o material deste evento"
          mensagem={falha}
          aoTentarDeNovo={() => void buscar()}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Material do evento"
      description="O que tem de ir na carrinha para esta montagem"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={gerar} disabled={gerando}>
          {dados.evento ? "Voltar a gerar" : "Gerar checklist"}
        </Button>
        {dados.evento && itens.length > 0 && (
          // O carregamento faz-se no telemóvel, de pé, ao lado da carrinha —
          // não aqui. Este botão é a ponte para lá.
          <a
            href={`/orcamento/admin/carregamento/${dados.evento.id}`}
            className="bo-btn-ghost inline-flex min-h-[32px] items-center rounded-xl px-3 text-xs"
          >
            Abrir para carregar
          </a>
        )}
        {dados.evento && (
          <span className="bo-text-muted text-xs">
            {p.total} {p.total === 1 ? "item" : "itens"}
            {p.criticosPorCarregar.length > 0 &&
              ` · ${p.criticosPorCarregar.length} crítico${
                p.criticosPorCarregar.length === 1 ? "" : "s"
              }`}
          </span>
        )}
      </div>

      {carregando ? null : !dados.evento ? (
        <p className="bo-text-muted mt-3 text-sm">
          Ainda sem checklist. Ao gerar, junta os essenciais de carrinha ao que as regras
          encontrarem nesta proposta.
        </p>
      ) : itens.length === 0 ? (
        <p className="bo-text-muted mt-3 text-sm">
          A geração não trouxe nada. Falta criar os “Essenciais de carrinha” em Material, ou o
          catálogo está vazio.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {porCategoria.map(([categoria, linhas]) => (
            <div key={categoria}>
              <p className="mb-1.5 text-[11px] tracking-[0.14em] text-foreground/55 uppercase">
                {categoria}
              </p>
              <ul className="divide-y divide-foreground/[0.06]">
                {linhas.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                    {i.critical && (
                      <span className="text-[#a03a1a]" aria-label="crítico" title="Crítico">
                        ▲
                      </span>
                    )}
                    <span>{i.name}</span>
                    <span className="text-sm">
                      {i.qty}
                      {i.unit ? ` ${i.unit}` : ""}
                    </span>
                    {/* A coluna que responde a "porque é que isto está aqui?" */}
                    <span className="bo-text-muted ml-auto text-xs">{i.originLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
