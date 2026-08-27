import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA COR QUE NÃO EXISTE NÃO DÁ ERRO — DÁ TEXTO INVISÍVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O caso que obrigou este ficheiro a existir, e que chegou ao telemóvel dela
 * duas vezes:
 *
 *     "bg-foreground … text-background"
 *
 * O `@theme` do `globals.css` define `--color-foreground`. NÃO define
 * `--color-background`. Uma classe do Tailwind apontada a um token inexistente
 * não é um erro de compilação nem um aviso: simplesmente não gera regra
 * nenhuma. O texto ficou com a cor herdada — a mesma do fundo do botão.
 *
 * Preto sobre preto. E como aquele botão passava a maior parte do tempo
 * desactivado e cinzento, ninguém deu por isso durante meses; quando o fundo
 * desactivado foi corrigido, o botão apareceu como um rectângulo preto sem uma
 * letra, num ecrã de Definições, num iPhone, numa quinta.
 *
 * Nada disto se vê a ler o código: `text-background` lê-se perfeitamente bem.
 * Vê-se no ecrã, e só se o botão estiver no estado certo. Por isso a
 * verificação tem de ser mecânica.
 *
 * ── O QUE ESTE TESTE FAZ ──────────────────────────────────────────────────
 * Lê os tokens `--color-*` que o `@theme` declara, varre os `.tsx` do back
 * office à procura de classes de cor, e exige que cada nome usado exista — no
 * tema, ou na paleta que vem com o Tailwind.
 *
 * ── PORQUE É QUE HÁ UMA LISTA DE PALAVRAS A IGNORAR ───────────────────────
 * Os prefixos das classes de cor são partilhados com utilitários que não têm
 * cor nenhuma: `text-sm` é um tamanho, `border-t` é um lado, `bg-cover` é um
 * enquadramento. Não há forma de os distinguir pela forma — só pelo nome. A
 * lista abaixo é essa fronteira, e é deliberadamente CURTA: se aparecer um
 * utilitário novo que não seja cor, o teste falha e acrescenta-se aqui. É
 * preferível a um falso negativo, que é exactamente o defeito que estamos a
 * tentar apanhar.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Os `--color-*` declarados no bloco `@theme`. */
function tokensDoTema(): Set<string> {
  const bloco = CSS.slice(CSS.indexOf("@theme"));
  const fim = bloco.indexOf("\n}");
  const nomes = bloco.slice(0, fim).match(/--color-([a-z0-9-]+)\s*:/g) ?? [];
  return new Set(nomes.map((n) => n.replace(/--color-|\s*:/g, "")));
}

/** As cores que vêm com o Tailwind e não precisam de token nenhum. */
const DO_TAILWIND = new Set(["white", "black", "transparent", "current", "inherit"]);

/**
 * Palavras que seguem um prefixo de cor sem serem cor. Curta de propósito —
 * ver o comentário de abertura.
 */
const NAO_SAO_COR = new Set([
  // text-*
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
  // bg-*
  "cover",
  "contain",
  "no",
  "fixed",
  "local",
  "scroll",
  "auto",
  "bottom",
  "top",
  "repeat",
  "none",
  "origin",
  "clip-text",
  "gradient-to-b",
  "gradient-to-r",
  "gradient-to-t",
  "gradient-to-l",
  "gradient-to-br",
  "gradient-to-tr",
  // border-* / divide-*
  "t",
  "b",
  "l",
  "r",
  "x",
  "y",
  "s",
  "e",
  "solid",
  "dashed",
  "dotted",
  "double",
  "hidden",
  "collapse",
  "separate",
  "spacing",
  // ring-* / outline-* / shadow-*
  "inset",
  "offset",
  "md",
  "2xl",
  "3xl",
  "inner",
  "dark",
  "light",
]);

/** Prefixos do Tailwind que aceitam uma cor. */
/* Do mais longo para o mais curto, e isso NÃO é arrumação: com `ring` antes de
   `ring-offset`, um `ring-offset-white` casava com `ring` e dava o nome
   `offset-white`, que não existe em tema nenhum — uma acusação falsa vinda da
   ordem de uma lista. */
const PREFIXOS = [
  "ring-offset",
  "placeholder",
  "decoration",
  "outline",
  "divide",
  "border",
  "accent",
  "shadow",
  "stroke",
  "caret",
  "text",
  "fill",
  "from",
  "ring",
  "via",
  "bg",
  "to",
];

