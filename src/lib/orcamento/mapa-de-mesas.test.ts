import { describe, expect, it } from "vitest";
import type { Guest } from "./types";
import {
  acrescentarLugares,
  apagarMesa,
  cadeiras,
  chaveDoLugar,
  contas,
  dimensoes,
  gruposPartidos,
  iniciais,
  levantar,
  mapaVazio,
  mudarMesa,
  nomeDoLugar,
  nomearLugar,
  novaMesa,
  novoElemento,
  ondeEsta,
  porSentar,
  reconciliar,
  sentar,
  sentarAutomaticamente,
  sentarGrupo,
  sentarResto,
  TECTOS,
  type MapaDeMesas,
} from "./mapa-de-mesas";

const g = (id: string, name: string, party = 1, rsvp: Guest["rsvp"] = "confirmado"): Guest => ({
  id,
  name,
  party,
  rsvp,
});

function comMesas(...formas: [string, "redonda" | "comprida" | "quadrada", number][]): MapaDeMesas {
  let m = mapaVazio();
  for (const [id, forma, lugares] of formas) {
    m = novaMesa(m, forma, id).mapa;
    m = mudarMesa(m, id, { lugares });
  }
  return m;
}

describe("as cadeiras de cada forma", () => {
  it("uma por lugar, à volta da mesa e fora dela", () => {
    for (const forma of ["redonda", "comprida", "quadrada"] as const) {
      for (const lugares of [1, 6, 8, 13]) {
        const mesa = { id: "m", nome: "M", forma, x: 500, y: 500, lugares };
        const cs = cadeiras(mesa);
        expect(cs).toHaveLength(lugares);
        const { largura, altura } = dimensoes(mesa);
        for (const c of cs) {
          // A redonda é um círculo: conta a distância ao centro, não a caixa.
          const dentro =
            forma === "redonda"
              ? Math.hypot(c.x - 500, c.y - 500) < largura / 2
              : Math.abs(c.x - 500) < largura / 2 && Math.abs(c.y - 500) < altura / 2;
          expect(dentro).toBe(false);
        }
      }
    }
  });

  it("a comprida cresce com os lugares e roda", () => {
    const curta = dimensoes({ forma: "comprida", lugares: 6 });
    const longa = dimensoes({ forma: "comprida", lugares: 20 });
    expect(longa.largura).toBeGreaterThan(curta.largura);
    const rodada = dimensoes({ forma: "comprida", lugares: 20, rodada: true });
    expect(rodada).toEqual({ largura: longa.altura, altura: longa.largura });
  });
});

describe("as pessoas e os nomes", () => {
  it("um grupo de 7 tem 7 lugares, os recusados não entram", () => {
    const lista = [g("a", "Família Silva", 7), g("b", "Rui", 1, "recusado"), g("c", "Ana")];
    expect(porSentar(mapaVazio(), lista)).toHaveLength(8);
  });

  it("o lugar mostra o nome escrito, senão o do grupo com o número", () => {
    const lista = [g("a", "Família Silva", 4), g("c", "Ana Lopes")];
    expect(nomeDoLugar({ convidadoId: "a", n: 2 }, lista)).toBe("Família Silva 2/4");
    expect(nomeDoLugar({ convidadoId: "a", n: 2, nome: "Tomás" }, lista)).toBe("Tomás");
    expect(nomeDoLugar({ convidadoId: "c", n: 1 }, lista)).toBe("Ana Lopes");
  });

  it("as iniciais saltam «Família» e as partículas", () => {
    expect(iniciais("Família Silva")).toBe("SI");
    expect(iniciais("Maria do Carmo Teixeira")).toBe("MT");
    expect(iniciais("Joaquim")).toBe("JO");
    expect(iniciais("Família Silva 3/4")).toBe("SI");
  });
});

describe("sentar", () => {
  const lista = [g("a", "Silva", 3), g("b", "Ana"), g("c", "Rui")];

  it("mover de lugar, e trocar com quem lá está", () => {
    let m = comMesas(["m1", "redonda", 4]);
    m = sentar(m, chaveDoLugar("m1", 0), { convidadoId: "b", n: 1 });
    m = sentar(m, chaveDoLugar("m1", 1), { convidadoId: "c", n: 1 });
    m = sentar(m, chaveDoLugar("m1", 1), { convidadoId: "b", n: 1 });
    expect(m.lugares[chaveDoLugar("m1", 1)].convidadoId).toBe("b");
    expect(m.lugares[chaveDoLugar("m1", 0)].convidadoId).toBe("c");
  });

  it("da lista de espera para um lugar ocupado: quem lá estava fica por sentar", () => {
    let m = comMesas(["m1", "redonda", 2]);
    m = sentar(m, chaveDoLugar("m1", 0), { convidadoId: "b", n: 1 });
    m = sentar(m, chaveDoLugar("m1", 0), { convidadoId: "c", n: 1 });
    expect(ondeEsta(m, { convidadoId: "b", n: 1 })).toBeNull();
    expect(porSentar(m, lista).map((p) => p.convidadoId)).toContain("b");
  });

  it("o grupo senta-se junto, a partir do lugar tocado", () => {
    const m = comMesas(["m1", "redonda", 8]);
    const r = sentarGrupo(m, lista, "a", "m1", 5);
    expect(r.ficaram).toBe(0);
    expect(Object.keys(r.mapa.lugares).sort()).toEqual(["m1:5", "m1:6", "m1:7"]);
  });

  it("um grupo de 7 numa mesa de 6: acrescentar lugares, ou o resto na mais próxima", () => {
    const grande = [g("f", "Família Costa", 7)];
    let m = comMesas(["m1", "redonda", 6], ["m2", "redonda", 8]);
    const r = sentarGrupo(m, grande, "f", "m1");
    expect(r.ficaram).toBe(1);

    const mais = acrescentarLugares(r.mapa, "m1", r.ficaram);
    expect(mais.acrescentados).toBe(1);
    expect(sentarGrupo(mais.mapa, grande, "f", "m1").ficaram).toBe(0);

    m = sentarResto(r.mapa, grande, "f", "m1").mapa;
    expect(porSentar(m, grande)).toHaveLength(0);
    expect(gruposPartidos(m)).toEqual(["f"]);
  });

  it("o nome de uma pessoa do grupo fica no lugar dela", () => {
    let m = sentarGrupo(comMesas(["m1", "redonda", 8]), lista, "a", "m1").mapa;
    m = nomearLugar(m, "m1:1", "  Tomás  ");
    expect(nomeDoLugar(m.lugares["m1:1"], lista)).toBe("Tomás");
    m = nomearLugar(m, "m1:1", "");
    expect(nomeDoLugar(m.lugares["m1:1"], lista)).toBe("Silva 2/3");
  });
});

