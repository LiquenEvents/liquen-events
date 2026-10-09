// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Loading from "./loading";

/**
 * Auditoria externa, C4: o ecrã de espera ocupava lugar a partir do topo e as
 * páginas sem fotografia de topo começam 96 px mais abaixo — quando ele chegava
 * a ser pintado, a página saltava ao chegar. Agora fica fixo, por cima.
 */
describe("ecrã de espera do sítio (C4)", () => {
  it("fica fixo por cima e não ocupa lugar na página", () => {
    const { container } = render(<Loading />);
    const ecra = container.firstElementChild as HTMLElement;
    expect(ecra.className).toContain("ecra-de-espera");
    expect(ecra.className).toContain("fixed");
    expect(ecra.className).toContain("inset-0");
    expect(ecra.className).not.toContain("-mt-24");
    expect(ecra.className).not.toContain("min-h-");
  });
});
