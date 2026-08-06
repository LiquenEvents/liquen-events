"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { EventMaterial, EventMaterialItem } from "@/lib/event-material-types";
import { progresso } from "@/lib/event-material-types";
import { useToast } from "./Toast";
import { Button, SectionCard } from "./ui";

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

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/orcamento/${quote.id}/material`).then((x) => x.json());
      setDados(r);
    } catch {
      /* silêncio: o painel mostra o estado vazio e o botão de gerar */
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
      setDados({ evento: r.evento, itens: r.itens });
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
