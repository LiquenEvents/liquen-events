// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Field } from "./Field";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PONTE DO `Field`, QUE VALE POR VINTE CHAMADORES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `ui/Escolha` devolve o VALOR e não um evento — é a API honesta, porque não
 * há `<select>` nenhum de onde o evento pudesse vir. Mas vinte campos desta
 * casa escrevem `onChange={(e) => …e.target.value}`, e reescrevê-los à mão era
 * vinte oportunidades de trocar um valor por um rótulo em silêncio.
 *
 * Por isso o `Field` monta o objecto mínimo que esses vinte lêem. Isto é uma
 * dívida assumida, e uma dívida assumida precisa de duas coisas: estar escrita
 * (está, no `Field.tsx`) e estar MEDIDA — que é este ficheiro.
 *
 * O segundo teste é o que importa a prazo: varre os chamadores a sério e prende
 * o contrato. No dia em que alguém escrever `e.currentTarget.value` ou
 * `e.preventDefault()` num `Field as="select"`, isto fica vermelho AQUI, em vez
 * de dar um `undefined` calado no ecrã dela.
 */

afterEach(cleanup);

describe('`Field as="select"` continua a falar a língua de quem o chama', () => {
  it("o `onChange` recebe um objecto com `target.value`, como sempre recebeu", async () => {
    const u = userEvent.setup();
    const visto: unknown[] = [];
    render(
      <Field
        as="select"
        label="Categoria"
        name="categoria"
        value="a"
        onChange={(e) => visto.push(e.target.value)}
      >
        <option value="a">Alfa</option>
        <option value="b">Beta</option>
      </Field>,
    );

    await u.click(screen.getByLabelText("Categoria"));
    await u.click(screen.getByRole("option", { name: /Beta/ }));
    expect(visto).toEqual(["b"]);
  });

  it("o `name` também chega, para quem o lê do evento", async () => {
    const u = userEvent.setup();
    const nomes: unknown[] = [];
    render(
      <Field
        as="select"
        label="Categoria"
        name="categoria"
        value="a"
        onChange={(e) => nomes.push((e.target as HTMLSelectElement).name)}
      >
        <option value="a">Alfa</option>
        <option value="b">Beta</option>
      </Field>,
    );
    await u.click(screen.getByLabelText("Categoria"));
    await u.click(screen.getByRole("option", { name: /Beta/ }));
    expect(nomes).toEqual(["categoria"]);
  });

  it("o rótulo nomeia mesmo o campo — que num `combobox` não vem do `for`", () => {
    render(
      <Field as="select" label="Estado" value="a" onChange={() => {}}>
        <option value="a">Alfa</option>
      </Field>,
    );
    // Se o `Field` deixasse de pôr `aria-labelledby`, isto não encontrava nada:
    // o `<label for>` sozinho não nomeia um `role="combobox"`.
    const campo = screen.getByRole("combobox", { name: "Estado" });
    expect(campo).toHaveAttribute("aria-labelledby");
  });

  it("`required` e `error` continuam ligados ao campo", () => {
    render(
      <Field
        as="select"
        label="Estado"
        required
        error="Escolhe um estado."
        value=""
        onChange={() => {}}
      >
        <option value="">—</option>
      </Field>,
    );
    const campo = screen.getByRole("combobox", { name: "Estado" });
    expect(campo).toHaveAttribute("aria-required", "true");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    const descrito = campo.getAttribute("aria-describedby");
    expect(document.getElementById(descrito!)).toHaveTextContent("Escolhe um estado.");
  });

  it("um campo sem `value` continua não-controlado, com o `defaultValue` a mandar", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(
      <Field as="select" label="Estado" defaultValue="b" onChange={mudou}>
        <option value="a">Alfa</option>
        <option value="b">Beta</option>
      </Field>,
    );
    const campo = screen.getByLabelText("Estado");
    expect(campo).toHaveTextContent("Beta");
    // E muda sozinho, sem ninguém lhe devolver o valor de fora.
    await u.click(campo);
    await u.click(screen.getByRole("option", { name: /Alfa/ }));
    expect(campo).toHaveTextContent("Alfa");
    expect(mudou).toHaveBeenCalled();
  });
});

describe("o contrato que a ponte assume sobre os chamadores", () => {
  const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

  it('nenhum `Field as="select"` lê do evento mais do que `target.value`', async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const ficheiros: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) andar(caminho);
        else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) ficheiros.push(caminho);
      }
    };
    andar(RAIZ);

    const suspeitos: string[] = [];
    for (const caminho of ficheiros) {
      if (caminho.endsWith("ui/Field.tsx")) continue;
      const fonte = readFileSync(caminho, "utf8");

      /* ── A ETIQUETA DE ABERTURA, E SÓ ELA ────────────────────────────────
         A primeira versão apanhava de `<Field` até ao primeiro `</Field>` e
         lia daí o primeiro `onChange` que encontrasse. Num ecrã como o
         `Material`, onde há um `<Field …/>` de texto ANTES do `as="select"`,
         isso lia o manipulador errado — e o controlo negativo (pôr um
         `e.currentTarget.value` num chamador a sério) ficou VERDE, que é como
         se descobriu.

         Aqui contam-se as chavetas: as propriedades vão do `<Field` até ao `>`
         que fecha a etiqueta de ABERTURA, e um `>` dentro de `{…}` (uma seta,
         uma comparação) não conta. */
      for (const m of fonte.matchAll(/<Field(\s)/g)) {
        let i = m.index! + "<Field".length;
        let chavetas = 0;
        let props = "";
        for (; i < fonte.length; i++) {
          const c = fonte[i];
          if (c === "{") chavetas++;
          else if (c === "}") chavetas--;
          else if ((c === ">" || (c === "/" && fonte[i + 1] === ">")) && chavetas === 0) break;
          props += c;
        }
        if (!/as="select"/.test(props)) continue;
        if (/currentTarget|preventDefault|stopPropagation|\btarget\.(?!value)/.test(props)) {
          const linha = fonte.slice(0, m.index!).split("\n").length;
          suspeitos.push(`${caminho.replace(process.cwd() + "/", "")}:${linha}`);
        }
      }
    }
    // Um teste que percorre zero campos passa sempre. Isto prende o chão.
    const quantos = ficheiros
      .filter((c) => !c.endsWith("ui/Field.tsx"))
      .reduce((n, c) => n + (readFileSync(c, "utf8").match(/as="select"/g)?.length ?? 0), 0);
    expect(quantos, "a varredura tem de ver mesmo os campos").toBeGreaterThan(10);

    expect(
      suspeitos,
      "a ponte do `Field` monta um objecto com `target.value` e `target.name` e mais nada — " +
        "quem precisar de mais do que isso tem de passar a usar o `ui/Escolha` directamente",
    ).toEqual([]);
  });
});
