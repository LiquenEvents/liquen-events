import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { chaveDoPdf } from "./proposal-pdf-chave";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMINHO RÁPIDO DO PDF NÃO PODE CARREGAR O DESENHADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero que isto se torne ultra rápido».
 *
 * Abrir a proposta em PDF já não desenha nada no caso normal: o ficheiro fica
 * guardado no envio, e as duas rotas que o servem — a do link do casal e a do
 * portal — mandam o browser directamente ao armazenamento com um endereço
 * assinado. Três passos, e nenhum deles precisa de desenhar.
 *
 * Só que a `chaveDoPdf` vivia no `proposal-pdf-cache`, que importa o
 * `proposal-doc-render`, que importa o `pdf-lib` e o `sharp`. Um `import` no
 * topo do ficheiro é pago SEMPRE: cada clique carregava o desenhador inteiro
 * para depois não o usar. Medido nesta máquina, com o disco quente: `pdf-lib`
 * 135 ms, `sharp` 77 ms — 212 ms antes da primeira linha do handler.
 *
 * Esta rede guarda a separação. É um teste de IMPORTAÇÕES e não de
 * comportamento, de propósito: o custo que ela sente não se vê no resultado da
 * função — vê-se no que a função arrasta consigo para a memória antes de
 * começar. Nenhum teste de comportamento o apanharia.
 */

const ROTAS = [
  "src/app/api/proposta/[token]/pdf/route.ts",
  "src/app/api/portal/[token]/proposta-pdf/route.ts",
];

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("o caminho rápido do PDF", () => {
  it("não importa o `proposal-pdf-cache` no topo — só quando tem de desenhar", () => {
    for (const rota of ROTAS) {
      const src = ler(rota);
      const noTopo = /^import[^;]*from "@\/lib\/proposal-pdf-cache";/m.test(src);
      expect(
        noTopo,
        `${rota} voltou a importar o \`proposal-pdf-cache\` no topo — e com ele o \`pdf-lib\` e ` +
          `o \`sharp\`, em todos os pedidos, incluindo os que só reencaminham.`,
      ).toBe(false);

      expect(src, `${rota} deixou de carregar o desenhador onde precisa dele`).toContain(
        'await import("@/lib/proposal-pdf-cache")',
      );
    }
  });

  it("e a chave e o erro vêm de um módulo que não traz o desenhador", () => {
    const leve = ler("src/lib/proposal-pdf-chave.ts");
    // A prova é pela negativa e tem de o ser: o que importa é o que este
    // ficheiro NÃO arrasta.
    for (const pesado of ["proposal-doc-render", "pdf-lib", "sharp", "proposal-pdf-cache"]) {
      expect(
        leve.includes(`"${pesado}"`) || leve.includes(`/${pesado}"`),
        `o \`proposal-pdf-chave\` passou a importar \`${pesado}\` — deixou de ser leve, e o ` +
          `caminho rápido volta a pagar o desenhador`,
      ).toBe(false);
    }
    for (const rota of ROTAS) {
      expect(ler(rota)).toContain('from "@/lib/proposal-pdf-chave"');
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CHAVE É UM CONTRATO COM O ARMAZENAMENTO — E JÁ SE PARTIU UMA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O PDF fica guardado em `<proposta>/<chave>.pdf`. Quem o vai buscar calcula a
 * chave outra vez a partir do documento. Ou seja: a chave é um CONTRATO entre
 * quem guarda e quem lê, e os dois lados só se encontram se calcularem o mesmo.
 *
 * ── O QUE ACONTECEU, E PORQUE É QUE NINGUÉM VIU ───────────────────────────
 *
 * A 26 de Agosto entrou a ordenação das chaves (o `canonico`), pela melhor das
 * razões: sem ela, o mesmo documento dava chaves diferentes conforme a ordem
 * em que as propriedades calhassem. Só que a partir desse dia os ficheiros
 * guardados ANTES ficaram numa chave que mais ninguém calcula.
 *
 * O efeito é invisível: nada rebenta, nada avisa, nenhum teste fica vermelho.
 * O que acontece é que o casal que abre um email de 23 de Agosto volta a
 * esperar segundos pelo desenho — e fica um ficheiro órfão de meio mega a
 * quatro megas no armazenamento, pago e inútil.
 *
 * Nenhum teste desta casa fixava a chave. Estes fixam-na. Se alguém voltar a
 * mexer no `canonico`, no formato ou no corte dos 32 caracteres, isto fica
 * vermelho ANTES de a mudança apagar o trabalho já guardado — e quem a fizer
 * sabe que tem de a fazer de propósito, e de aquecer o que ficou para trás.
 */
describe("a chave do PDF guardado", () => {
  /** Um documento fixo, com as propriedades por uma ordem qualquer. */
  const doc = {
    clientNames: "Ana e Rui",
    eventDate: "2027-09-18",
    paginas: [{ especie: "capa", titulo: "Ana e Rui" }],
  } as never;

  it("dá exactamente esta chave, e não outra", () => {
    // Os valores não têm nada de especial: são o que a função dá hoje. O que
    // vale é serem FIXOS — é a diferença entre uma mudança de formato ser uma
    // decisão e ser um acidente que só se descobre pelas queixas.
    expect(
      chaveDoPdf(doc, "pt"),
      "a chave mudou: os PDF já guardados deixam de ser encontrados",
    ).toBe("L6jpG-KUZ2xDS-vcX_11ME6C3PdGvZ-F");
    expect(chaveDoPdf(doc, "en"), "a chave em inglês mudou").toBe(
      "58vnuaqs4gYa-RHGgu1cYut_jcrKLAF5",
    );
  });

  it("a ordem das propriedades não conta — é para isso que o `canonico` existe", () => {
    // O mesmo documento escrito por outra ordem. Sem o `canonico`, um
    // documento vindo da base e o mesmo documento em memória davam chaves
    // diferentes, e o ficheiro guardado nunca era encontrado.
    const trocado = {
      paginas: [{ titulo: "Ana e Rui", especie: "capa" }],
      eventDate: "2027-09-18",
      clientNames: "Ana e Rui",
    } as never;
    expect(chaveDoPdf(trocado, "pt")).toBe(chaveDoPdf(doc, "pt"));
  });

  it("mas a língua conta", () => {
    // O mesmo documento em duas línguas são dois ficheiros. Partilhar a chave
    // dava o documento português a um casal inglês — e é o casal inglês que
    // abre o link a partir do email que recebeu em inglês.
    expect(chaveDoPdf(doc, "pt")).not.toBe(chaveDoPdf(doc, "en"));
  });

  it("e um documento diferente dá uma chave diferente", () => {
    // O controlo positivo: sem isto, uma função que devolvesse sempre a mesma
    // cadeia passava os três casos de cima.
    const outro = { ...(doc as object), clientNames: "Sofia e Rui" } as never;
    expect(chaveDoPdf(outro, "pt")).not.toBe(chaveDoPdf(doc, "pt"));
  });
});
