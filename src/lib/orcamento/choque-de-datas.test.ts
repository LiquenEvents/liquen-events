import { describe, it, expect } from "vitest";
import type { Quote, QuoteStatus } from "./types";
import { choquesDeData, gravidade } from "./choque-de-datas";

let n = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  n += 1;
  return {
    id: `LQ-${n}`,
    submittedAt: "2026-01-01T10:00:00.000Z",
    lastUpdated: "2026-01-01T10:00:00.000Z",
    status: "pendente" as QuoteStatus,
    name: `Casal ${n}`,
    email: `c${n}@exemplo.pt`,
    phone: "910000000",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: "2027-09-18",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 120,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    acceptTerms: true,
    acceptMarketing: false,
    ...over,
  } as Quote;
}

describe("o que ocupa um dia", () => {
  it("uma proposta enviada e um negócio ganho ocupam; um pedido novo não", () => {
    const alvo = pedido({ date: "2027-09-18" });
    const enviada = pedido({ date: "2027-09-18", status: "cotado" });
    const ganho = pedido({ date: "2027-09-18", status: "aceite" });
    const novo = pedido({ date: "2027-09-18", status: "pendente" });
    const perdido = pedido({ date: "2027-09-18", status: "rejeitado" });

    const c = choquesDeData(alvo, [alvo, enviada, ganho, novo, perdido]);
    expect(c.map((x) => x.outro.id).sort()).toEqual([enviada.id, ganho.id].sort());
  });

  it("um pedido arquivado deixa de ocupar", () => {
    const alvo = pedido();
    const arquivado = pedido({ status: "aceite", archived: true });
    expect(choquesDeData(alvo, [alvo, arquivado])).toHaveLength(0);
  });

  it("não avisa sobre si próprio", () => {
    const alvo = pedido({ status: "cotado" });
    expect(choquesDeData(alvo, [alvo])).toHaveLength(0);
  });

  it("sem data não há choque nenhum — não se pode chocar com um talvez", () => {
    const semData = pedido({ date: "" });
    const ocupado = pedido({ status: "aceite" });
    expect(choquesDeData(semData, [semData, ocupado])).toHaveLength(0);

    // E o outro lado: um evento marcado não choca com quem não tem data.
    const alvo = pedido();
    const outroSemData = pedido({ status: "aceite", date: "a definir" });
    expect(choquesDeData(alvo, [alvo, outroSemData])).toHaveLength(0);
  });
});

describe("os dias colados", () => {
  it("apanha a véspera e o dia seguinte, e diz qual é qual", () => {
    const alvo = pedido({ date: "2027-09-18" });
    const vespera = pedido({ date: "2027-09-17", status: "aceite" });
    const seguinte = pedido({ date: "2027-09-19", status: "cotado" });
    const longe = pedido({ date: "2027-09-25", status: "aceite" });

    const c = choquesDeData(alvo, [alvo, vespera, seguinte, longe]);
    expect(c).toHaveLength(2);
    expect(c.find((x) => x.outro.id === vespera.id)?.proximidade).toBe("vespera");
    expect(c.find((x) => x.outro.id === seguinte.id)?.proximidade).toBe("dia-seguinte");
  });

  it("um evento de vários dias ocupa todos os dias que atravessa", () => {
    const alvo = pedido({ date: "2027-09-18" });
    const longo = pedido({ date: "2027-09-16", endDate: "2027-09-20", status: "aceite" });
    const c = choquesDeData(alvo, [alvo, longo]);
    expect(c).toHaveLength(1);
    expect(c[0].proximidade).toBe("mesmo-dia");
  });

  it("atravessa a mudança de mês sem se perder", () => {
    const alvo = pedido({ date: "2027-10-01" });
    const vespera = pedido({ date: "2027-09-30", status: "aceite" });
    expect(choquesDeData(alvo, [alvo, vespera])[0]?.proximidade).toBe("vespera");
  });
});

describe("a distância entre os dois", () => {
  it("mede de local a local", () => {
    const alvo = pedido({ location: "Évora" });
    const outro = pedido({ location: "Palmela", status: "aceite" });
    const km = choquesDeData(alvo, [alvo, outro])[0].km!;
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(160);
  });

  it("quando um dos locais é desconhecido, a distância é null e não zero", () => {
    // Zero seria a mentira perfeita: lê-se como "é ali ao lado".
    const alvo = pedido({ location: "Portugal" });
    const outro = pedido({ location: "Évora", status: "aceite" });
    const c = choquesDeData(alvo, [alvo, outro])[0];
    expect(c.km).toBeNull();
  });

  it("marca como aproximada a distância medida sobre uma região", () => {
    const alvo = pedido({ location: "Alentejo" });
    const outro = pedido({ location: "Cascais", status: "aceite" });
    expect(choquesDeData(alvo, [alvo, outro])[0].aproximado).toBe(true);
  });
});

describe("ordem e gravidade", () => {
  it("o mesmo dia vem primeiro, e dentro do dia o mais longe", () => {
    const alvo = pedido({ location: "Évora" });
    const mesmoDiaPerto = pedido({ date: "2027-09-18", location: "Estremoz", status: "aceite" });
    const mesmoDiaLonge = pedido({ date: "2027-09-18", location: "Braga", status: "aceite" });
    const vespera = pedido({ date: "2027-09-17", location: "Lisboa", status: "aceite" });

    const c = choquesDeData(alvo, [alvo, vespera, mesmoDiaPerto, mesmoDiaLonge]);
    expect(c.map((x) => x.outro.id)).toEqual([mesmoDiaLonge.id, mesmoDiaPerto.id, vespera.id]);
  });

  it("dois no mesmo dia ao lado um do outro é aviso; longe é grave", () => {
    const alvo = pedido({ location: "Évora" });
    const perto = pedido({ date: "2027-09-18", location: "Arraiolos", status: "aceite" });
    const longe = pedido({ date: "2027-09-18", location: "Faro", status: "aceite" });

    const [g, a] = choquesDeData(alvo, [alvo, perto, longe]);
    expect(gravidade(g)).toBe("grave");
    expect(gravidade(a)).toBe("aviso");
  });

  it("distância desconhecida no mesmo dia trata-se como grave", () => {
    // É o caso que exige olhar: pode ser ao lado ou pode ser no Gerês.
    const alvo = pedido({ location: "Portugal" });
    const outro = pedido({ date: "2027-09-18", location: "Évora", status: "aceite" });
    expect(gravidade(choquesDeData(alvo, [alvo, outro])[0])).toBe("grave");
  });

  it("na véspera, até 150 km ainda é conciliável", () => {
    const alvo = pedido({ location: "Évora" });
    const outro = pedido({ date: "2027-09-17", location: "Lisboa", status: "aceite" });
    expect(gravidade(choquesDeData(alvo, [alvo, outro])[0])).toBe("aviso");
  });
});
