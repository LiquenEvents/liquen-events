import { describe, it, expect } from "vitest";
import {
  MINIMO_DE_OPCOES,
  camposDeEscolhaPorTraduzir,
  comResposta,
  descricaoNaLingua,
  escolhaPronta,
  escolhasParaOCasal,
  notaNaLingua,
  novoIdDeEscolha,
  resolverEscolhas,
  respostaAceitavel,
  rotuloNaLingua,
  tituloNaLingua,
  type Escolha,
} from "./proposta-escolhas";
import { NUNCA_NO_PDF } from "./proposta-de-pdf/tipos";
import { NUNCA_VISTO_PELO_CASAL } from "./proposta-versao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ESCOLHAS DO CASAL — AS REGRAS, ANTES DE QUALQUER ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que se está a guardar aqui não é uma lista: é a promessa de que o que o
 * casal escolheu numa tarde de Maio ainda lá está no dia da montagem, mesmo
 * depois de ela rever o preço, arrastar as opções e corrigir uma gralha no
 * rótulo. Tudo o resto desta funcionalidade é desenho.
 */

const escolha = (over: Partial<Escolha> = {}): Escolha => ({
  id: "e1",
  titulo: "Paleta da cerimónia",
  opcoes: [
    { id: "o1", rotulo: "Verde-oliva e branco" },
    { id: "o2", rotulo: "Terracota e creme" },
  ],
  ...over,
});

describe("uma escolha só sai para o casal quando é mesmo uma escolha", () => {
  it("com duas opções escritas, está pronta", () => {
    expect(escolhaPronta(escolha())).toBe(true);
    expect(escolhasParaOCasal([escolha()])).toHaveLength(1);
  });

  it("com uma só opção, não sai — não é uma escolha, é uma afirmação", () => {
    const meia = escolha({ opcoes: [{ id: "o1", rotulo: "Verde-oliva e branco" }] });
    expect(escolhaPronta(meia)).toBe(false);
    expect(escolhasParaOCasal([meia])).toEqual([]);
    expect(MINIMO_DE_OPCOES).toBe(2);
  });

  it("uma segunda opção ainda por escrever é trabalho por acabar, não um erro", () => {
    // É exactamente o estado em que o estúdio fica assim que ela carrega em
    // «acrescentar opção». Não pode sair para o casal, e não pode gritar.
    const aMeio = escolha({
      opcoes: [{ id: "o1", rotulo: "Verde-oliva e branco" }, { id: "o2", rotulo: "  " }],
    });
    expect(escolhaPronta(aMeio)).toBe(false);
  });

  it("sem título, não sai — o casal ficava a escolher entre duas coisas sem saber o quê", () => {
    expect(escolhaPronta(escolha({ titulo: "   " }))).toBe(false);
  });

  it("duas opções com o mesmo identificador não saem: a resposta seria ambígua", () => {
    // A primeira responderia pelas duas, e ninguém daria por isso até ao dia
    // da montagem.
    const gemea = escolha({
      opcoes: [
        { id: "o1", rotulo: "Verde-oliva e branco" },
        { id: "o1", rotulo: "Terracota e creme" },
      ],
    });
    expect(escolhaPronta(gemea)).toBe(false);
  });

  it("as opções por escrever são limpas do que sai, sem mexer no documento", () => {
    const d = escolha({
      opcoes: [
        { id: "o1", rotulo: "Verde-oliva e branco" },
        { id: "o2", rotulo: "Terracota e creme" },
        { id: "o3", rotulo: "" },
      ],
    });
    expect(escolhasParaOCasal([d])[0].opcoes.map((o) => o.id)).toEqual(["o1", "o2"]);
    // O original fica intacto — é o rascunho dela.
    expect(d.opcoes).toHaveLength(3);
  });
});

/**
 * ── O QUE ISTO EXISTE PARA IMPEDIR ────────────────────────────────────────
 *
 * A resposta aponta para um IDENTIFICADOR, e não para uma posição nem para o
 * texto. É a única forma de arrastar as opções, corrigir uma gralha no rótulo
 * ou traduzir a paleta para inglês sem trocar, em silêncio, a escolha que o
 * casal fez.
 */
