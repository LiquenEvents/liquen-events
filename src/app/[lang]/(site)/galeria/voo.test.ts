import { describe, it, expect } from "vitest";
import {
  aVista,
  decidirDeslize,
  elastico,
  caixaContida,
  dentroDe,
  focoEmFraccao,
  janelaDaTira,
  miniaturasNaTira,
  POSE_FINAL,
  poseDaMiniatura,
  proporcao,
} from "./voo";

/** Lê a pose de volta em números, para comparar sem depender da escrita. */
function ler(pose: { transform: string; clipPath: string }) {
  const t = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(pose.transform)!;
  const c = /inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px\)/.exec(pose.clipPath)!;
  return {
    tx: +t[1],
    ty: +t[2],
    s: +t[3],
    top: +c[1],
    right: +c[2],
    bottom: +c[3],
    left: +c[4],
  };
}

describe("proporcao", () => {
  it("lê as formas que a galeria usa", () => {
    expect(proporcao("3/2")).toBe(1.5);
    expect(proporcao("1200 / 1600")).toBe(0.75);
    expect(proporcao(2)).toBe(2);
  });
  it("sem nada que se leia, quadrado — nunca NaN nem zero", () => {
    expect(proporcao(undefined)).toBe(1);
    expect(proporcao("x")).toBe(1);
    expect(proporcao("3/0")).toBe(1);
  });
});

describe("caixaContida", () => {
  it("uma foto deitada numa área larga fica limitada pela altura, ao centro", () => {
    expect(caixaContida({ x: 80, y: 72, w: 1180, h: 597 }, 1.5)).toEqual({
      x: 80 + (1180 - 895.5) / 2,
      y: 72,
      w: 895.5,
      h: 597,
    });
  });
  it("uma foto ao alto num telemóvel fica limitada pela largura", () => {
    const c = caixaContida({ x: 8, y: 60, w: 374, h: 700 }, 0.75);
    expect(c.w).toBe(374);
    expect(c.h).toBeCloseTo(498.67, 1);
    expect(c.y).toBeCloseTo(60 + (700 - 498.67) / 2, 1);
  });
  it("área vazia (jsdom, ou ainda sem desenho) dá caixa vazia", () => {
    expect(caixaContida({ x: 0, y: 0, w: 0, h: 0 }, 1.5).w).toBe(0);
  });
});

describe("focoEmFraccao", () => {
  it("lê o ponto de interesse e prende-o entre 0 e 1", () => {
    expect(focoEmFraccao("30% 40%")).toEqual({ fx: 0.3, fy: 0.4 });
    expect(focoEmFraccao("120% -5%")).toEqual({ fx: 1, fy: 0 });
  });
  it("sem ponto, o centro", () => {
    expect(focoEmFraccao(undefined)).toEqual({ fx: 0.5, fy: 0.5 });
  });
});

describe("poseDaMiniatura", () => {
  const destino = { x: 222.25, y: 72, w: 895.5, h: 597 };

  it("uma miniatura com a MESMA proporção não leva recorte nenhum", () => {
    // O masonry não corta: a caixa tem a proporção da foto.
    const mini = { x: 10, y: 400, w: 300, h: 200 };
    const p = ler(poseDaMiniatura(destino, mini));
    expect(p.s).toBeCloseTo(300 / 895.5, 3);
    expect(p.tx).toBeCloseTo(10 - 222.25, 1);
    expect(p.ty).toBeCloseTo(400 - 72, 1);
    expect(p.top + p.right + p.bottom + p.left).toBeCloseTo(0, 0);
  });

  it("uma miniatura quadrada de uma foto deitada corta os lados, pelo centro", () => {
    const mini = { x: 100, y: 100, w: 200, h: 200 };
    const p = ler(poseDaMiniatura(destino, mini));
    // Cover: a altura manda — 200 / 597.
    expect(p.s).toBeCloseTo(200 / 597, 3);
    // Pintada, a foto tem 300 de largura: sobram 50 de cada lado, que se
    // cortam. Em coordenadas da cópia (antes da escala) são 50 / s.
    expect(p.left).toBeCloseTo(50 / (200 / 597), 0);
    expect(p.right).toBeCloseTo(50 / (200 / 597), 0);
    expect(p.top).toBeCloseTo(0, 1);
    expect(p.bottom).toBeCloseTo(0, 1);
  });

  it("o recorte segue o ponto de interesse, como na grelha", () => {
    const mini = { x: 100, y: 100, w: 200, h: 200 };
    const p = ler(poseDaMiniatura(destino, mini, mini, "0% 50%"));
    // Encostada à esquerda: nada cortado à esquerda, tudo à direita.
    expect(p.left).toBeCloseTo(0, 1);
    expect(p.right).toBeCloseTo(100 / (200 / 597), 0);
  });

  it("com o zoom do rato, a imagem é maior do que o recorte e o recorte aperta", () => {
    const mini = { x: 100, y: 100, w: 300, h: 200 };
    const zoom = { x: 95.5, y: 97, w: 309, h: 206 };
    const p = ler(poseDaMiniatura(destino, mini, zoom));
    expect(p.s).toBeCloseTo(309 / 895.5, 3);
    expect(p.left).toBeGreaterThan(0);
    expect(p.top).toBeGreaterThan(0);
  });

  it("sem destino medido, não inventa: a pose final", () => {
    expect(poseDaMiniatura({ x: 0, y: 0, w: 0, h: 0 }, { x: 1, y: 1, w: 1, h: 1 })).toEqual(
      POSE_FINAL,
    );
  });
});

