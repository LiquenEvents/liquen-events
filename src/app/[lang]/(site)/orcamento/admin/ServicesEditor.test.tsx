// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ServicesEditor from "./ServicesEditor";
import { ToastProvider } from "./Toast";
import type { ServiceGroup } from "@/lib/proposal-doc";

/**
 * OS SERVIÇOS ESCREVEM-SE COM O TECLADO.
 *
 * É a secção mais escrita do estúdio — dezenas de linhas por proposta, muitas
 * vezes com o cliente ao telefone. Antes, cada linha custava duas carregadas de
 * rato (o "+ Adicionar item" e depois o campo, porque nada punha o cursor em
 * lado nenhum). Estes testes prendem o caminho que substitui isso: escrever,
 * Enter, escrever — e o que acontece quando se erra (apagar e anular).
 */

/** O editor é controlado; aqui é o estado do estúdio que o segura. */
function Host({ initial, onSave }: { initial: ServiceGroup[]; onSave?: () => void }) {
  const [groups, setGroups] = useState<ServiceGroup[]>(initial);
  return (
    <ServicesEditor
      groups={groups}
      onGroupsChange={(update) => setGroups((prev) => update(prev))}
      onSave={onSave}
    />
  );
}

const grupo = (items: string[]): ServiceGroup[] => [
  { id: "g1", letter: "a)", title: "Decoração Floral", items: items.map((label) => ({ label })) },
];

const linha = (n: number) => screen.getByLabelText(`Linha ${n} do grupo 1`) as HTMLInputElement;
const linhas = () => screen.getAllByLabelText(/^Linha \d+ do grupo 1$/) as HTMLInputElement[];

afterEach(cleanup);

