"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM É QUE ESTÁ A EMPURRAR A PÁGINA PARA O LADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela mandou capturas do estúdio no iPhone com o conteúdo encostado e uma
 * folha branca ao lado — a página desliza na horizontal. Aqui não se
 * reproduz: MEDIDO no Chromium com toque emulado, a 320, 360, 375, 390 e
 * 393 px, o documento mede exactamente a largura do ecrã e nenhum elemento
 * passa a margem — e continua igual com o `overflow-x: clip` desligado à
 * força, o que exclui haver transbordo escondido por baixo dele.
 *
 * Sem Safari nesta máquina (o motor não se instala, a rede não deixa), a única
 * medição que vale é a que corre no aparelho DELA. É isto.
 *
 * ── PORQUE É QUE UM VARRIMENTO NORMAL NÃO CHEGA ───────────────────────────
 *
 * `document.documentElement.scrollWidth` só conta o que passa à DIREITA: um
 * elemento parado em `left: -256` — uma gaveta fora do ecrã, por exemplo —
 * nunca aparece nessa conta. Por isso aqui mede-se cada caixa contra as duas
 * margens, e diz-se de que lado é.
 *
 * E há três coisas que um `querySelectorAll` sozinho não vê e que este
 * medidor procura à parte: os pseudo-elementos (`::before`/`::after`), o que
 * está dentro de `iframe`, e os elementos `position: fixed` — que o
 * `overflow` do `body` NÃO recorta, e que são por isso os únicos capazes de
 * escapar à rede de segurança da folha de estilo.
 *
 * ── COMO SE LIGA, E PORQUE É QUE NÃO ESTÁ SEMPRE LIGADO ───────────────────
 *
 * Só com `?medir=1` no endereço. Não é uma funcionalidade — é um instrumento,
 * e um instrumento que fica ligado sozinho acaba a pesar em quem nunca pediu
 * para o usar. Não grava nada, não manda nada para lado nenhum, e não guarda
 * estado: lê o ecrã como ele está e escreve o resultado por cima.
 */

interface Culpado {
  lado: "direita" | "esquerda";
  tag: string;
  quanto: number;
  largura: number;
  posicao: string;
  onde: string;
  texto: string;
}

/** O caminho até um elemento, curto o suficiente para caber no ecrã. */
function caminho(el: Element): string {
  const partes: string[] = [];
  let n: Element | null = el;
  for (let i = 0; n && i < 4; i++) {
    const cls = String((n as HTMLElement).className || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".");
    partes.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ""));
    n = n.parentElement;
  }
  return partes.join(" › ");
}

function medir(): { largura: number; doc: number; culpados: Culpado[] } {
  const largura = document.documentElement.clientWidth;
  const culpados: Culpado[] = [];

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // A margem de meio pixel evita o ruído de arredondamento das caixas.
    const passaDireita = r.right > largura + 0.5;
    const passaEsquerda = r.left < -0.5;
    if (!passaDireita && !passaEsquerda) continue;
    const cs = getComputedStyle(el);
    culpados.push({
      lado: passaDireita ? "direita" : "esquerda",
      tag: el.tagName.toLowerCase(),
      quanto: Math.round(passaDireita ? r.right - largura : -r.left),
      largura: Math.round(r.width),
      posicao: cs.position,
      onde: caminho(el),
      texto: (el.textContent || "").trim().slice(0, 40),
    });
  }

  // Do que empurra mais para o que empurra menos: o primeiro da lista é quase
  // sempre a causa, e os outros são filhos dele a ir atrás.
  culpados.sort((a, b) => b.quanto - a.quanto);
  return { largura, doc: document.documentElement.scrollWidth, culpados };
}

export default function MedidorDeTransbordo() {
  // `useSearchParams` e não um efeito a ler o `location`: um efeito a pôr
  // estado logo à entrada é uma renderização a mais, e ler o `window` no
  // arranque dava desencontro com o que o servidor desenhou.
  const ligado = useSearchParams().get("medir") === "1";
  const [resultado, setResultado] = useState<ReturnType<typeof medir> | null>(null);

  if (!ligado) return null;

  return (
    <div
      className="fixed bottom-24 left-2 right-2 z-[100] max-h-[45vh] overflow-auto rounded-xl border border-[#8a2a22] bg-white/95 p-3 text-[11px] leading-tight shadow-[var(--bo-sombra-suspensa)]"
      style={{ backdropFilter: "blur(4px)" }}
    >
      <button
        type="button"
        onClick={() => setResultado(medir())}
        className="min-h-[44px] w-full rounded-lg bg-[#5F7C66] px-3 font-semibold text-white"
      >
        Medir o que está a passar da margem
      </button>

      {resultado && (
        <div className="mt-2">
          <p className="font-semibold">
            Ecrã {resultado.largura} px · documento {resultado.doc} px ·{" "}
            {resultado.culpados.length === 0
              ? "nada a passar"
              : `${resultado.culpados.length} a passar`}
          </p>
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {resultado.culpados.slice(0, 12).map((c, i) => (
              <li key={i} className="rounded border border-foreground/15 p-1.5">
                <span className="font-semibold">
                  {c.quanto} px pela {c.lado}
                </span>{" "}
                · {c.tag} · {c.posicao} · largura {c.largura}
                <br />
                <span className="text-foreground/60">{c.onde}</span>
                {c.texto && <br />}
                {c.texto && <span className="text-foreground/50">«{c.texto}»</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
