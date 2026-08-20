import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ECRÃ ESCRITO E TESTADO QUE NINGUÉM MONTA NÃO EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o defeito mais caro que esta casa tem tido, e não se parece com um
 * defeito: o ficheiro está lá, os testes passam, a funcionalidade está
 * «feita» — e não há caminho nenhum no produto que lá chegue. Já aconteceu
 * três vezes:
 *
 *   · `NotasInternas.tsx` — testado, com aspecto de papel amarelo, e a única
 *     referência em todo o `src/` era o seu próprio teste. Montá-lo destapou
 *     um erro de hidratação que dormia lá dentro desde o primeiro dia.
 *   · `PainelGeracaoAoGanhar.tsx` — 7 testes verdes sobre o ecrã que cria a
 *     lista de material, as datas-chave e as linhas de sinal e saldo. Sem ele,
 *     marcar «Ganho» gerava 2 das 4 peças e ela refazia o resto à mão, por
 *     casamento.
 *   · A caixa de entrada inteira — desligada num commit que apagou só o
 *     contentor; os três filhos e cinco rotas de API ficaram vivos e órfãos, e
 *     o robô continuou a mandar «Novo email» todos os dias para um sítio que
 *     já não existia.
 *
 * Este teste percorre as importações a sério, a partir dos pontos de entrada
 * do Next, e exige que cada ecrã do back office ou seja ALCANÇÁVEL ou esteja
 * na lista de baixo com a razão escrita. Não é uma tolerância — é o sítio onde
 * a decisão fica registada, e onde ela aparece a quem vier a seguir.
 *
 * ── O QUE ESTE TESTE NÃO APANHA, E É PRECISO SABER ────────────────────────
 *
 * Ele mede se um ficheiro está no GRAFO, não se alguém o DESENHA. Um barril de
 * reexportação (`ui/index.ts`) derrota-o: basta a linha `export { X } from
 * "./X"` para o X passar a alcançável, mesmo que nenhum ecrã o use.
 *
 * O caso conhecido é o `ui/CampoData.tsx` — o campo que escreve o dia da
 * semana por extenso e avisa quando um casamento cai fora de sábado, montado
 * depois de uma quinta-feira ter passado no meio dos casamentos de 2027. Está
 * no barril, e os nove campos de data do back office continuam a ser
 * `<input type="date">` em cru. Este teste não o vê, e por isso fica aqui
 * escrito.
 */

const RAIZ = path.join(process.cwd(), "src");
const ADMIN = path.join(RAIZ, "app", "[lang]", "(site)", "orcamento", "admin");

/**
 * O QUE ESTÁ ESCRITO E NÃO ESTÁ MONTADO, E PORQUÊ.
 *
 * A chave é o caminho a partir de `src/`. A razão tem de dizer o que falta
 * para o ecrã ser montado — não «é código morto», que não ajuda ninguém.
 */
/*
 * A LISTA ESTÁ VAZIA — e é assim que ela deve ficar.
 *
 * Teve três entradas, as da caixa de entrada de email: `InboxList`,
 * `InboxThread` e `InboxShared`, órfãos desde julho, com cinco rotas
 * `/api/inbox/*` e um `cron` a mandar «Novo email» para um ecrã que não
 * existia. A entrada dizia o que faltava decidir — voltar a montar ou apagar.
 * Foi decidido: apagar. Ver o commit que os removeu.
 *
 * Uma lista vazia é o estado saudável deste teste. Se alguém acrescentar aqui
 * um ficheiro, está a pedir uma decisão adiada — e a razão tem de dizer o que
 * falta para o ecrã ser montado, não «é código morto», que não ajuda ninguém.
 */
const POR_MONTAR: Readonly<Record<string, string>> = {};

function ficheiros(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === ".next") continue;
      ficheiros(p, acc);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      acc.push(p);
    }
  }
  return acc;
}

const TODOS = ficheiros(RAIZ);
const conteudo = new Map(TODOS.map((f) => [f, readFileSync(f, "utf8")]));

