// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EsqueletoDeCor, corSegura } from "./Skeleton";
import { EsqueletoDeCor as DoBarril } from "./ui";

/**
 * O lugar de uma fotografia a chegar pinta-se com a cor dominante dela
 * (`ThemeImage.cor`, calculada pelo `src/lib/cor-dominante.ts`). Ainda não
 * está em ecrã nenhum — as grelhas dos Temas usam-no na fase seguinte. O que
 * se prende aqui é o que não pode falhar quando lá chegar: só entra no CSS o
 * formato que o `cor-dominante` produz, sem cor é o cinzento de sempre, e com
 * cor não há brilho a passar.
 */

afterEach(cleanup);

const bloco = (c: HTMLElement) => c.firstElementChild as HTMLElement;

describe("EsqueletoDeCor", () => {
  it("com a cor da fotografia, é um bloco liso dessa cor, escondido do leitor de ecrã", () => {
    const { container } = render(<EsqueletoDeCor cor="#5f7c66" />);
    const el = bloco(container);
    expect(el.style.backgroundColor).toBe("rgb(95, 124, 102)");
    expect(el).toHaveAttribute("aria-hidden", "true");
    // Sem o brilho: o `.bo-skeleton` é que o traz (o `::after` animado).
    expect(el).not.toHaveClass("bo-skeleton");
    expect(el).toHaveClass("rounded-[var(--bo-raio-conteudo)]");
  });

  it("sem cor, é o esqueleto cinzento de sempre", () => {
    for (const cor of [undefined, null, ""]) {
      const { container } = render(<EsqueletoDeCor cor={cor} className="h-24" />);
      const el = bloco(container);
      expect(el).toHaveClass("bo-skeleton", "h-24");
      expect(el.style.backgroundColor).toBe("");
      expect(el).toHaveAttribute("aria-hidden", "true");
      cleanup();
    }
  });

  it("um valor que não é `#rrggbb` não chega ao CSS — cai no cinzento", () => {
    for (const cor of [
      "red",
      "#fff",
      "#5f7c6680",
      "rgb(95, 124, 102)",
      "#5f7c66; background-image: url(https://exemplo/x.png)",
      "var(--bo-perigo)",
      "url(javascript:alert(1))",
    ]) {
      const { container } = render(<EsqueletoDeCor cor={cor} />);
      const el = bloco(container);
      expect(el, `«${cor}» passou`).toHaveClass("bo-skeleton");
      expect(el.getAttribute("style") ?? "", `«${cor}» chegou ao style`).not.toMatch(/background/);
      cleanup();
    }
  });

  it("o que chega ao `style` é reescrito a partir dos números, e não o texto que entrou", () => {
    expect(corSegura("  #5F7C66 ")).toBe("#5f7c66");
    expect(corSegura("#5f7c66\n")).toBe("#5f7c66");
    expect(corSegura("nada")).toBeNull();
    expect(corSegura(null)).toBeNull();
  });

  it("guarda a proporção da fotografia, e só uma proporção", () => {
    const { container } = render(<EsqueletoDeCor cor="#5f7c66" aspecto="4 / 3" />);
    expect(bloco(container).style.aspectRatio).toBe("4 / 3");
    cleanup();
    const cinzento = render(<EsqueletoDeCor aspecto="1.5" />);
    // O jsdom normaliza «1.5» para «1.5 / 1», que é o mesmo valor.
    expect(bloco(cinzento.container).style.aspectRatio).toMatch(/^1\.5( \/ 1)?$/);
    cleanup();
    const mau = render(<EsqueletoDeCor cor="#5f7c66" aspecto="4/3; color: red" />);
    expect(bloco(mau.container).style.aspectRatio).toBe("");
    expect(bloco(mau.container).style.color).toBe("");
  });

  it("vem do barril dos primitivos", () => {
    expect(DoBarril).toBe(EsqueletoDeCor);
  });
});

/**
 * O cinzento de recurso era tinta escura escrita à mão (`rgba(42, 38, 32,
 * 0.06)`) e no modo escuro não se via. Passou à escada da tinta, que troca de
 * canal com o modo; o valor antigo fica só como recurso para fora do back
 * office.
 */
describe("o cinzento do `.bo-skeleton`", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const regra = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    expect(i, `desapareceu a regra ${sel}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf("}", i));
  };

  it("vem da escada da tinta, no fundo e no brilho, para se ver também no escuro", () => {
    expect(regra(".bo-skeleton")).toMatch(/background:\s*var\(--bo-tinta-6,/);
    expect(regra(".bo-skeleton::after")).toMatch(/var\(--bo-tinta-6,/);
  });
});