function tsxDoBackOffice(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return tsxDoBackOffice(caminho);
    return e.isFile() && e.name.endsWith(".tsx") && !e.name.includes(".test.") ? [caminho] : [];
  });
}

/**
 * Só se olha para DENTRO de cadeias de texto, e com os comentários fora.
 *
 * As duas primeiras versões deste ficheiro varriam o ficheiro inteiro com uma
 * expressão regular, e deram 186 acusações — nenhuma verdadeira. Ficam as duas
 * lições, porque são as que fazem um teste destes valer alguma coisa ou nada:
 *
 *  · A fronteira `\b` casa DEPOIS de um hífen. `bo-text-muted` — uma classe da
 *    casa, definida no `globals.css` com o contraste medido ao lado — era lida
 *    como `text-muted`, e apareciam 119 acusações de uma classe que existe.
 *  · Português e nomes de propriedades CSS parecem classes: «divide-se»,
 *    «via-o», `text-overflow`, `border-box`.
 *
 * A resposta às duas é a mesma: partir cada cadeia por espaços e exigir que o
 * TOKEN INTEIRO tenha a forma de uma classe. `bo-text-muted` deixa de casar
 * porque não começa por um prefixo; a prosa deixa de casar porque não vive
 * dentro de aspas.
 */
function cadeiasDe(fonte: string): string[] {
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  return [...semComentarios.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
}

/** `hover:disabled:text-muted` → `text-muted`; devolve null se não for classe. */
function corDoToken(token: string): { prefixo: string; nome: string } | null {
  const semVariantes = token.slice(token.lastIndexOf(":") + 1).replace(/^[!-]+/, "");
  // Um valor literal (`text-[#4d6350]`) ou a paleta numerada (`red-500`) não
  // dependem de token nosso — e a opacidade (`/60`) não muda a cor.
  const limpo = semVariantes.split("/")[0];
  if (limpo.includes("[")) return null;
  for (const prefixo of PREFIXOS) {
    if (!limpo.startsWith(prefixo + "-")) continue;
    const nome = limpo.slice(prefixo.length + 1);
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(nome)) return null;
    return { prefixo, nome };
  }
  return null;
}

describe("as classes de cor apontam para cores que existem", () => {
  it("o tema declara mesmo as cores que julgamos ter", () => {
    // Se este falhar, o teste seguinte está a medir contra uma lista vazia e
    // passaria por vacuidade — que é o pior resultado possível numa rede.
    const tema = tokensDoTema();
    expect(tema.size).toBeGreaterThan(5);
    expect(tema.has("foreground")).toBe(true);
  });

  it("o varredor reconhece uma classe de cor e recusa o que não é", () => {
    // Sem isto, um varredor que não casasse com NADA passaria sempre.
    expect(corDoToken("text-background")).toEqual({ prefixo: "text", nome: "background" });
    expect(corDoToken("hover:bg-moss")).toEqual({ prefixo: "bg", nome: "moss" });
    expect(corDoToken("text-foreground/60")).toEqual({ prefixo: "text", nome: "foreground" });
    // As três armadilhas que deram 186 falsos positivos.
    expect(corDoToken("bo-text-muted")).toBeNull();
    expect(corDoToken("text-[#4d6350]")).toBeNull();
    expect(corDoToken("text-sm")).not.toBeNull(); // é classe; a lista abaixo é que a dispensa
  });

  it("nenhuma classe de cor do back office aponta para um token inexistente", () => {
    const tema = tokensDoTema();
    const conhecidas = new Set([...tema, ...DO_TAILWIND]);
    const orfas: string[] = [];

    for (const ficheiro of tsxDoBackOffice(RAIZ)) {
      for (const cadeia of cadeiasDe(readFileSync(ficheiro, "utf8"))) {
        for (const token of cadeia.split(/\s+/)) {
          const cor = corDoToken(token);
          if (!cor || NAO_SAO_COR.has(cor.nome) || conhecidas.has(cor.nome)) continue;
          orfas.push(`${ficheiro.replace(process.cwd() + "/", "")} — ${token}`);
        }
      }
    }

    expect(orfas, [...new Set(orfas)].join("\n")).toHaveLength(0);
  });
});