/** Resolve um `@/…` ou um `./…` para um ficheiro real, se existir. */
function resolver(deOnde: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = path.join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(deOnde), especificador);
  else return null; // pacote externo — não é connosco
  for (const sufixo of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const tentativa = base + sufixo;
    if (conteudo.has(tentativa)) return tentativa;
  }
  return null;
}

/**
 * Conta TUDO o que puxa um ficheiro para dentro do produto: o `import`
 * normal, o `import type` (não empacota, mas prova que alguém o conhece), e o
 * `import("…")` dinâmico — que é como metade dos ecrãs deste back office
 * entram (ver `lazy.tsx`). Ignorar o dinâmico dava trinta falsos positivos.
 */
const REFERENCIA = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function referidos(f: string): string[] {
  const fora: string[] = [];
  for (const m of (conteudo.get(f) ?? "").matchAll(REFERENCIA)) {
    const alvo = resolver(f, m[1]);
    if (alvo) fora.push(alvo);
  }
  return fora;
}

/** Os pontos de entrada do Next: é daqui que o produto começa. */
const ENTRADAS = TODOS.filter((f) =>
  /(^|\/)(page|layout|route|template|loading|default|error|not-found|global-error|proxy|instrumentation)\.tsx?$/.test(
    f,
  ),
);

/** Tudo o que se alcança a partir das entradas, seguindo as referências. */
function alcancaveis(): Set<string> {
  const vistos = new Set<string>(ENTRADAS);
  const fila = [...ENTRADAS];
  while (fila.length) {
    for (const seguinte of referidos(fila.pop()!)) {
      if (vistos.has(seguinte)) continue;
      vistos.add(seguinte);
      fila.push(seguinte);
    }
  }
  return vistos;
}

const ALCANCAVEIS = alcancaveis();
const relativo = (f: string) => path.relative(RAIZ, f).split(path.sep).join("/");

/** Os ecrãs do back office — os `.tsx`, que é o que se monta. */
const ECRAS = TODOS.filter((f) => f.startsWith(ADMIN + path.sep) && f.endsWith(".tsx"));

describe("nada do back office fica escrito sem ser montado", () => {
  it("há entradas e ecrãs para percorrer (controlo positivo)", () => {
    // Sem isto, uma expressão regular partida transformava o teste seguinte
    // numa linha verde a mentir: zero ecrãs, zero falhas.
    expect(ENTRADAS.length).toBeGreaterThan(50);
    expect(ECRAS.length).toBeGreaterThan(50);
    expect(ALCANCAVEIS.size).toBeGreaterThan(200);
  });

  it("o grafo alcança mesmo o que é montado por `dynamic()` (controlo positivo)", () => {
    // O `ProposalStudio` entra por importação dinâmica, em `lazy.tsx`. Se o
    // grafo não seguisse o `import("…")`, ele apareceria como órfão — e o
    // teste inteiro passaria a acusar meio back office.
    expect(ALCANCAVEIS.has(path.join(ADMIN, "ProposalStudio.tsx"))).toBe(true);
  });

  for (const ecra of ECRAS) {
    const nome = relativo(ecra);
    it(`${nome}`, () => {
      const alcancado = ALCANCAVEIS.has(ecra);
      const razao = POR_MONTAR[nome];
      expect(
        alcancado || !!razao,
        `\`${nome}\` não é alcançável a partir de nenhuma página. ` +
          "Ou é montado onde faz falta, ou entra em `POR_MONTAR` com a razão e o que falta " +
          "para o montar. Um ecrã escrito e testado que ninguém monta não existe.",
      ).toBe(true);
      // E o contrário: quem passou a estar montado tem de sair da lista, senão
      // a próxima pessoa lê uma decisão sobre um ecrã que já não é verdade.
      if (alcancado && razao) {
        expect.fail(`\`${nome}\` já está montado — tire-o de \`POR_MONTAR\`.`);
      }
    });
  }

  it("cada entrada da lista tem uma razão escrita, e não uma palavra", () => {
    for (const [ficheiro, razao] of Object.entries(POR_MONTAR)) {
      expect(razao.length, `a razão de \`${ficheiro}\` é curta de mais`).toBeGreaterThan(60);
    }
  });
});
