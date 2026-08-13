import { describe, it, expect } from "vitest";
import { jaExiste, mapper, normalizar, type ServicoCatalogo } from "./servicos-catalogo-store";

const servico = (nome: string, over: Partial<ServicoCatalogo> = {}): ServicoCatalogo => ({
  id: nome,
  nome,
  descricao: "",
  nomeEn: "",
  descricaoEn: "",
  categoria: "Outros",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("não deixar entrar o mesmo serviço duas vezes", () => {
  it("reconhece a mesma coisa escrita de outra maneira", () => {
    // É exactamente a desarrumação que a biblioteca existe para resolver: se
    // ela deixasse entrar "Decoração da Cerimónia" ao lado de "decoracao
    // cerimonia", a biblioteca passava a ser mais uma lista por arrumar.
    const existentes = [servico("Decoração da Cerimónia")];
    expect(jaExiste("decoracao cerimonia", existentes)?.nome).toBe("Decoração da Cerimónia");
    expect(jaExiste("  DECORAÇÃO DA CERIMÓNIA!  ", existentes)).not.toBeNull();
  });

  it("serviços diferentes entram os dois", () => {
    const existentes = [servico("Arranjos de mesa")];
    expect(jaExiste("Arco floral", existentes)).toBeNull();
  });

  it("um nome vazio não conta como repetido", () => {
    expect(jaExiste("   ", [servico("Flores")])).toBeNull();
  });

  it("a ordem das palavras NÃO os junta", () => {
    // Ao contrário da memória de preços, aqui a ordem importa: "Mesa dos doces"
    // e "Doces da mesa" são dois nomes que ela pode querer distinguir na
    // biblioteca, e juntá-los apagava um deles.
    expect(normalizar("Mesa dos doces")).not.toBe(normalizar("Doces da mesa"));
  });
});

describe("a viagem até à base de dados e de volta", () => {
  it("não perde nada pelo caminho", () => {
    const s = servico("Arco floral", {
      descricao: "Arco em madeira com flores de época.",
      nomeEn: "Floral arch",
      descricaoEn: "Wooden arch with seasonal flowers.",
      categoria: "Flores",
      arquivado: true,
    });
    expect(mapper.fromRow(mapper.toRow(s) as never)).toEqual(s);
  });

  it("uma linha antiga, sem os campos ingleses, lê-se como vazia e não como undefined", () => {
    const lido = mapper.fromRow({ id: "x", name: "Flores" } as never);
    expect(lido.nomeEn).toBe("");
    expect(lido.descricaoEn).toBe("");
    expect(lido.categoria).toBe("Outros");
    expect(lido.arquivado).toBe(false);
  });
});
