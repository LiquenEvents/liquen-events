import { describe, it, expect } from "vitest";
import {
  EVORA,
  distanciaKm,
  kmDeEvora,
  kmPorEstrada,
  localizar,
  lugaresConhecidos,
} from "./portugal";

/**
 * A tabela é aproximada de propósito (ver o cabeçalho do módulo). O que estes
 * testes prendem não é a precisão ao quilómetro — é que o número esteja na
 * ordem de grandeza certa, e sobretudo que o módulo prefira NÃO responder a
 * responder mal.
 */

describe("reconhecer o que está escrito no campo do local", () => {
  it("lê o nome da terra, com ou sem acentos e maiúsculas", () => {
    expect(localizar("Évora")?.lugar.nome).toBe("Évora");
    expect(localizar("evora")?.lugar.nome).toBe("Évora");
    expect(localizar("  ÉVORA  ")?.lugar.nome).toBe("Évora");
  });

  it("encontra a terra dentro de uma morada escrita à mão", () => {
    expect(localizar("Quinta do Sobral, Palmela")?.lugar.nome).toBe("Palmela");
    expect(localizar("Herdade da Barrosinha - Alcácer do Sal")?.lugar.nome).toBe("Alcácer do Sal");
  });

  it("o nome mais longo ganha, para não confundir terras parecidas", () => {
    // "Vila Nova de Milfontes" contém "Vila Nova de Gaia"? Não — mas contém
    // palavras que, num emparelhamento ingénuo, dariam a terra errada.
    expect(localizar("Vila Nova de Milfontes")?.lugar.nome).toBe("Vila Nova de Milfontes");
    expect(localizar("Castelo de Vide")?.lugar.nome).toBe("Castelo de Vide");
  });

  it("uma região inteira resolve-se, mas assumidamente como aproximada", () => {
    const alentejo = localizar("Alentejo");
    expect(alentejo?.lugar.nome).toBe("Évora");
    expect(alentejo?.aproximado).toBe(true);

    // Uma terra concreta não é aproximada.
    expect(localizar("Estremoz")?.aproximado).toBe(false);
  });

  it('"Portugal" não é uma morada — e não se inventa uma', () => {
    // É o sinal de destination wedding, não um sítio. Devolver Évora aqui
    // faria a proposta cobrar zero de deslocação para um evento que pode ser
    // no Gerês.
    expect(localizar("Portugal")).toBeNull();
    expect(kmDeEvora("Portugal")).toBeNull();
  });

  it("o que não se conhece devolve null em vez de um palpite", () => {
    expect(localizar("Quinta sem nome conhecido")).toBeNull();
    expect(localizar("")).toBeNull();
    expect(localizar(null)).toBeNull();
    expect(localizar(undefined)).toBeNull();
  });
});

describe("distâncias", () => {
  it("de Évora a si própria é zero", () => {
    expect(distanciaKm(EVORA, EVORA)).toBe(0);
    expect(kmDeEvora("Évora")).toBe(0);
  });

  it("dá a ordem de grandeza certa nas viagens que ela faz mesmo", () => {
    // Évora–Lisboa são ~130 km de auto-estrada; Évora–Porto ~400; Évora–Faro
    // ~220. A margem larga é deliberada: o que se testa é que o número serve
    // para decidir, não que acerta no marco quilométrico.
    expect(kmDeEvora("Lisboa")).toBeGreaterThan(100);
    expect(kmDeEvora("Lisboa")).toBeLessThan(160);

    expect(kmDeEvora("Porto")).toBeGreaterThan(330);
    expect(kmDeEvora("Porto")).toBeLessThan(450);

    expect(kmDeEvora("Faro")).toBeGreaterThan(170);
    expect(kmDeEvora("Faro")).toBeLessThan(260);
  });

  it("arredonda aos 5 km, para não fingir uma exatidão que não tem", () => {
    for (const sitio of ["Lisboa", "Palmela", "Estremoz", "Comporta"]) {
      expect(kmDeEvora(sitio)! % 5).toBe(0);
    }
  });

  it("não há estrada para as ilhas", () => {
    const funchal = localizar("Funchal")!.lugar;
    const evora = localizar("Évora")!.lugar;
    expect(kmPorEstrada(evora, funchal)).toBeNull();
    expect(kmDeEvora("Funchal")).toBeNull();

    // Entre arquipélagos também não.
    const acores = localizar("Ponta Delgada")!.lugar;
    expect(kmPorEstrada(funchal, acores)).toBeNull();

    // Mas a distância em linha reta continua a existir — é um facto, mesmo
    // que não seja de carro.
    expect(distanciaKm(evora, funchal)).toBeGreaterThan(800);
  });

  it("a distância é simétrica", () => {
    const a = localizar("Braga")!.lugar;
    const b = localizar("Faro")!.lugar;
    expect(kmPorEstrada(a, b)).toBe(kmPorEstrada(b, a));
  });
});

describe("a tabela em si", () => {
  it("todas as chaves estão normalizadas (é assim que se procura nelas)", () => {
    for (const k of lugaresConhecidos()) {
      expect(k).toBe(k.toLowerCase());
      expect(k.normalize("NFD")).toBe(k); // sem acentos compostos
    }
  });

  it("toda a chave da tabela é alcançável por quem escreve o nome", () => {
    // Um `continue` para as que não resolvem tapava exactamente o defeito que
    // isto tem de apanhar: uma chave escrita de forma que a normalização nunca
    // produz (com underscore, por exemplo) fica na tabela sem nunca ser lida.
    for (const k of lugaresConhecidos()) {
      expect(localizar(k), `a chave "${k}" não é alcançável`).not.toBeNull();
    }
  });

  it("as coordenadas caem dentro de Portugal", () => {
    for (const k of lugaresConhecidos()) {
      const l = localizar(k)!;
      expect(l.lugar.lat).toBeGreaterThan(30);
      expect(l.lugar.lat).toBeLessThan(43);
      expect(l.lugar.lon).toBeGreaterThan(-32);
      expect(l.lugar.lon).toBeLessThan(-6);
    }
  });
});
