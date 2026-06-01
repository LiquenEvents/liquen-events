import { describe, it, expect } from "vitest";
import { checklistTemplate } from "./checklist-templates";

describe("checklistTemplate", () => {
  it("returns only the common baseline when no category is given", () => {
    const list = checklistTemplate(null);
    expect(list).toHaveLength(11);
    expect(list[0]).toBe("Confirmar data e local");
    expect(list[list.length - 1]).toBe("Follow-up pós-evento");
  });

  it("inserts the particulares block after the opening common items", () => {
    const list = checklistTemplate("particulares");
    expect(list).toHaveLength(18);
    expect(list.slice(0, 6)).toEqual([
      "Confirmar data e local",
      "Reunião de briefing com o cliente",
      "Enviar proposta",
      "Receber sinal",
      "Contratar fornecedores",
      "Plano de produção / cronograma",
    ]);
    expect(list[6]).toBe("Decoração floral");
    expect(list).toContain("Plano de mesas");
  });

  it("uses the empresas block for corporate events", () => {
    const list = checklistTemplate("empresas");
    expect(list).toHaveLength(17);
    expect(list).toContain("Audiovisual e som");
    expect(list).not.toContain("Decoração floral");
  });

  it("always keeps the closing common items at the end", () => {
    const list = checklistTemplate("empresas");
    expect(list.slice(-5)).toEqual([
      "Visita técnica ao espaço",
      "Confirmar número final de convidados",
      "Coordenação no dia do evento",
      "Faturação e saldo final",
      "Follow-up pós-evento",
    ]);
  });
});
