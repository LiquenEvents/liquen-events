"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPO PASSADO NA GALERIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUÊ. Neste negócio a galeria é a peça que vende. Ninguém contrata
 * decoração de casamento sem ver trabalho feito, e quem fica três minutos a
 * percorrer fotografias está muito mais perto de pedir orçamento do que quem
 * abre e fecha. Sem este sinal, o funil tem um buraco entre "chegou ao site" e
 * "preencheu o formulário", e as campanhas que trazem gente que REPARA são
 * indistinguíveis das que trazem gente que passa.
 *
 * COMO. Marcos aos 15, 30, 60 e 120 segundos de tempo ATENTO. Cada marco
 * dispara uma vez por visita.
 *
 * ── O QUE "ATENTO" QUER DIZER, E PORQUE É QUE ISTO NÃO É UM setInterval ────
 * O relógio pára quando o separador deixa de estar visível. Sem isso, um
 * separador esquecido aberto durante uma tarde inteira dispararia todos os
 * marcos e ensinaria a Google que aquele visitante era o melhor do dia. É o
 * erro clássico das métricas de tempo, e transforma esquecimento em sinal de
 * compra.
 *
 * ── PORQUÊ MARCOS E NÃO O TEMPO EXACTO ────────────────────────────────────
 * Porque só os marcos são utilizáveis: no GA4 tornam-se eventos que se podem
 * marcar como conversão secundária e usar para construir públicos de
 * remarketing ("viu a galeria a sério mas não pediu orçamento"). Um número
 * contínuo enviado no fim seria uma estatística bonita e inútil, e além disso
 * perder-se-ia sempre que o separador fechasse.
 */

const MARCOS = [15, 30, 60, 120] as const;

export default function TempoNaGaleria() {
  const acumuladoRef = useRef(0);
  const desdeRef = useRef<number | null>(null);
  const disparadosRef = useRef(new Set<number>());

  useEffect(() => {
    // Só conta enquanto a página está visível.
    const arrancar = () => {
      if (desdeRef.current === null) desdeRef.current = Date.now();
    };
    const parar = () => {
      if (desdeRef.current !== null) {
        acumuladoRef.current += Date.now() - desdeRef.current;
        desdeRef.current = null;
      }
    };

    const segundosAtentos = () => {
      const emCurso = desdeRef.current === null ? 0 : Date.now() - desdeRef.current;
      return (acumuladoRef.current + emCurso) / 1000;
    };

    const verificar = () => {
      const s = segundosAtentos();
      for (const marco of MARCOS) {
        if (s >= marco && !disparadosRef.current.has(marco)) {
          disparadosRef.current.add(marco);
          track("GaleriaTempo", { segundos: marco });
        }
      }
    };

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") arrancar();
      else {
        parar();
        // Ao esconder, ainda se verifica: um marco atingido mesmo antes de o
        // separador mudar seria de outra forma perdido.
        verificar();
      }
    };

    if (document.visibilityState === "visible") arrancar();
    // Cinco segundos é folgado que chegue para não pesar e fino que chegue para
    // não atrasar um marco de forma perceptível.
    const relogio = setInterval(verificar, 5000);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      parar();
      verificar();
    };
  }, []);

  return null;
}