describe("dentroDe e aVista", () => {
  const c = { x: 100, y: 50, w: 200, h: 100 };
  it("um clique na foto conta como dentro, nas faixas de fora não", () => {
    expect(dentroDe(c, 150, 100)).toBe(true);
    expect(dentroDe(c, 99, 100)).toBe(false);
    expect(dentroDe(c, 150, 151)).toBe(false);
  });
  it("à vista é tocar a janela, nem que seja um bocado", () => {
    expect(aVista(c, 1340, 768)).toBe(true);
    expect(aVista({ ...c, y: 900 }, 1340, 768)).toBe(false);
    expect(aVista({ ...c, y: -120 }, 1340, 768)).toBe(false);
    expect(aVista({ ...c, y: -60 }, 1340, 768)).toBe(true);
  });
});

describe("a tira de miniaturas", () => {
  it("cabe no ecrã: 5 a 390 px, 7 numa secretária, nunca menos de 3", () => {
    expect(miniaturasNaTira(390)).toBe(5);
    expect(miniaturasNaTira(1340)).toBe(7);
    expect(miniaturasNaTira(320)).toBe(3);
    expect(miniaturasNaTira(200)).toBe(3);
  });
  it("a tira de 5 a 390 px cabe mesmo: 4 × 64 + 72 + margens < 390", () => {
    const n = miniaturasNaTira(390);
    expect((n - 1) * 64 + 72 + 32).toBeLessThanOrEqual(390);
  });
  it("é sempre ímpar, para a foto aberta ficar ao meio", () => {
    for (let w = 200; w < 2000; w += 37) expect(miniaturasNaTira(w) % 2).toBe(1);
  });
  it("a janela não passa das pontas", () => {
    expect(janelaDaTira(0, 100, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(janelaDaTira(50, 100, 5)).toEqual([48, 49, 50, 51, 52]);
    expect(janelaDaTira(99, 100, 5)).toEqual([95, 96, 97, 98, 99]);
    expect(janelaDaTira(1, 3, 5)).toEqual([0, 1, 2]);
  });
});

describe("decidirDeslize (GAL-2)", () => {
  const base = { largura: 1000, haAnterior: true, haSeguinte: true };
  it("muda a partir de 20 % da largura, devagar", () => {
    expect(decidirDeslize({ ...base, dx: -201, velocidade: -0.05 })).toBe(1);
    expect(decidirDeslize({ ...base, dx: 201, velocidade: 0.05 })).toBe(-1);
    expect(decidirDeslize({ ...base, dx: -150, velocidade: -0.05 })).toBe(0);
  });
  it("um gesto rápido muda mesmo curto, mas não um toque trémulo", () => {
    expect(decidirDeslize({ ...base, dx: -40, velocidade: -0.8 })).toBe(1);
    // 40 px em ~120 ms: um polegar decidido, medido no browser.
    expect(decidirDeslize({ ...base, dx: -40, velocidade: -0.34 })).toBe(1);
    // 40 px em 300 ms: arrastar devagar não muda.
    expect(decidirDeslize({ ...base, dx: -40, velocidade: -0.13 })).toBe(0);
    expect(decidirDeslize({ ...base, dx: -5, velocidade: -0.8 })).toBe(0);
  });
  it("um gesto rápido ao contrário desiste, mesmo depois dos 20 %", () => {
    expect(decidirDeslize({ ...base, dx: -400, velocidade: 0.9 })).toBe(0);
  });
  it("nunca vai para uma vizinha que não existe", () => {
    expect(decidirDeslize({ ...base, haAnterior: false, dx: 600, velocidade: 2 })).toBe(0);
    expect(decidirDeslize({ ...base, haSeguinte: false, dx: -600, velocidade: -2 })).toBe(0);
  });
});

describe("elastico (GAL-2)", () => {
  it("cresce cada vez mais devagar e nunca passa de um terço da largura", () => {
    const a = elastico(100, 900);
    const b = elastico(200, 900);
    const c = elastico(10_000, 900);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(100);
    expect(b - a).toBeLessThan(a);
    expect(c).toBeLessThan(300);
  });
  it("é simétrico, e zero é zero", () => {
    expect(elastico(-120, 900)).toBeCloseTo(-elastico(120, 900), 10);
    expect(elastico(0, 900)).toBe(0);
  });
});
