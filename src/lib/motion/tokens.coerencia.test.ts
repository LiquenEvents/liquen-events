import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EASE_OUT, REVEAL_MS, REVEAL_S, STAGGER_S } from "./tokens";

/**
 * A COERÊNCIA DO MOVIMENTO, COM DENTES.
 *
 * O que faz um sítio parecer fluido não é uma animação boa: é as animações
 * obedecerem todas à mesma regra. A regra existe (`--ease-out` no globals.css),
 * mas o que a garantia tinha era boa vontade — a curva estava copiada à mão em
 * quatro ficheiros de JS e vinte e um sítios do CSS, e nada ligava as cópias.
 * Já divergiu uma vez, em silêncio: o comentário do Reveal descrevia uma curva
 * que a constante ao lado dele não usava.
 *
 * Estes testes ligam as cópias. Alterar um dos lados sozinho — a variável CSS,
 * a ficha JS, ou reintroduzir um literal numa primitiva — fica vermelho aqui, e
 * não fica invisível até alguém reparar que dois blocos vizinhos desaceleram de
 * maneiras diferentes.
 */

const lerFonte = (relativo: string) =>
  readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), "utf8");

/** Normaliza um valor CSS para comparar por conteúdo e não por espaços. */
const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();

/** Tira comentários (de linha e de bloco) — prosa não é código. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("ficha de movimento ↔ globals.css", () => {
  const css = lerFonte("../../app/globals.css");

  it("EASE_OUT é, caracter a caracter, a mesma curva que `--ease-out` no CSS", () => {
    const m = /--ease-out:\s*([^;]+);/.exec(css);
    expect(m, "o `--ease-out` desapareceu do :root do globals.css").not.toBeNull();
    // Se alguém afinar a curva de assinatura no CSS e não aqui (ou o
    // contrário), o sítio passa a ter DUAS desacelerações: o CSS numa, e tudo o
    // que o JS escreve em `element.style.transition` na outra.
    expect(norm(m![1])).toBe(norm(EASE_OUT));
  });

  it("a curva de assinatura é uma desaceleração de verdade (acaba devagar)", () => {
    // Guarda contra uma troca distraída por uma curva simétrica (`ease`,
    // `cubic-bezier(0.4,0,0.2,1)`): o segundo ponto de controlo tem de estar
    // praticamente no fim para o movimento assentar em vez de parar de repente.
    const n = /cubic-bezier\(([^)]+)\)/.exec(EASE_OUT);
    expect(n).not.toBeNull();
    const [x1, , x2, y2] = n![1].split(",").map((v) => parseFloat(v));
    expect(x1).toBeLessThan(0.35); // arranca depressa
    expect(x2).toBeLessThan(0.5); // e já está quase parada bem antes do fim
    expect(y2).toBe(1);
  });
});

describe("as primitivas de movimento leem a ficha, não uma cópia", () => {
  // Todos os ficheiros que ESCREVEM movimento a partir de JS. Um literal
  // `cubic-bezier(...)` aqui dentro é uma cópia nova da curva de assinatura — a
  // avaria que estes testes existem para apanhar.
  const primitivas = [
    "../../components/motion/Reveal.tsx",
    "../../components/motion/TiltCard.tsx",
    "../../components/AnimateIn.tsx",
    "../../components/TestimonialsCarousel.tsx",
  ];

  it.each(primitivas)("%s não escreve nenhuma curva à mão", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    expect(src).not.toMatch(/cubic-bezier\(/);
  });

  it.each(primitivas)("%s importa a curva de @/lib/motion/tokens", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    expect(src).toMatch(/from\s+"@\/lib\/motion\/tokens"/);
  });

  it("Reveal e AnimateIn revelam com a MESMA duração (a ficha, não um número solto)", () => {
    // Já eram os dois 0,75 s — mas por coincidência, cada um com o seu literal.
    // Duas entradas do mesmo gesto na mesma página com durações diferentes é
    // exactamente o que se lê como desleixo.
    for (const f of ["../../components/motion/Reveal.tsx", "../../components/AnimateIn.tsx"]) {
      const src = semComentarios(lerFonte(f));
      expect(src, f).toMatch(/REVEAL_S/);
      // e nenhum `0.75s` escrito à mão a fazer de conta que é a mesma coisa
      expect(src, f).not.toMatch(/0\.75s/);
    }
  });
});

describe("valores da ficha", () => {
  it("segundos e milissegundos descrevem o mesmo tempo", () => {
    expect(REVEAL_S).toBeCloseTo(REVEAL_MS / 1000, 10);
  });

  it("a cascata resolve-se depressa: 6 elementos ficam abaixo de 1,5 s no total", () => {
    // Uma cascata é para se ler como composta, não para se esperar por ela. Com
    // 6 elementos (o maior `stagger` do sítio hoje), o último tem de estar
    // acabado bem dentro do tempo em que alguém ainda está a olhar.
    const totalS = STAGGER_S * 5 + REVEAL_S;
    expect(totalS).toBeLessThan(1.5);
  });
});
