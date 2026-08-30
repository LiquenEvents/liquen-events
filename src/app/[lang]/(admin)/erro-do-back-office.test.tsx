// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import ErroDoBackOffice from "./error";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE TEM DE TER O SEU PRÓPRIO ECRÃ DE ERRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO QUE ISTO PRENDE. Não havia `error.tsx` em `(admin)`. Uma excepção
 * num componente de cliente do back office subia até ao `app/global-error.tsx`
 * e a equipa lia:
 *
 *     «Algo correu mal. Pedimos desculpa pelo incómodo. Tente novamente — se o
 *      problema persistir, contacte-nos diretamente.»
 *
 * Três regras da casa violadas de uma vez: a frase «algo correu mal» está
 * proibida pelo nome; o back office escreve-se por TU e aquilo está em «você»;
 * e convida quem trabalha cá a contactar a própria empresa.
 *
 * ── PORQUE É QUE ESTE FICHEIRO LÊ A FONTE E TAMBÉM DESENHA ────────────────
 *
 * As duas coisas apanham defeitos diferentes, e nenhuma sozinha chega.
 *
 * Desenhar prova o comportamento — que os botões existem, que o `reset` é
 * chamado, que a marca do erro aparece. Mas não prova a AUSÊNCIA de uma frase:
 * um texto proibido pode estar num ramo que este desenho não visita.
 *
 * Ler a fonte prova a ausência. Só que a fonte tem comentários, e este ficheiro
 * e o `error.tsx` explicam ambos o defeito CITANDO a frase proibida — portanto
 * uma procura ingénua encontrá-la-ia na explicação e reprovaria uma correcção
 * que está certa. É a mesma armadilha que já apanhei na fita de clientes, onde
 * duas regras passavam com o defeito reposto porque as palavras que elas
 * procuravam viviam nos comentários que as explicavam.
 *
 * Por isso a fonte é lida SEM COMENTÁRIOS, e só o que sobra — o que a equipa
 * pode mesmo vir a ler no ecrã — é que conta.
 */

const RAIZ = process.cwd();
const CAMINHO = "src/app/[lang]/(admin)/error.tsx";

/** O código do ecrã, sem comentários: só o que pode chegar aos olhos de quem lá trabalha. */
function fonteSemComentarios(): string {
  return readFileSync(join(RAIZ, CAMINHO), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

afterEach(cleanup);

describe("o ecrã de erro do back office", () => {
  it("existe — sem ele, a equipa cai no ecrã do sítio público", () => {
    expect(
      existsSync(join(RAIZ, CAMINHO)),
      "não há `error.tsx` em `(admin)`: um erro no back office volta a cair no " +
        "`global-error.tsx`, que diz «algo correu mal» em «você»",
    ).toBe(true);
  });

  it("CONTROLO POSITIVO: a fonte foi mesmo lida e ainda tem texto depois de limpa", () => {
    // Sem isto, um caminho errado dava uma cadeia vazia e as três regras
    // seguintes passavam por não encontrarem nada — que é o defeito ao
    // contrário: «não diz a frase proibida» é trivialmente verdade num
    // ficheiro que não se leu.
    const limpo = fonteSemComentarios();
    expect(limpo.length, "a fonte veio vazia").toBeGreaterThan(400);
    expect(limpo, "não parece o ecrã de erro").toContain("reset");
  });

  it("NUNCA diz «algo correu mal» — é a frase que a regra dela proíbe pelo nome", () => {
    expect(
      fonteSemComentarios().toLowerCase(),
      "voltou a frase que a regra proíbe: «se falhar, dizer o que aconteceu, " +
        "porquê e o que fazer — nunca «algo correu mal»",
    ).not.toMatch(/algo correu mal/);
  });

  it("fala por TU, como o resto do back office", () => {
    const limpo = fonteSemComentarios();
    // «você», e as formas verbais de cortesia que arrastam o mesmo tratamento.
    expect(limpo, "apareceu «você» no back office").not.toMatch(/\bvocê\b/i);
    expect(limpo, "apareceu uma forma de cortesia («tente», «contacte»…)").not.toMatch(
      /\b(tente|contacte|recarregue|aguarde|desculpe)\b/i,
    );
    // E prova pela positiva que trata por tu, senão bastava não dizer nada.
    expect(limpo, "não trata a pessoa por tu em lado nenhum").toMatch(
      /\b(tenta|tinhas|contares|podes)\b/i,
    );
  });

  it("não manda a equipa contactar a empresa onde trabalha", () => {
    expect(fonteSemComentarios().toLowerCase()).not.toMatch(/contacte-nos|contacta-nos/);
  });

  it("diz o que aconteceu, o que fazer, e que o trabalho não se perdeu", () => {
    render(<ErroDoBackOffice error={new Error("rebentou")} reset={() => {}} />);

    // O que aconteceu — nomeado, não «algo».
    expect(screen.getByRole("heading").textContent).toMatch(/parou/i);

    // O que não se perdeu, e para onde ir buscar o que ficou por gravar.
    expect(document.body.textContent).toMatch(/guardado/i);
    expect(
      document.body.textContent,
      "não aponta para o «Guardar tudo», que é quem sabe nomear o que falta",
    ).toMatch(/Guardar tudo/);

    // O que fazer, nas duas ordens de custo.
    expect(screen.getByRole("button", { name: /tentar outra vez/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /recarregar/i })).toBeTruthy();
  });

  it("«Tentar outra vez» volta a desenhar em vez de recarregar a página", () => {
    /**
     * A diferença importa: `reset()` volta a montar só o ramo que caiu e não
     * atira fora o que está em memória noutros ecrãs. Recarregar atira. Se
     * alguém trocar este botão por um `location.reload()`, o ecrã continua a
     * parecer igual e passa a custar trabalho — por isso é uma regra.
     */
    const reset = vi.fn();
    render(<ErroDoBackOffice error={new Error("rebentou")} reset={reset} />);
    screen.getByRole("button", { name: /tentar outra vez/i }).click();
    expect(reset, "o botão principal deixou de chamar o `reset`").toHaveBeenCalledTimes(1);
  });

  it("mostra a marca do erro, que é o que o torna diagnosticável", () => {
    const erro = Object.assign(new Error("rebentou"), { digest: "a1b2c3d4" });
    render(<ErroDoBackOffice error={erro} reset={() => {}} />);
    expect(
      document.body.textContent,
      "sem a marca, «rebentou-me uma coisa ontem» não se investiga",
    ).toContain("a1b2c3d4");
  });

  it("sem marca, não desenha uma caixa vazia à espera dela", () => {
    render(<ErroDoBackOffice error={new Error("rebentou")} reset={() => {}} />);
    expect(document.body.textContent).not.toMatch(/este número/i);
  });
});
