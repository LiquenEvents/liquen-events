import { describe, expect, it } from "vitest";
import { textosDoEmailDaProposta } from "./email-proposta-textos";

describe("o email da proposta fala do evento certo", () => {
  it("num casamento, «o vosso dia» — como sempre", () => {
    expect(textosDoEmailDaProposta("pt").intro).toContain("o vosso dia");
    expect(textosDoEmailDaProposta("pt", true).introEmTexto).toContain("o vosso dia");
  });
  it("fora dele, «o vosso evento»", () => {
    const t = textosDoEmailDaProposta("pt", false);
    expect(t.intro).toContain("o vosso evento");
    expect(t.intro).not.toContain("vosso dia");
    expect(t.introEmTexto).toContain("o vosso evento");
  });
  it("em inglês, «your event» nos dois casos", () => {
    expect(textosDoEmailDaProposta("en", true).intro).toContain("your event");
    expect(textosDoEmailDaProposta("en", false).intro).toContain("your event");
  });
});
