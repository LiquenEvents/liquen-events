// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));

import PortalView from "./PortalView";
import { pt } from "@/lib/i18n/pt";
import { en } from "@/lib/i18n/en";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «OLÁ, .» EM LETRA DE 52 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Com o nome do cliente vazio (a mesma linha antiga em que `client_name` ficou
 * a `null` e o `fromRow` traduz isso para `""` — ou uma cópia de segurança
 * repondo um pedido sem nome, ver `backup-restore.ts`), o portal escrevia o
 * cumprimento com um espaço e um ponto: "Olá, .". A página da proposta já teve
 * exatamente esta avaria (ver o comentário no componente `Message` de
 * `proposta/[token]/page.tsx`) e a correção é a mesma: sem nome, cumprimenta-se
 * na mesma — "Olá." — que é uma frase inteira e não denuncia nada.
 */

const props = (over: Partial<Parameters<typeof PortalView>[0]> = {}) => ({
  t: pt.portal,
  lang: "pt-PT",
  clientName: "Ana Dias",
  eventLabel: "Casamento",
  eventDate: "12 de setembro de 2026",
  location: "Herdade da Malhadinha",
  proposal: null,
  pdfHref: null,
  contract: null,
  contratoPdfHref: null,
  schedule: null,
  depositPercent: 30,
  currency: "EUR",
  ...over,
});

afterEach(cleanup);

describe("PortalView — a saudação com nome vazio", () => {
  it("com nome, cumprimenta como sempre: «Olá, Ana.»", () => {
    render(<PortalView {...props({ clientName: "Ana Dias" })} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Ana.");
  });

  it("com o nome VAZIO, cumprimenta sem vírgula nem ponto pendurados: «Olá.», nunca «Olá, .»", () => {
    render(<PortalView {...props({ clientName: "" })} />);
    const titulo = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    expect(titulo).toBe("Olá.");
    expect(titulo).not.toContain(", .");
    expect(titulo).not.toMatch(/,\s*\./);
  });

  it("com o nome só de espaços, o mesmo: «Olá.»", () => {
    render(<PortalView {...props({ clientName: "   " })} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá.");
  });

  it("em inglês, o mesmo defeito não aparece: «Hello.», nunca «Hello, .»", () => {
    render(<PortalView {...props({ t: en.portal, lang: "en", clientName: "" })} />);
    const titulo = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    expect(titulo).toBe("Hello.");
    expect(titulo).not.toContain(", .");
  });

  it("usa só o PRIMEIRO nome, como sempre", () => {
    render(<PortalView {...props({ clientName: "Francisco Maria Carrelhas Das Neves" })} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Francisco.");
  });
});