describe("teclado", () => {
  it("Enter cria a linha seguinte e põe lá o cursor", async () => {
    render(<Host initial={grupo([""])} />);
    const user = userEvent.setup();

    await user.click(linha(1));
    await user.keyboard("Reunião inicial{Enter}");

    expect(linhas()).toHaveLength(2);
    // Sem uma ida ao rato pelo meio: a segunda linha já está debaixo dos dedos.
    expect(document.activeElement).toBe(linha(2));
    await user.keyboard("Montagem{Enter}Desmontagem");

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem", "Desmontagem"]);
  });

  it("Enter numa linha VAZIA fecha o grupo e abre outro, com o cursor no título", async () => {
    render(<Host initial={grupo(["Reunião inicial", ""])} />);
    const user = userEvent.setup();

    await user.click(linha(2));
    await user.keyboard("{Enter}");

    // A linha vazia não fica para trás. O grupo novo nasce SEM linhas — a
    // primeira aparece quando for pedida, com Enter no título ou no botão —,
    // por isso continua a haver uma única "Linha 1", a do grupo que ficou.
    expect(screen.getAllByLabelText(/^Linha 1 do grupo \d+$/)).toHaveLength(1);
    expect(screen.queryByLabelText("Linha 2 do grupo 1")).toBeNull();
    expect(screen.queryByLabelText("Linha 1 do grupo 2")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Título do grupo 2"));
    // …e o marcador do grupo novo numera-se sozinho.
    expect((screen.getByLabelText(/^Marcador do grupo 2/) as HTMLInputElement).value).toBe("b)");
  });

  it("Backspace numa linha vazia apaga-a e devolve o cursor ao FIM da anterior", async () => {
    render(<Host initial={grupo(["Reunião inicial", ""])} />);
    const user = userEvent.setup();

    await user.click(linha(2));
    await user.keyboard("{Backspace}");

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial"]);
    const anterior = linha(1);
    expect(document.activeElement).toBe(anterior);
    expect(anterior.selectionStart).toBe("Reunião inicial".length);
    // Um engano não pede confirmação nenhuma: continua-se a escrever.
    await user.keyboard(" com os noivos");
    expect(linha(1).value).toBe("Reunião inicial com os noivos");
  });

  it("Alt+↓ move a linha sem tirar o cursor de lá", async () => {
    render(<Host initial={grupo(["Montagem", "Reunião inicial"])} />);
    const user = userEvent.setup();

    await user.click(linha(1));
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem"]);
    expect(document.activeElement).toBe(linha(2));
  });

  it("Ctrl+Enter grava", async () => {
    const onSave = vi.fn();
    render(<Host initial={grupo(["Reunião inicial"])} onSave={onSave} />);
    const user = userEvent.setup();

    await user.click(linha(1));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("colar em lote", () => {
  it("colar 3 linhas de texto cria 3 linhas de serviço", async () => {
    render(<Host initial={grupo([""])} />);
    const user = userEvent.setup();

    await user.click(linha(1));
    await user.paste("Reunião inicial\nMontagem\nDesmontagem");

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem", "Desmontagem"]);
    // O cursor fica na última, pronto para continuar a lista.
    expect(document.activeElement).toBe(linha(3));
  });

  it("limpa os marcadores de lista que vêm colados do email", async () => {
    render(<Host initial={grupo([""])} />);
    const user = userEvent.setup();

    await user.click(linha(1));
    await user.paste("- Reunião inicial\n2. Montagem\n• Desmontagem\n\n");

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem", "Desmontagem"]);
  });
});

describe("anular", () => {
  it("Ctrl+Z desfaz uma remoção", async () => {
    render(<Host initial={grupo(["Reunião inicial", "Montagem"])} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Remover linha 2 do grupo 1"));
    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial"]);
    // Em vez de uma pergunta ANTES, o caminho de volta fica à vista DEPOIS.
    expect(screen.getByText("Linha removida")).toBeTruthy();

    await user.keyboard("{Control>}z{/Control}");

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem"]);
  });

  it("o «Anular» do aviso repõe a linha removida", async () => {
    render(<Host initial={grupo(["Reunião inicial", "Montagem"])} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Remover linha 2 do grupo 1"));
    await user.click(screen.getByRole("button", { name: "Anular" }));

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem"]);
    expect(screen.queryByText("Linha removida")).toBeNull();
  });

  it("Ctrl+Z repõe um grupo inteiro, com as suas linhas", async () => {
    render(<Host initial={grupo(["Reunião inicial", "Montagem"])} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Remover grupo 1"));
    expect(screen.queryAllByLabelText(/^Linha \d+ do grupo 1$/)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Anular" }));

    expect(linhas().map((i) => i.value)).toEqual(["Reunião inicial", "Montagem"]);
    expect((screen.getByLabelText("Título do grupo 1") as HTMLInputElement).value).toBe(
      "Decoração Floral",
    );
  });
});

describe("identidade das linhas", () => {
  it("preenche ids em falta pela POSIÇÃO, sem os sortear", async () => {
    // Um rascunho antigo (sem ids) tem de ficar arrastável e reordenável sem
    // que o React reutilize o nó errado — e sem que o documento passe a
    // serializar diferente a cada abertura.
    render(<Host initial={[{ letter: "a)", title: "Grupo", items: [{ label: "Um" }] }]} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Duplicar linha 1 do grupo 1"));
    expect(linhas().map((i) => i.value)).toEqual(["Um", "Um"]);

    // Escrever numa das cópias não mexe na outra (chaves distintas).
    await user.clear(linha(2));
    await user.type(linha(2), "Dois");
    expect(linhas().map((i) => i.value)).toEqual(["Um", "Dois"]);
  });
});

describe("alinhamento", () => {
  it("os campos do grupo alinham à esquerda, marcador incluído", () => {
    // O marcador ("a)") nasceu centrado. Um campo de texto centrado faz o
    // cursor saltar de sítio enquanto se escreve, e num editor onde se escreve
    // com o cliente ao telefone isso lê-se como o programa a tremer. Este teste
    // existe porque `text-center` é uma classe que volta sozinha.
    render(<Host initial={grupo(["Uma linha"])} />);

    for (const campo of [
      screen.getByLabelText(/^Marcador do grupo 1/),
      screen.getByLabelText("Título do grupo 1"),
      screen.getByLabelText("Linha 1 do grupo 1"),
    ]) {
      expect(campo.className).not.toMatch(/\btext-center\b/);
    }
  });
});

describe("guardar na biblioteca", () => {
  const chamadas = () =>
    (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("/api/servicos-catalogo"),
    );

  function comRede(ok = true) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => ({}) })),
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it("manda o nome e a descrição, e depois diz que já lá está", async () => {
    comRede();
    render(<Host initial={grupo(["Arco floral"])} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Guardar «Arco floral» na biblioteca"));

    await screen.findByLabelText("«Arco floral» está na biblioteca");
    const [url, init] = chamadas()[0] as [string, RequestInit];
    expect(url).toBe("/api/servicos-catalogo");
    expect(JSON.parse(String(init.body)).nome).toBe("Arco floral");
    // E fica desligado: carregar outra vez sobre o mesmo serviço não acrescenta
    // nada à biblioteca e só levanta a dúvida de se a primeira resultou.
    expect(screen.getByLabelText("«Arco floral» está na biblioteca")).toBeDisabled();
  });

  it("uma linha em branco não tem botão nenhum", () => {
    comRede();
    render(<Host initial={grupo([""])} />);
    // Guardar "" não é um serviço: é uma entrada em branco que alguém ia ter de
    // ir apagar à biblioteca.
    expect(screen.queryByLabelText(/na biblioteca/)).toBeNull();
  });

  it("se a gravação falhar, o botão volta a poder ser carregado", async () => {
    comRede(false);
    render(<Host initial={grupo(["Arco floral"])} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Guardar «Arco floral» na biblioteca"));

    // Um visto sobre uma gravação que não aconteceu é pior do que não haver
    // visto nenhum: manda-a embora convencida de que ficou guardado.
    await screen.findByLabelText("Guardar «Arco floral» na biblioteca");
    expect(screen.getByLabelText("Guardar «Arco floral» na biblioteca")).not.toBeDisabled();
  });

  /**
   * ── O BOTÃO QUE VOLTA AO SÍTIO NÃO CHEGA ─────────────────────────────────
   *
   * O teste de cima prende metade: o botão fica outra vez carregável. Só que o
   * ecrã que ele deixa é, ao pixel, o de quem AINDA NÃO carregou em nada — e
   * ela sai dali convencida de que o serviço está na biblioteca. Resultar
   * continua a não dizer nada (o visto aparece no próprio botão, à vista);
   * falhar tem de o dizer.
   */
  it("se a gravação falhar, DIZ que o serviço não foi para a biblioteca", async () => {
    comRede(false);
    render(
      <ToastProvider>
        <Host initial={grupo(["Arco floral"])} />
      </ToastProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Guardar «Arco floral» na biblioteca"));

    // A frase nomeia o serviço — na proposta há dezenas de linhas, e uma delas
    // é que falhou.
    expect(
      await screen.findByText(
        "«Arco floral» não foi para a biblioteca. Tenta outra vez — a linha aqui não se perde.",
      ),
    ).toBeTruthy();
  });

  it("quando resulta, não há aviso nenhum — o visto está no próprio botão", async () => {
    comRede();
    render(
      <ToastProvider>
        <Host initial={grupo(["Arco floral"])} />
      </ToastProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Guardar «Arco floral» na biblioteca"));

    await screen.findByLabelText("«Arco floral» está na biblioteca");
    expect(screen.queryByText(/não foi para a biblioteca/)).toBeNull();
  });
});

describe("ergonomia táctil", () => {
  it("a pega de arrasto sai do caminho em ecrã táctil", () => {
    // Mediam 16×24: com o dedo, agarrar uma linha era acertar num alvo mais
    // estreito do que a própria unha. Dar-lhes `alvo-toque` trocou o defeito
    // por um pior — numa linha de 375 px já vivem seis botões de 44 px, e a
    // pega a crescer espremeu o CAMPO DE ESCREVER para 25 px.
    //
    // Em telemóvel a pega é redundante (as setas reordenam com um toque
    // simples e já têm 44 px), por isso desaparece e devolve a largura a quem
    // dela precisa. Com rato fica como estava.
    render(<Host initial={grupo(["Uma linha"])} />);

    const pegas = screen.getAllByRole("button", { name: /Arrastar (grupo|linha)/ });
    expect(pegas.length).toBeGreaterThan(0);
    for (const pega of pegas) {
      expect(
        pega.className,
        `A pega «${pega.getAttribute("aria-label")}» continua a ocupar largura em ecrã táctil`,
      ).toContain("[@media(pointer:coarse)]:hidden");
      // E NÃO pode ter `alvo-toque`: era essa a correcção que espremeu o campo.
      expect(pega.className).not.toContain("alvo-toque");
    }
  });

  it("as setas continuam lá, que são o caminho do telemóvel", () => {
    render(<Host initial={grupo(["Uma", "Duas"])} />);
    // Se a pega desaparece no telemóvel, reordenar passa a depender delas.
    expect(
      screen.getAllByRole("button", { name: /Mover .* para (cima|baixo)/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe("o nome do serviço cabe todo", () => {
  /**
   * ── PORQUE É QUE ISTO É UM `<textarea>` E NÃO UM `<input>` ────────────────
   * Palavras dela, de uma fotografia do telemóvel: «Decoração Floral do
   * Casamen». Num `<input>`, o texto que não cabe não existe — desliza para
   * fora e só se lê pondo o cursor lá dentro. MEDIDO a 375 px: a caixa tem
   * 241 px de texto útil e um nome desta casa pede 388 — 147 px de letra, umas
   * duas dúzias de caracteres, escondidos sem nada a dizê-lo.
   *
   * O `<textarea>` de uma linha que cresce mostra-os. O que este teste prende é
   * o preço que isso NÃO pode ter: o Enter é o atalho mais usado do editor, e
   * num `<textarea>` seria uma quebra de linha dentro do nome do serviço — que
   * seguia assim para o PDF.
   */
  it("é uma caixa que cresce, e o Enter continua a abrir a linha seguinte em vez de partir o nome", async () => {
    render(<Host initial={grupo([""])} />);
    const user = userEvent.setup();

    const campo = linha(1);
    expect(campo.tagName).toBe("TEXTAREA");

    await user.click(campo);
    await user.keyboard("Arco floral de cerimónia em tons de branco e verde{Enter}");

    // O nome ficou inteiro e numa peça só — sem a quebra que um `<textarea>`
    // teria posto lá.
    expect(linha(1).value).toBe("Arco floral de cerimónia em tons de branco e verde");
    expect(linha(1).value).not.toContain("\n");
    // E o Enter fez o que sempre fez.
    expect(linhas()).toHaveLength(2);
    expect(document.activeElement).toBe(linha(2));
  });
});
