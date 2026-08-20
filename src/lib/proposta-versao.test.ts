import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NUNCA_VISTO_PELO_CASAL,
  canonizar,
  estadoDaVersao,
  proximaVersao,
  seloDoConteudo,
  type ConteudoSelavel,
} from "./proposta-versao";

/**
 * O selo de versão de uma proposta. Ver o cabeçalho de `proposta-versao.ts`:
 * a pergunta a que ele responde é «este documento é o mesmo que o casal viu?»,
 * e a resposta tem de ser estável (gravar sem mexer não é uma versão nova) e
 * sensível (mexer no que o casal lê é uma versão nova).
 */

const base: ConteudoSelavel = {
  doc: {
    ref: "PO Decoração Casamento Maria & Zé",
    clientNames: "Maria & Zé",
    serviceGroups: [{ id: "g1", title: "Cerimónia", items: [{ id: "i1", text: "Arco floral" }] }],
  },
  total: 24_600,
  subtotal: 20_000,
  vat: 4_600,
  currency: "EUR",
  idioma: "pt",
};

describe("o selo é estável", () => {
  it("a mesma proposta gravada duas vezes dá o mesmo selo", () => {
    expect(seloDoConteudo(base)).toBe(seloDoConteudo(structuredClone(base)));
  });

  it("a ordem por que as chaves foram escritas não conta", () => {
    const trocado: ConteudoSelavel = {
      idioma: "pt",
      currency: "EUR",
      vat: 4_600,
      subtotal: 20_000,
      total: 24_600,
      doc: {
        serviceGroups: [
          { items: [{ text: "Arco floral", id: "i1" }], title: "Cerimónia", id: "g1" },
        ],
        clientNames: "Maria & Zé",
        ref: "PO Decoração Casamento Maria & Zé",
      },
    };
    expect(seloDoConteudo(trocado)).toBe(seloDoConteudo(base));
  });

  it("uma proposta sem língua gravada é portuguesa — e sela como tal", () => {
    const semLingua: ConteudoSelavel = { ...base };
    delete semLingua.idioma;
    expect(seloDoConteudo(semLingua)).toBe(seloDoConteudo(base));
  });

  it("um campo ausente e um campo a `undefined` são o mesmo documento", () => {
    const comUndefined = { ...base, doc: { ...(base.doc as object), headerTitle: undefined } };
    expect(seloDoConteudo(comUndefined)).toBe(seloDoConteudo(base));
  });

  it("a ordem das LISTAS conta — num documento a ordem é conteúdo", () => {
    const doisGrupos = {
      ...base,
      doc: {
        ...(base.doc as Record<string, unknown>),
        serviceGroups: [{ id: "a" }, { id: "b" }],
      },
    };
    const trocados = {
      ...base,
      doc: {
        ...(base.doc as Record<string, unknown>),
        serviceGroups: [{ id: "b" }, { id: "a" }],
      },
    };
    expect(seloDoConteudo(trocados)).not.toBe(seloDoConteudo(doisGrupos));
  });
});

describe("o selo é sensível ao que o casal lê", () => {
  const mudou = (mudanca: Partial<ConteudoSelavel>) =>
    seloDoConteudo({ ...base, ...mudanca }) !== seloDoConteudo(base);

  it("o total", () => expect(mudou({ total: 25_000 })).toBe(true));
  it("o subtotal", () => expect(mudou({ subtotal: 20_001 })).toBe(true));
  it("a moeda", () => expect(mudou({ currency: "GBP" })).toBe(true));
  it("a língua", () => expect(mudou({ idioma: "en" })).toBe(true));
  it("as notas visíveis", () => expect(mudou({ notes: "com transporte" })).toBe(true));

  it("um serviço do documento", () => {
    const comOutroServico = {
      ...base,
      doc: {
        ...(base.doc as Record<string, unknown>),
        serviceGroups: [
          { id: "g1", title: "Cerimónia", items: [{ id: "i1", text: "Arco de eucalipto" }] },
        ],
      },
    };
    expect(seloDoConteudo(comOutroServico)).not.toBe(seloDoConteudo(base));
  });

  /**
   * A correcção que dá razão a este ficheiro: o `headerTitle` está no
   * `NUNCA_NO_PDF` (o gerador não o desenha) e a PÁGINA desenha-o. Se ele
   * ficasse de fora do selo, o título da proposta podia mudar por baixo de um
   * aceite sem nada o dizer.
   */
  it("o título de cabeçalho — que o PDF não desenha e a página desenha", () => {
    const comOutroTitulo = {
      ...base,
      doc: { ...(base.doc as Record<string, unknown>), headerTitle: "Proposta revista" },
    };
    expect(seloDoConteudo(comOutroTitulo)).not.toBe(seloDoConteudo(base));
  });
});

