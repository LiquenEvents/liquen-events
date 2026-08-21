"use client";

import { useEffect, useState } from "react";
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";

/**
 * ONDE ESTOU E O QUE FALTA — a coluna lateral do estúdio.
 *
 * ── Porquê ────────────────────────────────────────────────────────────────
 * A proposta tem seis secções e (medido na Fase 0) dois ecrãs e meio de
 * scroll mesmo vazia — cinco e meio quando está feita. A meio disso não há
 * forma de saber quanto falta nem o que já está feito, e é preciso percorrer
 * tudo para descobrir porque é que o botão de enviar não deixa.
 *
 * ── O que a marca de «preenchida» significa ───────────────────────────────
 * Conteúdo, não estrutura. A regra está em `proposal-progress.ts` e é a MESMA
 * que decide se o envio pode acontecer — para o aviso e o botão nunca poderem
 * discordar.
 *
 * ── Escondida no telemóvel ────────────────────────────────────────────────
 * Uma coluna lateral num ecrã de 375px é uma coluna a roubar metade da
 * largura ao trabalho. Abaixo de `xl` o estúdio fica como estava, e quem lá
 * navega tem os passos e o scroll.
 */

interface Props {
  seccoes: EstadoSeccao[];
  faltas: Impedimento[];
  /**
   * Onde é que ela está a trabalhar, dito para fora.
   *
   * Esta coluna já sabe qual é a secção à vista — é para isso que o observador
   * existe — e o estúdio precisa da mesma resposta para poder dizer QUE SECÇÃO
   * custou o tempo que mede (ver `tempo-activo-servidor.ts`). Um segundo
   * observador lá em cima seria a mesma pergunta feita duas vezes, com duas
   * respostas a poderem discordar.
   *
   * Opcional: quem só quer a coluna não passa nada e nada muda.
   */
  onSeccaoActual?: (id: string | null) => void;
  /**
   * Quantas traduções faltam em cada secção — a chave é o `id` da secção.
   *
   * Opcional, e ausente é o caso normal: numa proposta portuguesa não há nada
   * por traduzir, e uma linha a dizer «0 traduções em falta» debaixo de cada
   * secção seria uma fila de zeros no índice de toda a gente. Quem passa isto é
   * o estúdio, e só com a proposta a sair em inglês.
   */
  porTraduzir?: Record<string, number>;
}

