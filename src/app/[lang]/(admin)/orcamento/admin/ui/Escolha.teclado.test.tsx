// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Escolha } from "./Escolha";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE UM `<select>` DAVA DE GRAÇA, E QUE AQUI TEM DE SER ESCRITO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Substituir um `<select>` é assumir uma dívida: tudo o que o browser fazia
 * sozinho passa a ser código, e código que ninguém experimenta com o teclado
 * apodrece calado. Um substituto mal feito é MUITO pior do que a caixa feia que
 * substitui — quem usa rato não dá por nada e quem não usa fica sem o campo.
 *
 * Por isso este ficheiro não mede desenho nenhum. Mede as sete coisas que a
 * caixa feia fazia:
 *
 *   ↑ ↓ · Home/End · escrever para saltar · Enter/Espaço · Escape · Tab ·
 *   e o foco, que nunca sai do sítio.
 *
 * ── O QUE ESTE FICHEIRO NÃO PODE PROVAR ────────────────────────────────────
 *
 * O jsdom não tem disposição: `offsetHeight` é zero, `getBoundingClientRect`
 * devolve zeros e `scrollIntoView` é um esboço (ver `vitest.setup.ts`). Ou
 * seja: a lista subir quando não há chão por baixo, a opção sob o cursor ficar
 * à vista, e a lista largar mesmo os toques enquanto se apaga — isso mede-se
 * num browser, e está em `e2e/escolha.spec.ts`. Aqui prende-se a LÓGICA.
 *
 * ── E O `matchMedia` DO jsdom DIZ SEMPRE «NÃO» ─────────────────────────────
 *
 * `(pointer: coarse)` é falso, portanto estes testes correm todos no caminho
 * do RATO — que é o que se quer, porque é o caminho que tem código nosso. O
 * caminho do dedo é um `<select>` nativo e tem o seu teste à parte, mais
 * abaixo: o que lá se mede é que ele É nativo.
 */

const OPCOES = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "baixa", rotulo: "Baixa" },
  { valor: "eventos", rotulo: "Eventos Empresariais" },
  { valor: "espacos", rotulo: "Espaços" },
  { valor: "area", rotulo: "Área reservada" },
];

/** Um dono do estado a sério: metade dos defeitos deste padrão só aparecem
 *  quando o valor volta mesmo do pai. */
function Campo({
  aoMudar,
  inicial = "normal",
  opcoes = OPCOES,
}: {
  aoMudar?: (v: string) => void;
  inicial?: string;
  opcoes?: { valor: string; rotulo: string; desactivada?: boolean; grupo?: string }[];
}) {
  const [v, setV] = useState(inicial);
  return (
    <>
      <Escolha
        aria-label="Prioridade"
        valor={v}
        opcoes={opcoes}
        aoMudar={(novo) => {
          setV(novo);
          aoMudar?.(novo);
        }}
      />
      <button type="button">a seguir</button>
    </>
  );
}

const botao = () => screen.getByRole("combobox", { name: "Prioridade" });
const lista = () => screen.queryByRole("listbox");
const sobOCursor = () => {
  const id = botao().getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent?.replace("✓", "").trim() : undefined;
};

/** Os mesmos 500 ms que o componente usa. Importados por valor e não copiados:
 *  se lá mudarem, esta espera muda com eles. */
const MEMORIA_DO_TECLADO_MS = 500;

afterEach(() => {
  cleanup();
  // Rede contra o que já aconteceu aqui: um relógio falso deixado montado por
  // um teste que rebentou a meio faz cair todos os seguintes, e o relatório
  // aponta para o sítio errado.
  vi.useRealTimers();
});

