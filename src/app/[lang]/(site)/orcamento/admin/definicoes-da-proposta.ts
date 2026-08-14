"use client";

import { useEffect, useState } from "react";
import { MARGEM_MINIMA_OMISSAO } from "@/lib/orcamento/margem";
import { PARAMETROS_OMISSAO, type ParametrosDeslocacao } from "@/lib/orcamento/deslocacao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DEFINIÇÕES DA CASA, LIDAS UMA VEZ POR PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O preço do gasóleo, o consumo da carrinha, a margem mínima — decisões da casa
 * que mudam de vez em quando e não pertencem a nenhuma proposta em particular.
 * Vivem no servidor (`proposta-definicoes-store`).
 *
 * ── PORQUE É QUE A LEITURA É PARTILHADA ───────────────────────────────────
 * Dois sítios do estúdio precisam delas: o painel interno, onde os custos se
 * escrevem, e o bloco dos totais, onde a decisão se toma. Cada um a pedir o seu
 * eram dois pedidos iguais na mesma página — e duas maneiras diferentes de
 * ficar sem resposta. A promessa fica no módulo: quem chegar a seguir espera
 * pela que já está a caminho.
 *
 * Sem resposta — sem rede, sem definições gravadas, servidor em baixo — valem
 * os valores de partida. Um limite por omissão que avisa de mais é melhor do
 * que limite nenhum, que não avisa nunca.
 */
export interface DefinicoesDaProposta {
  deslocacao: ParametrosDeslocacao;
  margemMinima: number;
}

const OMISSAO: DefinicoesDaProposta = {
  deslocacao: PARAMETROS_OMISSAO,
  margemMinima: MARGEM_MINIMA_OMISSAO,
};

let promessa: Promise<DefinicoesDaProposta> | null = null;

function ler(): Promise<DefinicoesDaProposta> {
  promessa ??= fetch("/api/proposta-definicoes")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => ({
      // Os valores de partida POR BAIXO do que o servidor mandou, e não em vez
      // dele: uma resposta a que falte um campo — um servidor ainda por
      // actualizar no meio de um deploy, uma linha gravada antes de esse campo
      // existir — deixava o ecrã com um `undefined` no meio de uma frase e a
      // conta sem saber de onde parte. Com a base por baixo, o que falta cai no
      // que esse campo sempre significou.
      deslocacao: { ...OMISSAO.deslocacao, ...(j?.deslocacao ?? {}) },
      margemMinima: typeof j?.margemMinima === "number" ? j.margemMinima : OMISSAO.margemMinima,
    }))
    .catch(() => OMISSAO);
  return promessa;
}

/** Só para os testes: esquece o que já foi lido. */
export function esquecerDefinicoes() {
  promessa = null;
}

export function useDefinicoesDaProposta(): DefinicoesDaProposta {
  const [definicoes, setDefinicoes] = useState<DefinicoesDaProposta>(OMISSAO);
  useEffect(() => {
    let vivo = true;
    void ler().then((v) => {
      if (vivo) setDefinicoes(v);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return definicoes;
}