export default function NavEstudio({ seccoes, faltas, onSeccaoActual, porTraduzir }: Props) {
  const [atual, setAtual] = useState<string | null>(null);

  // ── Onde estou ────────────────────────────────────────────────────────
  // Um observador em vez de ouvir o scroll: dá a resposta sem correr código a
  // cada pixel de roda do rato, que numa página deste tamanho se sente.
  useEffect(() => {
    // Sem `IntersectionObserver` a coluna continua a funcionar — só não marca
    // onde se está. Saltar e ver o que falta, que é para o que ela serve, não
    // depende disto. (No jsdom dos testes não existe, e sem esta guarda o
    // estúdio inteiro deixava de montar.)
    if (typeof IntersectionObserver === "undefined") return;
    const alvos = seccoes
      .map((s) => document.getElementById(`seccao-${s.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (alvos.length === 0) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        // A secção «actual» é a que está mais acima entre as visíveis. Sem
        // esta escolha, duas secções visíveis ao mesmo tempo faziam a marca
        // saltar para trás e para a frente enquanto se rola devagar.
        const visiveis = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visiveis[0]) {
          const id = visiveis[0].target.id.replace("seccao-", "");
          setAtual(id);
          onSeccaoActual?.(id);
        }
      },
      // A margem de topo tira da conta a barra do cabeçalho, para a secção
      // que está por baixo dela não contar como «onde estou».
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 },
    );
    alvos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
  }, [seccoes, onSeccaoActual]);

  function saltarPara(id: string) {
    const el = document.getElementById(`seccao-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Levar o FOCO e não só a vista: quem navega por teclado ficava com o
    // foco no botão da coluna e o Tab seguinte voltava ao princípio da lista.
    const primeiro = el.querySelector<HTMLElement>("input, textarea, select, button");
    primeiro?.focus({ preventScroll: true });
  }

  const travam = faltas.filter((f) => f.trava);
  const conselhos = faltas.filter((f) => !f.trava);

  return (
    <nav
      aria-label="Secções da proposta"
      /* TECTO: é `sticky`, portanto uma lista mais alta do que o ecrã ficava
         com o fim inalcançável — não se rola até ele, porque a coluna não
         acompanha o rolo da página. Só age quando há secções e faltas que
         cheguem; até lá não se nota. */
      className="sticky top-4 hidden max-h-[calc(100vh-2rem)] w-48 shrink-0 self-start overflow-y-auto xl:block"
    >
      <ul className="flex flex-col gap-0.5">
        {seccoes.map((s) => {
          const aqui = atual === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => saltarPara(s.id)}
                aria-current={aqui ? "true" : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  aqui ? "bg-[#4d6350]/[0.08]" : "hover:bg-foreground/[0.04]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.preenchida ? "bg-[#4d6350]" : "border border-foreground/25"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs ${aqui ? "font-medium text-foreground/85" : "text-foreground/65"}`}
                  >
                    {s.titulo}
                  </span>
                  <span className="block truncate text-[10px] text-foreground/40">{s.resumo}</span>
                  {/* ── O QUE FALTA TRADUZIR, AQUI ─────────────────────────
                      Linha própria e não colada ao resumo: a coluna tem 192 px
                      e o resumo já é `truncate` — «2 grupos · 2 traduções em
                      falta» sairia «2 grupos · 2 tradu…», que é a metade que
                      não interessa. E cor própria, a mesma do que está por
                      rever: é uma falta, não uma descrição. */}
                  {(porTraduzir?.[s.id] ?? 0) > 0 && (
                    <span className="block truncate text-[10px] text-[#8a6420]">
                      {porTraduzir![s.id] === 1
                        ? "1 tradução em falta"
                        : `${porTraduzir![s.id]} traduções em falta`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* O que falta. A cor separa o que TRAVA do que é conselho: laranja é
          aviso, e o verde da marca está reservado à acção principal. */}
      {faltas.length > 0 && (
        <div className="mt-4 border-t border-foreground/10 pt-3">
          {/*
           * ── «TALVEZ QUEIRA» NÃO QUERIA DIZER NADA ──────────────────────
           *
           * Era o que se lia por cima da lista quando nada travava o envio, e
           * a frase debaixo dela era «Nenhum grupo de serviços». Juntas:
           * «Talvez queira: Nenhum grupo de serviços» — uma sugestão escrita
           * como se fosse um desejo dela, e a dizer o contrário do que ela quer.
           *
           * O rótulo passa a dizer o que a lista É: coisas por fazer que não
           * impedem o envio. E a lista deixou de mentir sobre os grupos — ver
           * `oQueTemODocumento`, em `proposal-progress.ts`.
           */}
          <p className="mb-1.5 text-[10px] tracking-[0.1em] uppercase text-foreground/40">
            {travam.length > 0 ? "Falta para enviar" : "Ainda por fazer"}
          </p>
          <ul className="flex flex-col gap-1">
            {[...travam, ...conselhos].map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => saltarPara(f.seccao)}
                  className="flex w-full items-start gap-1.5 text-left text-[11px] leading-snug text-foreground/55 hover:text-foreground/85"
                >
                  <span
                    aria-hidden
                    className={`mt-1 h-1 w-1 shrink-0 rounded-full ${
                      f.trava ? "bg-[#c98a2e]" : "bg-foreground/25"
                    }`}
                  />
                  <span className="underline-offset-2 hover:underline">{f.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
