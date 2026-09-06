import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTÁ A SAIR SAI TAMBÉM DA ÁRVORE DE ACESSIBILIDADE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A ronda das saídas deu à casa uma palavra nova: `ui/saida.ts` segura um nó
 * MONTADO 200 ms depois de ele ter fechado, para haver o que animar. É um bom
 * gesto, e traz consigo um defeito que não se vê em fotograma nenhum:
 *
 *   **durante esses 200 ms o nó continua a existir para quem não olha para o
 *   ecrã.**
 *
 * Um diálogo fechado que continua a anunciar-se é pior do que um fecho seco. Um
 * menu a apagar-se com os itens ainda no fio do Tab é uma armadilha: carrega-se
 * em algo que já não existe, e a acção corre.
 *
 * ── A REGRA, E PORQUE É QUE SÃO ESTES DOIS ATRIBUTOS ──────────────────────
 *
 * Um elemento que leva uma classe de SAÍDA (`.bo-saida` e variantes, ou as
 * constantes `SAIDA` / `SAIDA_FOLHA` de `ui/saida.ts`) tem de levar, na MESMA
 * etiqueta:
 *
 *   · `aria-hidden` — tira-o da árvore de acessibilidade. É este que faz o
 *     trabalho todo, e é por isso que o `role` que lá fique não interessa: o
 *     `aria-hidden` ganha-lhe. Um `role="dialog"` com nome, vivo durante a
 *     saída, é um diálogo que ainda se ouve por cima do ecrã a que se acabou de
 *     voltar.
 *   · `inert` — tira-o do fio do teclado (e dos toques, mas esses a classe já
 *     larga por dentro). Sem ele, os itens de um menu a fechar-se continuam
 *     alcançáveis por Tab durante 200 ms.
 *
 * Os dois, e não um: `aria-hidden` não tira do Tab, e `inert` não é suportado
 * em todo o lado com a mesma força. São a mesma frase dita a dois públicos.
 *
 * ── O QUE ESTA VARREDURA NÃO PRENDE ───────────────────────────────────────
 *
 * O FOCO. Marcar o nó `inert` não move o foco de sítio: se ele estava lá
 * dentro, o browser larga-o e ele cai no `<body>`. Isso mede-se a correr, e
 * está no `o-foco-volta-de-quem-sai.test.tsx` — foi assim que se apanharam o
 * `ModelosParciais` e o «Novo no calendário».
 *
 * E não prende os VÉUS. Um véu é um `<div>` sem texto e sem `role`: não chega
 * a entrar na árvore, portanto exigir-lhe `aria-hidden` seria uma regra sem
 * defeito por trás. (A casa marca-os na mesma, em cinco dos seis sítios; a
 * excepção é o da paleta de comandos, e é só isso — uma inconsistência, não um
 * defeito.)
 *
 * ── A DÍVIDA, E PORQUE É QUE ELA ESTÁ ESCRITA AQUI ────────────────────────
 *
 * Dois ficheiros falham esta regra hoje e não são meus para corrigir nesta
 * ronda. Ficam nomeados, com a alteração mínima escrita ao lado, e o teste do
 * fundo garante que a lista só ENCOLHE: no dia em que um deles for corrigido, a
 * entrada tem de sair daqui, senão o ficheiro fica vermelho. Uma lista de
 * excepções que ninguém volta a olhar é o mesmo que não ter regra nenhuma.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)");

/**
 * O que falha hoje, e o que lhe falta. Só encolhe — ver o último teste.
 *
 *  · `AdminClient.tsx` — a gaveta do pedido. Leva `inert` e não leva
 *    `aria-hidden`, e mantém `role="dialog"`, `aria-modal="true"` e o
 *    `aria-labelledby` durante a saída (são regidos por `isDetailOverlay`, que
 *    é a LARGURA do ecrã e não muda quando ela fecha). Medido: com a gaveta a
 *    sair, o `getByRole("dialog")` ainda a encontra pelo nome.
 *    Alteração mínima: `aria-hidden={painelASair || undefined}` na mesma
 *    etiqueta, e trocar as três condições de `isDetailOverlay` para
 *    `isDetailOverlay && !painelASair`.
 *    (E há um segundo defeito no mesmo sítio, que esta varredura não vê: o
 *    `useFocusTrap(!!selected && isDetailOverlay)` continua ARMADO durante a
 *    saída, porque `selected` só cai ao fim dos 200 ms — ou seja o foco só
 *    volta 200 ms depois do gesto. `&& !painelASair` resolve os dois.)
 *
 *  · `Toast.tsx` — o aviso que sai. Não leva nem um nem outro: o «×» continua
 *    a ser encontrado pelo `getByRole` e a mensagem fica na região
 *    `role="alert"` durante os 200 ms.
 *    Alteração mínima: `aria-hidden={aSair || undefined}` e `inert={aSair}` no
 *    `<div>` do `ToastItem`.
 */
const DIVIDA: Record<string, string> = {
  "AdminClient.tsx": "a gaveta do pedido — falta o `aria-hidden`",
  "Toast.tsx": "o aviso que sai — faltam os dois",
};

