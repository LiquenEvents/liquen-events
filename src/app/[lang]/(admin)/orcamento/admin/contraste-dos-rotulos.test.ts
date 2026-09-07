import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { corDeTexto, UNKNOWN_STATUS_COLOR } from "./status-meta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS RÓTULOS DA PALETA DE ESTADOS LEEM-SE — A CONTA, FEITA AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A varredura de contraste (`e2e/contraste-do-back-office.spec.ts`) encontrou-os
 * no browser, nos onze destinos do painel. Aqui faz-se a ARITMÉTICA da norma,
 * que é o que impede a correcção de se desfazer sem ninguém dar por isso: um
 * passeio depende de a vista ter dados, e uma conta não depende de nada.
 *
 * A fórmula é a do `contraste-do-texto.test.ts` — luminância relativa da WCAG,
 * com o alfa achatado ANTES de medir, que é onde toda a gente se engana.
 */

const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (p: number[]) =>
  0.2126 * canal(p[0] / 255) + 0.7152 * canal(p[1] / 255) + 0.0722 * canal(p[2] / 255);
const ler = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const achatar = (frente: number[], alfa: number, fundo: number[]) =>
  frente.map((c, i) => c * alfa + fundo[i] * (1 - alfa));
const racio = (a: number[], b: number[]) => {
  const [alto, baixo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
};

const BRANCO = [255, 255, 255];
const MINIMO = 4.5;

/**
 * Cada rótulo desta paleta, com o FUNDO em que ele é mesmo desenhado.
 *
 * Os crachás pintam o fundo com a própria cor a um alfa baixo — `${cor}22` nas
 * tarefas, `${cor}18` na Visão Geral —, portanto medir contra branco daria um
 * número melhor do que o verdadeiro. É por isso que o fundo vai escrito aqui
 * caso a caso, e não assumido.
 */
const ROTULOS: { onde: string; cor: string; fundo: number[] }[] = [
  {
    onde: "Tarefas · prioridade «Normal»",
    cor: "#9aa36a",
    fundo: achatar(ler("#9aa36a"), 0x22 / 255, BRANCO),
  },
  {
    onde: "Visão Geral · estado «Novo»",
    cor: "#8a8a82",
    fundo: achatar(ler("#8a8a82"), 0x18 / 255, BRANCO),
  },
  {
    onde: "Visão Geral · estado «Aguardar resposta»",
    cor: "#9aa36a",
    fundo: achatar(ler("#9aa36a"), 0x18 / 255, BRANCO),
  },
  { onde: "Estatísticas · taxa de conversão", cor: "#8a8a82", fundo: BRANCO },
  { onde: "Material · tipo «Consumível»", cor: "#8a6d2f", fundo: ler("#f6efe1") },
];

describe("os rótulos da paleta de estados", () => {
  for (const { onde, cor, fundo } of ROTULOS) {
    it(`${onde} passa a norma quando escrito`, () => {
      const medido = racio(ler(corDeTexto(cor)), fundo);
      expect(
        Math.round(medido * 100) / 100,
        `${onde}: ${cor} → ${corDeTexto(cor)} mede ${medido.toFixed(2)}:1 sobre o seu fundo`,
      ).toBeGreaterThanOrEqual(MINIMO);
    });
  }

  /**
   * E ao contrário: sem o degrau de texto, estes MESMOS rótulos chumbam. É o que
   * impede o teste de passar por acaso — se alguém apagar o `corDeTexto` e o
   * deixar a devolver a cor como veio, esta afirmação cai.
   */
  it("sem o degrau de texto, os mesmos rótulos chumbavam", () => {
    const chumbavam = ROTULOS.filter(({ cor, fundo }) => racio(ler(cor), fundo) < MINIMO);
    expect(
      chumbavam.map((r) => r.onde),
      "nenhum rótulo chumbava com a cor crua — este teste deixou de provar alguma coisa",
    ).toHaveLength(ROTULOS.length);
  });

  /** Uma cor de fora da tabela volta como veio — nunca desaparece. */
  it("uma cor desconhecida volta intacta", () => {
    expect(corDeTexto("#123456")).toBe("#123456");
    expect(corDeTexto(UNKNOWN_STATUS_COLOR)).toBe(corDeTexto("#8a8a82"));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA À MÃO ACABOU — A VARREDURA É QUE DIZ QUAIS SÃO OS RÓTULOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista `ROTULOS` acima tem cinco entradas e esteve certa. O problema não era
 * o que ela dizia, era o que ela NÃO dizia: o padrão do crachá aparece em nove
 * ficheiros, e seis rótulos ficaram de fora — entre eles o «Enviada» das
 * Propostas, a 2,43:1, que é o estado onde uma proposta passa mais tempo.
 *
 * E o caso que fecha o argumento: o `#8a8a82` estava NA lista, estava curado, e
 * mesmo assim media 4,40:1 no `#8a8a821f` do plano de produção — porque o que
 * envelheceu não foi a cor, foi a lista de FUNDOS onde alguém se lembrou de a
 * medir. Uma lista à mão de sítios estraga-se pela mesma razão que um número à
 * mão num comentário: ninguém a revisita ao acrescentar um crachá.
 *
 * Daqui para a frente a fonte é que responde. A varredura lê dos `.tsx` do back
 * office (a) as cores escritas nos mapas de estado e (b) os alfas com que a casa
 * pinta o fundo de um crachá, e exige que cada cor, DEPOIS do degrau de texto,
 * passe a norma contra branco e contra o seu próprio tom no alfa mais escuro que
 * exista no código. Um crachá novo, uma cor nova ou um alfa mais escuro entram
 * na conta sozinhos.
 */

const FICHEIROS_DO_BACK_OFFICE = (): string[] =>
  execSync("grep -rl --include=*.tsx -e 'color: ' src/app/'[lang]'/'(admin)' || true", {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test."));

/**
 * As cores sólidas de um mapa de estados que chegam mesmo a ESCREVER-SE.
 *
 * A primeira versão desta varredura media todas as cores de todos os mapas, e
 * chumbou logo o `#a08a5a` do Calendário, a 3,35:1. Fui ver: o `KIND_META` do
 * Calendário só é usado como `background` — o ponto do dia, o quadrado da
 * legenda, a pastilha cheia. Nunca escreve nada. Escurecê-lo seria estragar um
 * preenchimento que está certo para satisfazer uma regra de texto que ali não
 * se aplica, que é precisamente o erro contra o qual o `status-meta.ts` avisa.
 *
 * Portanto a varredura segue o USO e não a declaração: um ficheiro só entra na
 * conta se lá dentro alguma cor de mapa chegar a um `color:` — directamente ou
 * pelo `corDeTexto`. No dia em que o Calendário escrever com o `KIND_META`,
 * entra sozinho.
 */
function coresDosMapas(): Map<string, string[]> {
  const achadas = new Map<string, string[]>();
  for (const ficheiro of FICHEIROS_DO_BACK_OFFICE()) {
    const fonte = readFileSync(ficheiro, "utf8");
    const escreveComOMapa =
      fonte.includes("corDeTexto(") || /color:\s*[^,\n}]*\.color\b/.test(fonte);
    if (!escreveComOMapa) continue;
    for (const linha of fonte.split("\n")) {
      const m = linha.match(/color: "(#[0-9a-fA-F]{6})"/);
      if (!m) continue;
      const cor = m[1].toLowerCase();
      achadas.set(cor, [...(achadas.get(cor) ?? []), ficheiro.split("/").pop()!]);
    }
  }
  return achadas;
}

/** Os alfas com que a casa pinta o fundo de um crachá: `background: `${cor}1f``. */
function alfasDosCrachas(): number[] {
  const alfas = new Set<number>();
  for (const ficheiro of FICHEIROS_DO_BACK_OFFICE()) {
    for (const m of readFileSync(ficheiro, "utf8").matchAll(
      /background: `\$\{[^}]*\}([0-9a-fA-F]{2})`/g,
    )) {
      alfas.add(parseInt(m[1], 16));
    }
  }
  return [...alfas].sort((a, b) => a - b);
}

describe("a paleta de estados varrida da fonte", () => {
  const cores = coresDosMapas();
  const alfas = alfasDosCrachas();
  /** O fundo mais escuro é o que dá o pior contraste a um texto escuro. */
  const alfaPior = Math.max(...alfas);

  /**
   * Uma varredura que não encontra nada passa sempre, e não prova nada. Já
   * aconteceu duas vezes nesta casa. Estes dois números são o seu seguro: se
   * alguém mudar a forma de escrever um crachá, isto cai antes de as cores
   * deixarem silenciosamente de ser medidas.
   */
  it("a varredura encontrou mesmo alguma coisa", () => {
    expect(cores.size, "nenhuma cor de mapa de estados encontrada — a varredura cegou").
      toBeGreaterThanOrEqual(8);
    expect(alfas.length, "nenhum alfa de crachá encontrado — a varredura cegou").
      toBeGreaterThanOrEqual(2);
  });

  for (const [cor, ficheiros] of [...cores].sort()) {
    const onde = [...new Set(ficheiros)].join(", ");
    it(`${cor} (${onde}) lê-se depois do degrau de texto`, () => {
      const escrita = ler(corDeTexto(cor));
      const fundos = [
        { nome: "branco", px: BRANCO },
        {
          nome: `${cor}${alfaPior.toString(16).padStart(2, "0")}`,
          px: achatar(ler(cor), alfaPior / 255, BRANCO),
        },
      ];
      for (const fundo of fundos) {
        const medido = racio(escrita, fundo.px);
        expect(
          Math.round(medido * 100) / 100,
          `${cor} → ${corDeTexto(cor)} mede ${medido.toFixed(2)}:1 sobre ${fundo.nome} (usada em ${onde})`,
        ).toBeGreaterThanOrEqual(MINIMO);
      }
    });
  }
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E QUE CADA CRACHÁ CHAME MESMO O DEGRAU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A varredura acima garante que a TABELA está completa. Não garante que alguém
 * a use: um crachá novo que escreva `color: meta.color` à bruta passa por ela
 * sem tocar em nada, porque a cor dele está curada — só que o ecrã continua a
 * desenhá-la crua. Era exactamente o estado em que este back office estava:
 * `corDeTexto` existia, e era chamado em dois dos nove sítios.
 *
 * Por isso este segundo teste não olha para cores nenhumas. Olha para dentro de
 * cada `style={{ … }}` e exige que um `color:` que venha de um mapa de estados
 * (`…​.color`) passe pelo degrau. Preenchimentos — `background`, `borderColor`,
 * `stroke` — ficam de fora de propósito: aí a cor clara é a certa.
 */
describe("os crachás escrevem com o degrau de texto", () => {
  /** Cada `style={{ … }}` de cada ficheiro, com o ficheiro e a linha em que abre. */
  function blocosDeEstilo(): { ficheiro: string; linha: number; texto: string }[] {
    const blocos: { ficheiro: string; linha: number; texto: string }[] = [];
    for (const ficheiro of FICHEIROS_DO_BACK_OFFICE()) {
      const fonte = readFileSync(ficheiro, "utf8");
      const nome = ficheiro.split("/").pop()!;
      for (const m of fonte.matchAll(/style=\{\{/g)) {
        const inicio = m.index!;
        // fecha no `}}` que equilibra as chavetas — os crachás têm crases lá dentro
        let profundidade = 0;
        let fim = inicio;
        for (let i = inicio + "style={".length; i < fonte.length; i++) {
          if (fonte[i] === "{") profundidade++;
          else if (fonte[i] === "}") {
            if (profundidade === 0) {
              fim = i;
              break;
            }
            profundidade--;
          }
        }
        blocos.push({
          ficheiro: nome,
          linha: fonte.slice(0, inicio).split("\n").length,
          texto: fonte.slice(inicio, fim),
        });
      }
    }
    return blocos;
  }

  const blocos = blocosDeEstilo();

  it("a varredura dos estilos encontrou mesmo alguma coisa", () => {
    expect(blocos.length, "nenhum `style={{` encontrado — a varredura cegou").toBeGreaterThan(50);
  });

  it("nenhum `color:` de um mapa de estados é escrito à bruta", () => {
    const crus = blocos
      .flatMap(({ ficheiro, linha, texto }) =>
        [...texto.matchAll(/(?:^|[\s,{])color:\s*([^,\n}]+)/g)].map((m) => ({
          ficheiro,
          linha,
          valor: m[1].trim(),
        })),
      )
      .filter(({ valor }) => /\.color\b/.test(valor) && !valor.includes("corDeTexto("));

    expect(
      crus.map((c) => `${c.ficheiro}:${c.linha} → ${c.valor}`),
      "um crachá escreve a cor de preencher em vez da cor de escrever",
    ).toEqual([]);
  });
});