describe("a lista de convidados muda e o mapa acompanha", () => {
  it("apagado, recusado e grupo que encolheu libertam os lugares; o que cresceu fica por sentar", () => {
    let lista = [g("a", "Silva", 4), g("b", "Ana"), g("c", "Rui")];
    let m = comMesas(["m1", "redonda", 10]);
    for (const id of ["a", "b", "c"]) m = sentarGrupo(m, lista, id, "m1").mapa;
    expect(Object.keys(m.lugares)).toHaveLength(6);

    lista = [g("a", "Silva", 2), g("b", "Ana", 1, "recusado")];
    const r = reconciliar(m, lista);
    expect(Object.keys(r.lugares)).toHaveLength(2);

    lista = [g("a", "Silva", 5)];
    expect(porSentar(reconciliar(m, lista), lista)).toHaveLength(1);
  });

  it("nada a mudar devolve o mesmo objecto (não se grava à toa)", () => {
    const lista = [g("b", "Ana")];
    const m = sentarGrupo(comMesas(["m1", "redonda", 4]), lista, "b", "m1").mapa;
    expect(reconciliar(m, lista)).toBe(m);
  });

  it("menos lugares na mesa: quem fica de fora volta à lista de espera", () => {
    const lista = [g("a", "Silva", 6)];
    let m = sentarGrupo(comMesas(["m1", "redonda", 8]), lista, "a", "m1").mapa;
    m = mudarMesa(m, "m1", { lugares: 4 });
    expect(porSentar(m, lista)).toHaveLength(2);
    m = apagarMesa(m, "m1");
    expect(porSentar(m, lista)).toHaveLength(6);
  });
});

describe("sentar automaticamente", () => {
  it("cada grupo na mesa onde cabe inteiro, com menos folga; não mexe em quem já está", () => {
    const lista = [
      g("a", "Silva", 6),
      g("b", "Costa", 4),
      g("c", "Ana"),
      g("d", "Rui", 1, "pendente"),
    ];
    let m = comMesas(["m1", "redonda", 6], ["m2", "redonda", 8]);
    m = sentar(m, "m2:7", { convidadoId: "c", n: 1 });
    const r = sentarAutomaticamente(m, lista);
    expect(r.sentados).toBe(11);
    expect(porSentar(r.mapa, lista)).toHaveLength(0);
    expect(gruposPartidos(r.mapa)).toEqual([]);
    expect(r.mapa.lugares["m2:7"].convidadoId).toBe("c");
    // O grupo de 6 foi para a mesa de 6, onde cabe certinho.
    const mesaDoSilva = Object.entries(r.mapa.lugares).find(([, o]) => o.convidadoId === "a")![0];
    expect(mesaDoSilva.startsWith("m1:")).toBe(true);
  });

  it("só parte um grupo quando nenhuma mesa o leva inteiro", () => {
    const lista = [g("a", "Silva", 10)];
    const r = sentarAutomaticamente(comMesas(["m1", "redonda", 6], ["m2", "redonda", 6]), lista);
    expect(r.sentados).toBe(10);
    expect(gruposPartidos(r.mapa)).toEqual(["a"]);
  });
});

describe("mesas, elementos e contas", () => {
  it("uma mesa nova não nasce em cima de outra, e o nome segue a numeração", () => {
    let m = mapaVazio();
    m = novaMesa(m, "redonda", "a").mapa;
    m = novaMesa(m, "redonda", "b").mapa;
    const [a, b] = m.mesas;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(dimensoes(a).largura);
    expect(m.mesas.map((x) => x.nome)).toEqual(["Mesa 1", "Mesa 2"]);
    m = novoElemento(m, "pista", "p").mapa;
    expect(m.elementos[0].nome).toBe("Pista de dança");
  });

  it("os tectos", () => {
    let m = comMesas(["m1", "redonda", 8]);
    m = mudarMesa(m, "m1", { lugares: 999 });
    expect(m.mesas[0].lugares).toBe(TECTOS.lugaresPorMesa);
    m = mudarMesa(m, "m1", { lugares: 0 });
    expect(m.mesas[0].lugares).toBe(1);
  });

  it("sentados de quantos, e os lugares livres", () => {
    const lista = [g("a", "Silva", 4), g("b", "Ana", 1, "recusado")];
    let m = comMesas(["m1", "redonda", 8]);
    m = sentarGrupo(m, lista, "a", "m1").mapa;
    m = levantar(m, "m1:0");
    expect(contas(m, lista)).toEqual({ sentados: 3, total: 4, lugares: 8, livres: 5 });
  });
});
