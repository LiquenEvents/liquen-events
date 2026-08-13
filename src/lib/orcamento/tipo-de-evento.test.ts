import { describe, it, expect } from "vitest";
import {
  EVENT_TYPE_NAMES,
  QUOTE_EVENT_OPTIONS,
  eventTagLabel,
  eventTypeName,
  isQuoteOptionLabel,
} from "./data";
import type { EventType } from "./types";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O RÓTULO DE LISTA E O NOME QUE ENTRA NUMA FRASE SÃO COISAS DIFERENTES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Três defeitos de correio verdadeiro tinham a mesma raiz: os rótulos das
 * opções («Casamentos», «Batizado / Comunhão», «Outro») eram usados como se
 * fossem o nome do evento. Isto é o sítio onde os dois se separam — e é por
 * isso que estes testes vivem ao lado da taxonomia, e não ao lado de cada uma
 * das cinco frases que a liam.
 */
describe("eventTypeName — o nome do tipo, na língua de quem lê", () => {
  it("dá o singular, sem barras, nas duas línguas", () => {
    expect(eventTypeName("casamentos")).toBe("Casamento");
    expect(eventTypeName("casamentos", "en")).toBe("Wedding");
    // O rótulo da lista é «Batizado / Comunhão»; o NOME não tem barra nenhuma.
    expect(eventTypeName("batizados")).toBe("Batizado");
    expect(eventTypeName("batizados", "en")).toBe("Christening");
    expect(eventTypeName("conferencias", "en")).toBe("Conference");
  });

  it("nenhum nome traz o plural nem a barra do rótulo de lista", () => {
    for (const nome of Object.values(EVENT_TYPE_NAMES)) {
      expect(nome.pt).not.toContain("/");
      expect(nome.en).not.toContain("/");
    }
  });

  it("sem tipo — o «Outro» do formulário — devolve vazio, e não uma palavra", () => {
    // Vazio é o que faz a linha não se escrever. Uma palavra inventada aqui
    // era «para o outro de 15 de maio» outra vez.
    expect(eventTypeName(null)).toBe("");
    expect(eventTypeName(undefined)).toBe("");
    expect(eventTypeName("")).toBe("");
    expect(eventTypeName("inventado")).toBe("");
  });

  it("cobre todos os tipos da taxonomia — nenhum fica sem nome", () => {
    const daLista = QUOTE_EVENT_OPTIONS.map((o) => o.eventType).filter(Boolean) as EventType[];
    for (const tipo of daLista) {
      expect(eventTypeName(tipo)).not.toBe("");
      expect(eventTypeName(tipo, "en")).not.toBe("");
    }
  });
});

describe("isQuoteOptionLabel — um rótulo de lista guardado onde devia estar um nome", () => {
  it("reconhece os seis rótulos do formulário", () => {
    for (const o of QUOTE_EVENT_OPTIONS) expect(isQuoteOptionLabel(o.label)).toBe(true);
  });

  it("reconhece também os baldes da taxonomia, que vêm no plural", () => {
    expect(isQuoteOptionLabel("Casamentos")).toBe(true);
    expect(isQuoteOptionLabel("Batizados & Comunhões")).toBe(true);
  });

  it("não se importa com a caixa, com os acentos nem com o espaço a mais", () => {
    expect(isQuoteOptionLabel("  batizado / comunhao ")).toBe(true);
    expect(isQuoteOptionLabel("OUTRO")).toBe(true);
  });

  it("um nome verdadeiro passa incólume", () => {
    expect(isQuoteOptionLabel("Casamento da Ana e do João")).toBe(false);
    expect(isQuoteOptionLabel("")).toBe(false);
    expect(isQuoteOptionLabel(null)).toBe(false);
  });
});

describe("eventTagLabel — a etiqueta que se mostra", () => {
  it("prefere a palavra do próprio cliente", () => {
    expect(
      eventTagLabel({ eventName: "Casamento da Ana e do João", eventType: "casamentos" }),
    ).toBe("Casamento da Ana e do João");
  });

  it("mas não quando essa «palavra» é o rótulo da lista", () => {
    // É o que a base de dados tem de trás: o formulário público gravava lá o
    // rótulo canónico português, mesmo nos pedidos feitos em inglês.
    expect(eventTagLabel({ eventName: "Casamento", eventType: "casamentos" }, "en")).toBe(
      "Wedding",
    );
    expect(eventTagLabel({ eventName: "Batizado / Comunhão", eventType: "batizados" })).toBe(
      "Batizado",
    );
  });

  it("sem nome e sem tipo («Outro»), não há etiqueta nenhuma a mostrar", () => {
    expect(eventTagLabel({ eventName: "Outro", eventType: null })).toBe("");
    expect(eventTagLabel({}, "en")).toBe("");
  });
});