function ficheiros(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheiros(caminho, achados);
    else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * Tira comentários, guardando as quebras de linha: sem isso o número de linha
 * do relatório aponta para outro sítio, e manda-se quem lê procurar o defeito a
 * duzentas linhas de onde ele está. (É a mesma nota do `duracao-com-guarda`.)
 */
function semComentarios(fonte: string): string {
  const guardaQuebras = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte.replace(/\/\*[\s\S]*?\*\//g, guardaQuebras).replace(/^\s*\/\/.*$/gm, guardaQuebras);
}

/**
 * As ETIQUETAS DE ABERTURA de cada elemento JSX — do `<` até ao `>` que o
 * fecha, com chavetas e cordas respeitadas.
 *
 * Uma regex por linha não servia, e a razão é a forma como esta casa escreve
 * JSX: a classe de saída vive num `cn(…)` de oito linhas e o `inert` está a
 * quinze linhas de distância, na mesma etiqueta. O que interessa é o ELEMENTO,
 * não a linha — e ler o elemento inteiro é o que permite dizer «a classe está
 * aqui e o atributo não», que é a frase do defeito.
 *
 * Não é um analisador de TypeScript, e não precisa de ser: só tem de saber
 * onde acaba uma etiqueta. As cordas contam porque um `>` dentro de um texto
 * (`"Ver mais >"`) fechava-a cedo de mais; as chavetas contam porque um `>`
 * dentro de uma expressão (`{a > b ? …}`) fazia o mesmo.
 */
function etiquetasDeAbertura(fonte: string): { texto: string; linha: number }[] {
  const achados: { texto: string; linha: number }[] = [];
  for (let i = 0; i < fonte.length; i++) {
    if (fonte[i] !== "<") continue;
    if (!/[A-Za-z]/.test(fonte[i + 1] ?? "")) continue;
    let j = i + 1;
    let chavetas = 0;
    let corda: string | null = null;
    for (; j < fonte.length; j++) {
      const c = fonte[j];
      if (corda) {
        if (c === "\\") j++;
        else if (c === corda) corda = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") corda = c;
      else if (c === "{") chavetas++;
      else if (c === "}") chavetas--;
      else if (c === ">" && chavetas === 0) break;
      // Um `<` fora de chavetas antes de fechar quer dizer que o que se
      // apanhou não era uma etiqueta (um `a < b` solto, por exemplo).
      else if (c === "<" && chavetas === 0) {
        j = -1;
        break;
      }
    }
    if (j <= 0 || j >= fonte.length) continue;
    achados.push({ texto: fonte.slice(i, j + 1), linha: fonte.slice(0, i).split("\n").length });
    i = j;
  }
  return achados;
}

/**
 * A classe de saída de uma CAIXA — o que tem conteúdo lá dentro.
 *
 * Fora ficam três coisas parecidas e diferentes: a `SAIDA_FUNDO` e a
 * `.bo-saida-fundo` (véus, ver o cabeçalho), o `SAIDA_MS` (um número, que
 * aparece em transições escritas à mão) e a variável `--bo-saida-y` (a
 * distância, usada no `style` da folha arrastada).
 */
const CLASSE_DE_SAIDA = /\bSAIDA_FOLHA\b|\bbo-saida-folha\b|\bSAIDA\b(?!_)|\bbo-saida\b(?![\w-])/;

interface Falta {
  ficheiro: string;
  linha: number;
  falta: string[];
}

function varrer(): Falta[] {
  const faltas: Falta[] = [];
  for (const caminho of ficheiros(RAIZ)) {
    const fonte = semComentarios(readFileSync(caminho, "utf8"));
    for (const { texto, linha } of etiquetasDeAbertura(fonte)) {
      if (!CLASSE_DE_SAIDA.test(texto)) continue;
      const falta: string[] = [];
      if (!/\baria-hidden\b/.test(texto)) falta.push("aria-hidden");
      if (!/\binert\b/.test(texto)) falta.push("inert");
      if (falta.length > 0) {
        faltas.push({ ficheiro: caminho.replace(`${process.cwd()}/`, ""), linha, falta });
      }
    }
  }
  return faltas;
}

const nomeDoFicheiro = (caminho: string) => caminho.slice(caminho.lastIndexOf("/") + 1);

describe("uma caixa a sair sai da árvore e do fio do teclado", () => {
  it("a varredura reconhece as caixas a sair — não está a olhar para o vazio", () => {
    // A rede da própria rede. Uma regex partida, um extractor que devolve zero
    // etiquetas, e este ficheiro passava a verde sem ver nada — que é a pior
    // espécie de varredura, porque parece que prova.
    let caixas = 0;
    for (const caminho of ficheiros(RAIZ)) {
      const fonte = semComentarios(readFileSync(caminho, "utf8"));
      for (const { texto } of etiquetasDeAbertura(fonte)) {
        if (CLASSE_DE_SAIDA.test(texto)) caixas++;
      }
    }
    // Doze à data desta ronda, em nove ficheiros. O número só sobe.
    expect(caixas).toBeGreaterThanOrEqual(12);
  });

  it("nenhuma caixa a sair fica anunciada nem alcançável pelo Tab", () => {
    const faltas = varrer().filter((f) => !(nomeDoFicheiro(f.ficheiro) in DIVIDA));
    expect(
      faltas.map((f) => `${f.ficheiro}:${f.linha} — falta ${f.falta.join(" e ")}`),
      "uma classe de saída sem `aria-hidden`/`inert` deixa a caixa viva para " +
        "quem ouve o ecrã e para quem anda de Tab durante os 200 ms da saída",
    ).toEqual([]);
  });

  it("e a lista da dívida só encolhe: nada lá dentro que já esteja corrigido", () => {
    const aindaFalham = new Set(varrer().map((f) => nomeDoFicheiro(f.ficheiro)));
    const jaCorrigidos = Object.keys(DIVIDA).filter((f) => !aindaFalham.has(f));
    expect(
      jaCorrigidos,
      "estes já cumprem a regra — tira-os do `DIVIDA` para ela passar a valer para eles",
    ).toEqual([]);
  });
});
