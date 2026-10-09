import { describe, it, expect } from "vitest";
import { getDictionary } from "@/lib/i18n";

/**
 * Auditoria externa, C2: /servicos e /en/servicos tinham o mesmo título que a
 * página inicial. O molde do layout de raiz (`%s | Líquen Events`) acrescenta
 * a marca, por isso o dicionário guarda só a primeira metade.
 */
describe("título de /servicos (C2)", () => {
  it.each([
    ["pt", "Serviços de Decoração e Produção de Eventos | Líquen Events"],
    ["en", "Event Decoration & Production Services | Líquen Events"],
  ] as const)("%s", (locale, esperado) => {
    const t = getDictionary(locale);
    expect(`${t.meta.servicosTitle} | Líquen Events`).toBe(esperado);
    expect(`${t.meta.servicosTitle} | Líquen Events`).not.toBe(t.meta.homeTitle);
  });
});