describe("Escolha — o teclado que o `<select>` dava de graça", () => {
  it("o botão anuncia-se como combobox fechado, com o valor lá dentro", () => {
    render(<Campo />);
    expect(botao()).toHaveAttribute("aria-expanded", "false");
    expect(botao()).toHaveTextContent("Normal");
    expect(lista()).toBeNull();
  });

  it("↓ abre a lista no valor actual, e ↑ ↓ andam sem dar a volta", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    botao().focus();

    await u.keyboard("{ArrowDown}");
    expect(botao()).toHaveAttribute("aria-expanded", "true");
    expect(lista()).not.toBeNull();
    // Abre ONDE SE ESTÁ, e não no princípio: é isso que faz o campo parecer que
    // se lembra do que lá está gravado.
    expect(sobOCursor()).toBe("Normal");

    await u.keyboard("{ArrowDown}");
    expect(sobOCursor()).toBe("Baixa");
    await u.keyboard("{ArrowUp}{ArrowUp}");
    expect(sobOCursor()).toBe("Alta");
    // No topo fica-se no topo. Dar a volta faz uma lista longa parecer que
    // saltou para outro sítio.
    await u.keyboard("{ArrowUp}");
    expect(sobOCursor()).toBe("Alta");
  });

  it("Home e End vão aos extremos, com a lista aberta e com ela fechada", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    botao().focus();

    // Fechada: o End ABRE já no fim.
    await u.keyboard("{End}");
    expect(botao()).toHaveAttribute("aria-expanded", "true");
    expect(sobOCursor()).toBe("Área reservada");

    await u.keyboard("{Home}");
    expect(sobOCursor()).toBe("Alta");
    await u.keyboard("{End}");
    expect(sobOCursor()).toBe("Área reservada");
  });

  it("escrever «e» salta para «Eventos Empresariais» — e o «e» outra vez para o seguinte", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    botao().focus();
    await u.keyboard("{ArrowDown}");

    await u.keyboard("e");
    expect(sobOCursor()).toBe("Eventos Empresariais");
    // A MESMA letra outra vez percorre os que começam por ela, como no nativo.
    await u.keyboard("e");
    expect(sobOCursor()).toBe("Espaços");
  });

  it("escrever uma PALAVRA afina em vez de saltar", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    botao().focus();
    await u.keyboard("{ArrowDown}");

    // «es» tem de dar «Espaços» e não «Eventos»: se a segunda letra reiniciasse
    // a procura, escrever depressa nunca chegava ao que se quer.
    await u.keyboard("es");
    expect(sobOCursor()).toBe("Espaços");

    // Meio segundo sem tocar no teclado apaga a memória: o «e» seguinte
    // recomeça, em vez de continuar a procurar «ese».
    //
    // A espera é REAL, e de propósito. Com `vi.useFakeTimers()` isto encravava:
    // o `userEvent` arma temporizadores seus para os eventos, e com o relógio
    // parado ninguém os avança — a primeira versão deste ficheiro esgotou os
    // cinco segundos aqui E deixou o relógio falso montado, o que fez cair os
    // ONZE testes a seguir por arrasto. Meio segundo de espera a sério custa
    // menos do que essa armadilha.
    await new Promise((r) => setTimeout(r, MEMORIA_DO_TECLADO_MS + 100));
    await u.keyboard("e");
    expect(sobOCursor()).toBe("Eventos Empresariais");
  });

  it("«a» encontra «Área» — os acentos não escondem uma opção", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    botao().focus();
    await u.keyboard("{ArrowDown}");
    // Começa em «Normal» e procura a partir daí: «Área reservada». Escreve-se
    // «a» num teclado português sem pensar no acento — e a opção tem de
    // aparecer na mesma.
    await u.keyboard("a");
    expect(sobOCursor()).toBe("Área reservada");
  });

  it("escrever com a lista FECHADA abre-a no sítio certo, sem gravar nada", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(<Campo aoMudar={mudou} />);
    botao().focus();

    await u.keyboard("b");
    expect(botao()).toHaveAttribute("aria-expanded", "true");
    expect(sobOCursor()).toBe("Baixa");
    // Metade destes campos GRAVA ao mudar. Um «b» distraído não pode ser uma
    // gravação — é por isso que aqui abre em vez de escolher.
    expect(mudou).not.toHaveBeenCalled();
  });

  it("Enter escolhe o que está sob o cursor; Espaço faz o mesmo", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(<Campo aoMudar={mudou} />);
    botao().focus();

    await u.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(mudou).toHaveBeenCalledWith("baixa");
    expect(botao()).toHaveTextContent("Baixa");
    expect(lista()).toBeNull();

    // Espaço abre (em «Baixa», onde ficou), ↑ sobe um, Espaço escolhe.
    await u.keyboard(" {ArrowUp} ");
    expect(mudou).toHaveBeenLastCalledWith("normal");
    expect(botao()).toHaveTextContent("Normal");
  });

  it("Escape fecha SEM escolher, e o valor fica o que estava", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(<Campo aoMudar={mudou} />);
    botao().focus();

    await u.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(sobOCursor()).toBe("Eventos Empresariais");
    await u.keyboard("{Escape}");

    expect(lista()).toBeNull();
    expect(botao()).toHaveAttribute("aria-expanded", "false");
    expect(mudou).not.toHaveBeenCalled();
    expect(botao()).toHaveTextContent("Normal");
  });

  it("o foco volta ao botão — no Escape, ao escolher, e no instante", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    botao().focus();

    await u.keyboard("{ArrowDown}");
    // O padrão é `aria-activedescendant`: o foco do DOM NUNCA sai do botão,
    // nem sequer enquanto se percorre a lista. É daqui que vem o «no instante»
    // — não há nada a devolver, e portanto não há `setTimeout` que o atrase.
    expect(document.activeElement).toBe(botao());
    await u.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(botao());

    await u.keyboard("{Escape}");
    expect(document.activeElement).toBe(botao());

    await u.keyboard("{ArrowDown}{Enter}");
    expect(document.activeElement).toBe(botao());
  });

  it("carregar com o rato numa opção também não tira o foco do botão", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    await u.click(botao());
    await u.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Baixa/ }));

    expect(botao()).toHaveTextContent("Baixa");
    expect(lista()).toBeNull();
    expect(document.activeElement).toBe(botao());
  });

  it("Tab fecha, guarda o que estava sob o cursor, e segue em frente", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(<Campo aoMudar={mudou} />);
    botao().focus();

    await u.keyboard("{ArrowDown}{ArrowDown}");
    await u.tab();

    expect(lista()).toBeNull();
    // Num `<select>` nativo as setas já tinham mudado o valor. Perdê-lo aqui em
    // silêncio era a diferença que ninguém repara até ter gravado outra coisa.
    expect(mudou).toHaveBeenCalledWith("baixa");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "a seguir" }));
  });

  it("uma opção desactivada não se escolhe, nem com as setas nem com o rato", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(
      <Campo
        aoMudar={mudou}
        inicial="a"
        opcoes={[
          { valor: "a", rotulo: "Livre" },
          { valor: "b", rotulo: "Emprestado", desactivada: true },
          { valor: "c", rotulo: "Avariado" },
        ]}
      />,
    );
    botao().focus();

    // O primeiro ↓ ABRE, em «Livre», que é o que lá está; o segundo é que anda
    // — e aí salta por cima da desactivada em vez de encravar nela.
    await u.keyboard("{ArrowDown}");
    expect(sobOCursor()).toBe("Livre");
    await u.keyboard("{ArrowDown}");
    expect(sobOCursor()).toBe("Avariado");

    await u.keyboard("{Escape}");
    await u.click(botao());
    await u.click(screen.getByRole("option", { name: /Emprestado/ }));
    expect(mudou).not.toHaveBeenCalled();
    // E continua aberta: um clique que não faz nada tem de deixar a lista onde
    // estava, senão parece que escolheu qualquer coisa.
    expect(lista()).not.toBeNull();
  });
});