describe("a resposta sobrevive ao que ela mexe depois", () => {
  const respostas = [{ escolhaId: "e1", opcaoId: "o2", em: "2026-05-02T10:00:00.000Z" }];

  it("arrastar as opções não troca a escolha", () => {
    const trocada = escolha({
      opcoes: [
        { id: "o2", rotulo: "Terracota e creme" },
        { id: "o1", rotulo: "Verde-oliva e branco" },
      ],
    });
    const [r] = resolverEscolhas([trocada], respostas);
    expect(r.estado.tipo).toBe("escolhida");
    if (r.estado.tipo === "escolhida") expect(r.estado.opcao.rotulo).toBe("Terracota e creme");
  });

  it("corrigir uma gralha no rótulo não apaga a escolha", () => {
    const corrigida = escolha({
      opcoes: [
        { id: "o1", rotulo: "Verde-oliva e branco" },
        { id: "o2", rotulo: "Terracota e cru" },
      ],
    });
    const [r] = resolverEscolhas([corrigida], respostas);
    expect(r.estado.tipo).toBe("escolhida");
    if (r.estado.tipo === "escolhida") expect(r.estado.opcao.rotulo).toBe("Terracota e cru");
  });

  it("apagar a opção escolhida DIZ-SE — não se lê como «ainda não responderam»", () => {
    // São duas conversas muito diferentes de ter ao telefone.
    const semAOpcao = escolha({
      opcoes: [
        { id: "o1", rotulo: "Verde-oliva e branco" },
        { id: "o3", rotulo: "Azul e branco" },
      ],
    });
    const [r] = resolverEscolhas([semAOpcao], respostas);
    expect(r.estado.tipo).toBe("opcao-desapareceu");
    if (r.estado.tipo === "opcao-desapareceu") {
      expect(r.estado.opcaoId).toBe("o2");
      expect(r.estado.em).toBe("2026-05-02T10:00:00.000Z");
    }
  });

  it("uma escolha sem resposta aparece na mesma, marcada por responder", () => {
    const [r] = resolverEscolhas([escolha()], []);
    expect(r.estado.tipo).toBe("por-responder");
  });
});

describe("mudar de ideias", () => {
  it("a resposta nova substitui a antiga — não se guarda o hesitar", () => {
    // Um histórico de indecisões seria, na prática, o registo de comportamento
    // que ela proibiu: dava para ler quantas vezes voltaram atrás e a que horas.
    const antes = [{ escolhaId: "e1", opcaoId: "o1", em: "2026-05-01T10:00:00.000Z" }];
    const depois = comResposta(antes, {
      escolhaId: "e1",
      opcaoId: "o2",
      em: "2026-05-02T10:00:00.000Z",
    });
    expect(depois).toHaveLength(1);
    expect(depois[0].opcaoId).toBe("o2");
  });

  it("responder a outra pergunta não mexe na primeira", () => {
    const antes = [{ escolhaId: "e1", opcaoId: "o1", em: "2026-05-01T10:00:00.000Z" }];
    const depois = comResposta(antes, {
      escolhaId: "e2",
      opcaoId: "x1",
      em: "2026-05-02T10:00:00.000Z",
    });
    expect(depois.map((r) => r.escolhaId).sort()).toEqual(["e1", "e2"]);
  });

  it("com duas respostas gravadas para a mesma pergunta, vale a MAIS RECENTE", () => {
    // Não devia acontecer (o `comResposta` substitui), mas um documento vindo
    // de uma cópia de segurança antiga pode trazê-las — e aí a resposta certa
    // é a última, não a primeira que aparecer na lista.
    const [r] = resolverEscolhas(
      [escolha()],
      [
        { escolhaId: "e1", opcaoId: "o1", em: "2026-05-01T10:00:00.000Z" },
        { escolhaId: "e1", opcaoId: "o2", em: "2026-05-09T10:00:00.000Z" },
      ],
    );
    if (r.estado.tipo === "escolhida") expect(r.estado.opcao.id).toBe("o2");
    else expect.unreachable("devia ter ficado escolhida");
  });
});

/**
 * ── QUEM TEM O LINK TEM O CORPO DO PEDIDO ─────────────────────────────────
 *
 * O que chega do outro lado da rede é texto que alguém pode escrever à mão. Se
 * o par (escolha, opção) não existir numa escolha PRONTA, não se grava: sem
 * isto, o corpo do pedido decidia o que fica escrito na ficha do evento.
 */