describe("o selo ignora o que é só dela", () => {
  it("a nota interna não é uma versão nova", () => {
    const comNota = {
      ...base,
      doc: { ...(base.doc as Record<string, unknown>), notasInternas: "ligar à florista" },
    };
    expect(seloDoConteudo(comNota)).toBe(seloDoConteudo(base));
  });

  it("os preços por linha não são uma versão nova — o TOTAL é que é selado", () => {
    const comAmounts = {
      ...base,
      doc: { ...(base.doc as Record<string, unknown>), budgetAmounts: [1000, 2000] },
    };
    expect(seloDoConteudo(comAmounts)).toBe(seloDoConteudo(base));
    // …e mexer no total, esse, muda o selo (controlo positivo do par acima).
    expect(seloDoConteudo({ ...comAmounts, total: 25_000 })).not.toBe(seloDoConteudo(base));
  });

  it("a lista de campos escondidos não está vazia (controlo positivo)", () => {
    expect(NUNCA_VISTO_PELO_CASAL.length).toBeGreaterThan(3);
    expect(NUNCA_VISTO_PELO_CASAL).toContain("notasInternas");
    expect(NUNCA_VISTO_PELO_CASAL).not.toContain("headerTitle");
  });
});

/**
 * ── AS DUAS LISTAS NÃO PODEM VOLTAR A DIVERGIR EM SILÊNCIO ────────────────
 *
 * A página do casal é uma SEGUNDA superfície: um campo que o PDF não desenha
 * pode ser desenhado ali. Este teste lê o `Documento.tsx` e recusa qualquer
 * campo excluído do selo que lá apareça.
 */
describe("nada do que é escondido é desenhado na página do casal", () => {
  const documento = readFileSync(
    path.join(process.cwd(), "src/app/[lang]/(privado)/proposta/[token]/Documento.tsx"),
    "utf8",
  );

  it("o ficheiro foi mesmo lido (controlo positivo)", () => {
    expect(documento.length).toBeGreaterThan(5_000);
    // Se este par deixar de aparecer, o teste abaixo passa a ser vacuoso.
    expect(documento).toContain("doc.headerTitle");
  });

  for (const campo of NUNCA_VISTO_PELO_CASAL) {
    it(`\`${campo}\` não aparece no Documento.tsx`, () => {
      expect(documento).not.toContain(`doc.${campo}`);
    });
  }
});

describe("o número da versão", () => {
  it("uma proposta nova nasce na versão 1", () => {
    expect(proximaVersao(undefined, "aaa")).toEqual({
      versaoSelo: "aaa",
      versaoNumero: 1,
      mudou: true,
    });
  });

  it("gravar a mesma proposta cinco vezes não a leva à versão 6", () => {
    let estado = proximaVersao(undefined, "aaa");
    for (let i = 0; i < 4; i++) estado = proximaVersao(estado, "aaa");
    expect(estado).toEqual({ versaoSelo: "aaa", versaoNumero: 1, mudou: false });
  });

  it("mexer no conteúdo sobe o número", () => {
    const primeira = proximaVersao(undefined, "aaa");
    expect(proximaVersao(primeira, "bbb")).toEqual({
      versaoSelo: "bbb",
      versaoNumero: 2,
      mudou: true,
    });
  });

  it("uma proposta anterior a esta coluna entra na versão 1, não na 0", () => {
    expect(proximaVersao({}, "aaa").versaoNumero).toBe(1);
  });
});

describe("o estado da versão", () => {
  it("sem aceite, a página mostra o documento vivo", () => {
    expect(estadoDaVersao("aaa", undefined)).toBe("por-aceitar");
  });
  it("com aceite igual ao documento de agora, nada a dizer", () => {
    expect(estadoDaVersao("aaa", "aaa")).toBe("em-vigor");
  });
  it("com aceite diferente, o documento foi revisto depois do sim", () => {
    expect(estadoDaVersao("bbb", "aaa")).toBe("revista");
  });
});

describe("canonizar", () => {
  it("ordena as chaves e deixa as listas em paz", () => {
    expect(JSON.stringify(canonizar({ b: 1, a: [3, 1, 2] }))).toBe('{"a":[3,1,2],"b":1}');
  });
  it("`undefined` solto vira `null` e não rebenta", () => {
    expect(canonizar(undefined)).toBe(null);
  });
});