describe("Escolha — o que o leitor de ecrã ouve", () => {
  it("a lista é um listbox de options, com a escolhida marcada", async () => {
    const u = userEvent.setup();
    render(<Campo />);
    await u.click(botao());

    const opcoes = screen.getAllByRole("option");
    expect(opcoes).toHaveLength(OPCOES.length);
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Normal");
    expect(botao()).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  });

  it("os grupos são grupos, e não um título solto no meio das opções", async () => {
    const u = userEvent.setup();
    render(
      <Campo
        inicial=""
        opcoes={[
          { valor: "a", rotulo: "Romântico", grupo: "Estilo" },
          { valor: "b", rotulo: "Rústico", grupo: "Estilo" },
          { valor: "c", rotulo: "Verão", grupo: "Estação" },
        ]}
      />,
    );
    await u.click(botao());

    const estilo = screen.getByRole("group", { name: "Estilo" });
    expect(within(estilo).getAllByRole("option")).toHaveLength(2);
    expect(
      within(screen.getByRole("group", { name: "Estação" })).getAllByRole("option"),
    ).toHaveLength(1);
  });

  it("um valor que não consta da lista mostra-se cru, em vez de mentir", () => {
    render(<Campo inicial="valor-antigo" />);
    // Sem isto, o campo mostrava a primeira opção e dizia uma coisa enquanto o
    // registo dizia outra. É a rede que o `GuestList` já escrevia à mão.
    expect(botao()).toHaveTextContent("valor-antigo");
  });
});

describe("Escolha — os `<option>` de sempre continuam a valer", () => {
  it("lê `value`, o texto quando não há `value`, e `<optgroup>`", async () => {
    const u = userEvent.setup();
    const mudou = vi.fn();
    render(
      <Escolha aria-label="Taxa" valor="0.23" aoMudar={mudou}>
        <option value={0.23}>23%</option>
        <option>Isento</option>
        <optgroup label="Regiões">
          <option value="ac">Açores</option>
        </optgroup>
      </Escolha>,
    );
    await u.click(screen.getByRole("combobox", { name: "Taxa" }));

    // `value={0.23}` vira `"0.23"`, como o DOM faz — é por isso que quem lê
    // números faz `Number(v)` do outro lado.
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("23%");
    // Sem `value`, o valor é o TEXTO da opção. Igual ao nativo.
    await u.click(screen.getByRole("option", { name: /Isento/ }));
    expect(mudou).toHaveBeenCalledWith("Isento");
  });
});

describe("Escolha — o formulário à volta", () => {
  it("com `name`, há um `<select>` a sério a levar o valor e o `required`", () => {
    const { container } = render(
      <Escolha
        aria-label="Área"
        name="area"
        required
        valor="alta"
        opcoes={OPCOES}
        aoMudar={() => {}}
      />,
    );
    const nativo = container.querySelector<HTMLSelectElement>('select[name="area"]');
    expect(nativo).not.toBeNull();
    expect(nativo!.value).toBe("alta");
    expect(nativo!.required).toBe(true);
    // `display:none` barraria o campo da validação de restrições e o `required`
    // deixava de valer calado. Escondido é por opacidade.
    expect(nativo!.className).not.toMatch(/\bhidden\b/);
    // E fora da árvore de acessibilidade: quem fala é o combobox.
    expect(nativo).toHaveAttribute("aria-hidden", "true");
    expect(nativo!.tabIndex).toBe(-1);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("sem `name` não há campo escondido nenhum a sujar o DOM", () => {
    const { container } = render(
      <Escolha aria-label="Área" valor="alta" opcoes={OPCOES} aoMudar={() => {}} />,
    );
    expect(container.querySelector("select")).toBeNull();
  });
});