describe("o que se aceita gravar", () => {
  it("aceita o par que existe", () => {
    expect(respostaAceitavel([escolha()], "e1", "o2")).toBe(true);
  });

  it("recusa uma opção de outra escolha", () => {
    const outra = escolha({ id: "e2", opcoes: [{ id: "z1", rotulo: "A" }, { id: "z2", rotulo: "B" }] });
    expect(respostaAceitavel([escolha(), outra], "e1", "z1")).toBe(false);
  });

  it("recusa uma escolha que ainda não está pronta", () => {
    // Inalcançável no ecrã, e por isso também não gravável por quem souber o
    // identificador — é a mesma regra lida uma vez só.
    const meia = escolha({ opcoes: [{ id: "o1", rotulo: "Verde-oliva e branco" }] });
    expect(respostaAceitavel([meia], "e1", "o1")).toBe(false);
  });

  it("recusa o que não é texto", () => {
    expect(respostaAceitavel([escolha()], 1, "o1")).toBe(false);
    expect(respostaAceitavel([escolha()], "e1", null)).toBe(false);
    expect(respostaAceitavel([escolha()], "__proto__", "o1")).toBe(false);
  });

  it("recusa tudo quando não há escolhas nenhumas", () => {
    expect(respostaAceitavel(undefined, "e1", "o1")).toBe(false);
  });
});

describe("as duas línguas", () => {
  const bilingue = escolha({
    tituloEn: "Ceremony palette",
    nota: "Podemos mudar até 30 dias antes.",
    notaEn: "We can change this up to 30 days before.",
    opcoes: [
      {
        id: "o1",
        rotulo: "Verde-oliva e branco",
        rotuloEn: "Olive and white",
        descricao: "Eucalipto, rosa branca",
        descricaoEn: "Eucalyptus, white rose",
      },
      { id: "o2", rotulo: "Terracota e creme" },
    ],
  });

  it("em inglês lê a caixa inglesa", () => {
    expect(tituloNaLingua(bilingue, "en")).toBe("Ceremony palette");
    expect(notaNaLingua(bilingue, "en")).toBe("We can change this up to 30 days before.");
    expect(rotuloNaLingua(bilingue.opcoes[0], "en")).toBe("Olive and white");
    expect(descricaoNaLingua(bilingue.opcoes[0], "en")).toBe("Eucalyptus, white rose");
  });

  it("sem caixa inglesa, o português vai à frente — nunca um espaço em branco", () => {
    // Uma opção sem rótulo é um botão sem nome: o casal escolheria às cegas.
    expect(rotuloNaLingua(bilingue.opcoes[1], "en")).toBe("Terracota e creme");
  });

  it("em português nunca lê a caixa inglesa", () => {
    expect(tituloNaLingua(bilingue, "pt")).toBe("Paleta da cerimónia");
    expect(rotuloNaLingua(bilingue.opcoes[0], "pt")).toBe("Verde-oliva e branco");
  });

  it("o que falta traduzir sai nomeado, para o painel «Por traduzir»", () => {
    const fora = camposDeEscolhaPorTraduzir([bilingue]);
    expect(fora.map((c) => c.caminho)).toEqual(["escolhas:0:opcoes:1:rotulo"]);
    expect(fora[0].pt).toBe("Terracota e creme");
  });

  it("o que não está escrito em português não conta como por traduzir", () => {
    expect(camposDeEscolhaPorTraduzir([escolha()]).map((c) => c.caminho)).toEqual([
      "escolhas:0:titulo",
      "escolhas:0:opcoes:0:rotulo",
      "escolhas:0:opcoes:1:rotulo",
    ]);
  });
});

describe("os identificadores", () => {
  it("têm doze caracteres e não se repetem", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const id = novoIdDeEscolha();
      expect(id).toHaveLength(12);
      expect(id).toMatch(/^[0-9a-z]+$/);
      vistos.add(id);
    }
    expect(vistos.size).toBe(500);
  });

  it("não dependem do `crypto` do browser", () => {
    // O estúdio corre em navegadores onde o `randomUUID` só existe em contexto
    // seguro; isto tem de dar um identificador na mesma.
    expect(novoIdDeEscolha(() => 0.5)).toHaveLength(12);
  });
});

/**
 * ── AS DUAS REGRAS QUE NÃO SE NEGOCEIAM, PRESAS AQUI ──────────────────────
 */
describe("o PDF continua exactamente como está", () => {
  it("as escolhas estão declaradas como coisa que o gerador não desenha", () => {
    expect(Object.keys(NUNCA_NO_PDF)).toContain("escolhas");
  });

  it("mas CONTAM para a versão — o casal vê-as na página", () => {
    // Se contassem como «o casal não vê», trocar uma opção depois do aceite
    // mudava o que foi aceite sem nada o dizer. É a mesma excepção do
    // `headerTitle`, e a razão está escrita em `proposta-versao.ts`.
    expect(NUNCA_VISTO_PELO_CASAL).not.toContain("escolhas");
    expect(NUNCA_VISTO_PELO_CASAL).not.toContain("headerTitle");
    // E o controlo: o que o casal mesmo não vê continua de fora.
    expect(NUNCA_VISTO_PELO_CASAL).toContain("notasInternas");
  });
});
