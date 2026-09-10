import { describe, expect, it } from "vitest";
import { analisarODia } from "./guiao-do-dia";
import { colunasPorResponsavel, ROTULO_SEM_RESPONSAVEL, SEM_RESPONSAVEL } from "./guioes";
import type { TimelineItem } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS COLUNAS DA GRELHA — E O QUE CADA UM DESTES TESTES GUARDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A grelha põe uma coluna por responsável e as horas a descer. Tudo o que ela
 * desenha sai daqui, e é aqui que se põe à prova — em jsdom não há disposição
 * nenhuma, e medir alturas de blocos lá era medir zero e passar sempre. A
 * geometria a sério mede-se no browser (`e2e/grelha-do-dia.spec.ts`).
 *
 * Cada teste guarda uma avaria que já se sabe como acontece; os controlos
 * negativos estão escritos a par, porque um teste que nunca se viu falhar não
 * prova nada.
 */

function momento(
  id: string,
  time: string,
  title: string,
  owner?: string,
  duracao?: number,
): TimelineItem {
  return { id, time, title, ...(owner ? { owner } : {}), ...(duracao ? { duracao } : {}) };
}

function colunasDe(items: TimelineItem[]) {
  return colunasPorResponsavel(analisarODia(items).blocos);
}

describe("colunasPorResponsavel", () => {
  it("junta «Ana», «ana » e «ANA» numa coluna só, com a primeira grafia por nome", () => {
    const colunas = colunasDe([
      momento("a", "09:00", "Montagem", "Ana Silva", 120),
      momento("b", "14:00", "Arranjos", "ana silva ", 60),
      momento("c", "18:00", "Mesa dos doces", "ANA SILVA", 30),
    ]);

    expect(colunas).toHaveLength(1);
    expect(colunas[0].nome).toBe("Ana Silva");
    expect(colunas[0].blocos).toHaveLength(3);
  });

  it("CONTROLO NEGATIVO: dois nomes mesmo diferentes continuam a dar duas colunas", () => {
    // Se a chave passasse a esmagar tudo (por exemplo, a devolver sempre ""),
    // o teste de cima passava na mesma e este chumbava. É o par que prova que a
    // comparação é a certa e não uma que junta toda a gente.
    const colunas = colunasDe([
      momento("a", "09:00", "Montagem", "Ana", 120),
      momento("b", "09:00", "Flores", "Rita", 120),
    ]);
    expect(colunas.map((c) => c.nome)).toEqual(["Ana", "Rita"]);
  });

  it("põe quem começa primeiro à esquerda, e desempata pelo nome", () => {
    const colunas = colunasDe([
      momento("a", "17:00", "Cerimónia", "Rita", 45),
      momento("b", "07:00", "Carrinha", "Zé", 60),
      momento("c", "09:00", "Flores", "Bruno", 60),
      momento("d", "09:00", "Mesas", "Ana", 60),
    ]);

    // O Zé das 07:00 não vai para o fim por se chamar Zé: a grelha lê-se de
    // cima para baixo (o dia) e da esquerda para a direita (as pessoas).
    expect(colunas.map((c) => c.nome)).toEqual(["Zé", "Ana", "Bruno", "Rita"]);
  });

  it("a ordem não depende da ordem por que os momentos chegam", () => {
    // Duas pessoas a começar à mesma hora: sem o desempate pelo nome, as
    // colunas trocavam de sítio entre dois carregamentos dos mesmos dados.
    const um = colunasDe([
      momento("a", "09:00", "Mesas", "Ana", 60),
      momento("b", "09:00", "Flores", "Bruno", 60),
    ]);
    const outro = colunasDe([
      momento("b", "09:00", "Flores", "Bruno", 60),
      momento("a", "09:00", "Mesas", "Ana", 60),
    ]);
    expect(um.map((c) => c.nome)).toEqual(outro.map((c) => c.nome));
  });

  it("os momentos sem responsável têm coluna própria, e é a última", () => {
    const colunas = colunasDe([
      momento("a", "08:00", "Abrir o espaço", undefined, 60),
      momento("b", "09:00", "Montagem", "Ana", 120),
      momento("c", "17:00", "Cerimónia", "Rita", 45),
    ]);

    expect(colunas.map((c) => c.chave)).toEqual(["ana", "rita", SEM_RESPONSAVEL]);
    // Fica em último apesar de começar mais cedo do que toda a gente: ao
    // princípio empurrava uma pessoa a sério para fora do primeiro ecrã a
    // 390 px, e a primeira coluna é a que ela lê sem rolar nada.
    expect(colunas[2].nome).toBe(ROTULO_SEM_RESPONSAVEL);
    expect(colunas[2].inicio).toBe(8 * 60);
  });

  it("um guião inteiro sem responsáveis dá uma coluna só", () => {
    const colunas = colunasDe([
      momento("a", "09:00", "Montagem", undefined, 120),
      momento("b", "17:00", "Cerimónia"),
    ]);
    expect(colunas).toHaveLength(1);
    expect(colunas[0].chave).toBe(SEM_RESPONSAVEL);
  });

  it("a mesma pessoa em dois sítios ao mesmo tempo abre um segundo carril", () => {
    const items = [
      momento("a", "09:00", "Montagem", "Ana", 240),
      momento("b", "10:00", "Prova de bolo", "Ana", 60),
    ];
    const colunas = colunasDe(items);

    expect(colunas).toHaveLength(1);
    expect(colunas[0].carris).toBe(2);
    expect(colunas[0].blocos.map((b) => b.carril).sort()).toEqual([0, 1]);
    // E é mesmo o erro que o motor detecta — a grelha não inventa um estado
    // seu: a cor e o losango do bloco saem daqui.
    expect(analisarODia(items).choques).toHaveLength(1);
  });

  it("CONTROLO NEGATIVO: um dia encostado dá UM carril, e não um por bloco", () => {
    // Sem isto, o teste dos dois carris passava por acaso — bastava a função
    // dar um carril novo a cada bloco para ele ficar verde.
    const colunas = colunasDe([
      momento("a", "09:00", "Montagem", "Ana", 120),
      momento("b", "11:00", "Almoço", "Ana", 60),
      momento("c", "12:00", "Arranjos", "Ana", 60),
    ]);
    expect(colunas[0].carris).toBe(1);
    expect(colunas[0].blocos.every((b) => b.carril === 0)).toBe(true);
  });

  it("duas pessoas ao mesmo tempo não engrossam coluna nenhuma — ficam lado a lado", () => {
    // A sobreposição entre pessoas diferentes é informação, e a grelha diz-a
    // com a POSIÇÃO (duas colunas à mesma altura), não com um segundo carril.
    const colunas = colunasDe([
      momento("a", "09:00", "Montagem", "Ana", 240),
      momento("b", "10:00", "Catering", "Rui", 120),
    ]);
    expect(colunas).toHaveLength(2);
    expect(colunas.every((c) => c.carris === 1)).toBe(true);
  });

  it("um instante dentro de uma montagem abre carril e NÃO é choque", () => {
    // O motor mede a intersecção de um ponto com um intervalo: zero minutos.
    // É essa linha que faz um guião antigo (só instantes) abrir calado, e a
    // grelha herda-a — mas o instante não pode desaparecer dentro do bloco que
    // o contém, e por isso ganha carril na mesma.
    const items = [
      momento("a", "09:00", "Montagem", "Ana", 240),
      momento("b", "10:00", "Chegada das flores", "Ana"),
    ];
    const colunas = colunasDe(items);
    expect(colunas[0].carris).toBe(2);
    expect(analisarODia(items).choques).toHaveLength(0);
  });

  it("os momentos sem hora legível ficam de fora da grelha", () => {
    // Não têm sítio na régua, e inventar-lhes um era desenhá-los às 00:00 — no
    // topo da manhã, ao lado da montagem. Quem chama conta-os e di-lo.
    const colunas = colunasDe([
      momento("a", "09:00", "Montagem", "Ana", 120),
      momento("b", "", "Falta combinar a hora", "Ana"),
      momento("c", "25:99", "Lixo", "Ana"),
    ]);
    expect(colunas).toHaveLength(1);
    expect(colunas[0].blocos.map((b) => b.bloco.item.id)).toEqual(["a"]);
  });

  it("a madrugada é o FIM do dia, também dentro da coluna", () => {
    // A regra das 05:00 vive no motor (`ordemNoDia`) e a grelha não a repete:
    // o encerramento das 02:00 vale 1560 minutos e desenha-se em BAIXO, não no
    // topo da manhã ao lado do copo de água das duas da tarde.
    const colunas = colunasDe([
      momento("a", "23:00", "Festa", "Rui", 180),
      momento("b", "02:00", "Encerramento", "Rui", 60),
    ]);
    const porOrdem = colunas[0].blocos.map((b) => b.bloco.inicio);
    expect(porOrdem).toEqual([23 * 60, 26 * 60]);
    // E encostam: a festa acaba às 02:00 e o encerramento começa aí — um
    // carril só, sem choque nenhum inventado pela meia-noite.
    expect(colunas[0].carris).toBe(1);
  });

  it("um guião vazio não dá coluna nenhuma", () => {
    expect(colunasDe([])).toEqual([]);
  });
});
