// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventTimeline from "./EventTimeline";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import { escreverHora } from "./escrever-hora";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM MOMENTO PASSA A TER COMPRIMENTO — E O QUE JÁ ESTAVA GRAVADO NÃO SE MEXE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O guião era uma lista de INSTANTES: oito horas, oito títulos, todas as linhas
 * do mesmo tamanho. Uma montagem de quatro horas e um brinde de dez minutos
 * mediam o mesmo, portanto o ecrã não respondia à pergunta que ela faz a olhar
 * para o papel na véspera — «isto cabe?».
 *
 * Estes testes seguram três coisas, por esta ordem de importância:
 *
 *  1. **O que já está gravado.** Há eventos com guiões do modelo antigo. Têm de
 *     abrir, funcionar, e — o mais importante — abrir CALADOS: sem durações
 *     ninguém declarou tempo nenhum, e um choque inventado a partir de silêncio
 *     ensina-a a ignorar o vermelho.
 *  2. **A duração chega mesmo ao servidor**, no corpo do PATCH. (Que ela não é
 *     apagada pelo `.strip()` do zod pelo caminho está preso no
 *     `validation.test.ts`.)
 *  3. **A frase.** Um choque nomeia a pessoa, os dois momentos, os minutos e o
 *     que fazer. Nunca «há um conflito».
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** Os corpos dos PATCH, pela ordem por que saíram. */
function corpos(): { timeline: TimelineItem[] }[] {
  const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

/** Um guião gravado ANTES de o campo `duracao` existir. Não lhe toques. */
const MODELO_ANTIGO: TimelineItem[] = [
  { id: "t1", time: "09:00", title: "Montagem", owner: "Rita" },
  { id: "t2", time: "09:00", title: "Descarga da carrinha", owner: "Rita" },
  { id: "t3", time: "17:00", title: "Cerimónia" },
  { id: "t4", time: "02:00", title: "Encerramento" },
];

const montar = (timeline: TimelineItem[], extra: Partial<Quote> = {}) =>
  render(
    <ToastProvider>
      <EventTimeline quote={{ id: "q1", timeline, ...extra } as Quote} onChange={() => {}} />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("um guião do modelo antigo continua a abrir e a funcionar", () => {
  it("mostra os momentos todos, por ordem do dia, e sem duração nenhuma", () => {
    montar(MODELO_ANTIGO);
    for (const t of ["Montagem", "Descarga da carrinha", "Cerimónia", "Encerramento"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    // O «02:00 Encerramento» é o FIM do dia, e continua a sê-lo.
    const titulos = screen.getAllByTitle("Editar momento").map((b) => b.textContent?.trim());
    expect(titulos).toEqual(["Montagem", "Descarga da carrinha", "Cerimónia", "Encerramento"]);
    // Cada momento tem o seu controlo de duração, e todos dizem que não a têm.
    expect(
      screen.getAllByRole("combobox", { name: /^Duração de / }).map((c) => c.textContent?.trim()),
    ).toEqual(["Sem duração", "Sem duração", "Sem duração", "Sem duração"]);
  });

  it("e abre CALADO: duas coisas da Rita à mesma hora não são um choque", () => {
    // O caso mais tentador de todos: duas linhas às 09:00, a mesma pessoa. Sem
    // duração declarada não há intervalo nenhum a sobrepor-se — são dois
    // marcos, e a resposta certa é o silêncio.
    montar(MODELO_ANTIGO);
    expect(screen.queryByText(/em dois sítios ao mesmo tempo/)).toBeNull();
    expect(screen.queryByText(/em cima um do outro/)).toBeNull();
  });

  it("mas diz-lhe o que falta, uma vez e sem alarme", () => {
    montar(MODELO_ANTIGO);
    expect(screen.getByText(/Nenhum momento tem duração marcada/)).toBeTruthy();
    expect(screen.getByText(/o dia ainda não tem forma/)).toBeTruthy();
  });

  it("e NÃO afirma buracos que não pode conhecer", () => {
    // 09:00 → 17:00 são oito horas de vazio no papel. Mas podem ser a montagem
    // a decorrer sem ninguém lhe ter dito quanto tempo leva. Este ecrã chegou a
    // listar sete frases dessas de uma vez, empilhadas, sobre um guião do
    // modelo antigo — uma parede de texto a afirmar o que ele não sabe. Um
    // buraco só se nomeia quando se sabe onde o anterior acaba.
    montar(MODELO_ANTIGO);
    expect(screen.queryByText(/sem nada marcado\./)).toBeNull();
  });

  it("num guião MISTO, o buraco certo diz-se e o incerto continua calado", () => {
    montar([
      { id: "t1", time: "09:00", title: "Montagem", duracao: 60 }, // 09:00 → 10:00
      { id: "t2", time: "13:00", title: "Cerimónia" }, // 3 h de buraco CERTO
      { id: "t3", time: "20:00", title: "Jantar" }, // 7 h, mas incerto
    ]);
    const ditos = screen.getAllByText(/sem nada marcado\./).map((n) => n.textContent);
    expect(ditos).toHaveLength(1);
    expect(ditos[0]).toContain("3 h entre «Montagem» e «Cerimónia»");
    // E o que ainda não se sabe fica coberto por uma linha só, com a conta.
    expect(screen.getByText(/2 momentos ainda não têm duração/)).toBeTruthy();
  });

  it("remover um momento continua a mandar o guião inteiro, sem inventar durações", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar(MODELO_ANTIGO);

    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));
    await waitFor(() => expect(corpos()).toHaveLength(1));

    // O que sobe é exactamente o modelo antigo menos uma linha: nem uma chave
    // `duracao` nova, nem um zero. Um guião sem durações tem de continuar a ser
    // um guião sem durações — é essa a versão que o 409 compara.
    expect(corpos()[0].timeline).toEqual([MODELO_ANTIGO[0], MODELO_ANTIGO[1], MODELO_ANTIGO[3]]);
    expect(corpos()[0].timeline.some((i) => "duracao" in i)).toBe(false);
  });
});

describe("dar duração a um momento", () => {
  it("grava-a no corpo do PATCH, em minutos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar([{ id: "t1", time: "09:00", title: "Montagem", owner: "Rita" }]);

    await user.click(screen.getByRole("combobox", { name: "Duração de Montagem" }));
    await user.click(screen.getByRole("option", { name: "3 h" }));

    await waitFor(() => expect(corpos()).toHaveLength(1));
    expect(corpos()[0].timeline).toEqual([
      { id: "t1", time: "09:00", title: "Montagem", owner: "Rita", duracao: 180 },
    ]);
  });

  it("e tirá-la volta a apagar a chave, em vez de a deixar a zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar([{ id: "t1", time: "09:00", title: "Montagem", duracao: 180 }]);

    await user.click(screen.getByRole("combobox", { name: "Duração de Montagem" }));
    await user.click(screen.getByRole("option", { name: "Sem duração" }));

    await waitFor(() => expect(corpos()).toHaveLength(1));
    expect(corpos()[0].timeline).toEqual([{ id: "t1", time: "09:00", title: "Montagem" }]);
  });

  it("o momento novo nasce com a duração escolhida na linha de acrescentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar([]);

    await escreverHora(user, "19:30");
    await user.type(screen.getByPlaceholderText("Momento…"), "Discursos");
    await user.click(screen.getByRole("combobox", { name: "Duração" }));
    await user.click(screen.getByRole("option", { name: "30 min" }));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(corpos()).toHaveLength(1));
    expect(corpos()[0].timeline[0]).toMatchObject({
      time: "19:30",
      title: "Discursos",
      duracao: 30,
    });
  });

  it("sem duração escolhida, o momento novo nasce SEM a chave", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar([]);

    await escreverHora(user, "19:30");
    await user.type(screen.getByPlaceholderText("Momento…"), "Discursos");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(corpos()).toHaveLength(1));
    expect("duracao" in corpos()[0].timeline[0]).toBe(false);
  });
});

describe("a forma do dia mede o tempo que cada momento ocupa", () => {
  it("um bloco de 4 h é mais alto do que um de 45 min, e proporcional", () => {
    // A altura É o tempo — é isso que responde a «isto cabe?» sem ler nada.
    montar([
      { id: "t1", time: "08:00", title: "Montagem", duracao: 240 },
      { id: "t2", time: "17:00", title: "Cerimónia", duracao: 45 },
    ]);
    const bloco = (titulo: string) =>
      screen.getByRole("button", { name: titulo }).closest("div[style]") as HTMLElement;

    const montagem = bloco("Montagem");
    const cerimonia = bloco("Cerimónia");
    // 240 min × 0,7 px = 168 px; 45 min ficam no chão de 44 px, que é o mínimo
    // em que ainda se toca com o polegar (ver `PX_POR_MINUTO`).
    expect(montagem.style.minHeight).toBe("168px");
    expect(cerimonia.style.minHeight).toBe("44px");
  });

  it("a hora de FIM é calculada, e atravessa a meia-noite", () => {
    montar([{ id: "t1", time: "23:00", title: "Festa", duracao: 180 }]);
    expect(screen.getByText("→ 02:00")).toBeTruthy();
  });
});

describe("duas coisas ao mesmo tempo, ditas por palavras", () => {
  const COM_CHOQUE: TimelineItem[] = [
    { id: "t1", time: "08:00", title: "Montagem", owner: "Rita", duracao: 240 },
    { id: "t2", time: "11:00", title: "Chegada do catering", owner: "Rita", duracao: 90 },
  ];

  it("o choque nomeia a pessoa, os dois momentos, os minutos e o que fazer", () => {
    montar(COM_CHOQUE);
    const aviso = screen.getByText(/em dois sítios ao mesmo tempo/).closest("[role=alert]")!;
    expect(aviso.textContent).toContain("Rita");
    expect(aviso.textContent).toContain("08:00 Montagem");
    expect(aviso.textContent).toContain("11:00 Chegada do catering");
    expect(aviso.textContent).toContain("1 h em cima um do outro");
    // E o que fazer — nunca «algo correu mal».
    expect(aviso.textContent).toContain("Muda a hora de um dos dois");
  });

  it("com responsáveis diferentes é informação, e não um alerta vermelho", async () => {
    const user = userEvent.setup();
    montar(COM_CHOQUE);
    expect(screen.queryByText(/em dois sítios ao mesmo tempo/)).toBeTruthy();

    // Passa o catering ao Nuno: deixa de ser um erro e passa a ser uma nota.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    // Dois momentos, dois responsáveis: o segundo é o do catering.
    await user.click(screen.getAllByTitle("Editar responsável")[1]);
    const campo = screen.getByLabelText("Editar responsável");
    await user.clear(campo);
    await user.type(campo, "Nuno{Enter}");

    await waitFor(() => expect(screen.queryByText(/em dois sítios ao mesmo tempo/)).toBeNull());
    expect(screen.getByText(/correm 1 h ao mesmo tempo/)).toBeTruthy();
  });

  it("o buraco diz quanto tempo é e entre o quê", () => {
    montar([
      { id: "t1", time: "09:00", title: "Montagem", duracao: 180 },
      { id: "t2", time: "15:00", title: "Recepção", duracao: 60 },
    ]);
    expect(screen.getByText(/3 h entre «Montagem» e «Recepção» sem nada marcado/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O QUE É QUE VEM A SEGUIR?» — SEM TOCAR EM NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta que ela faz de pé, numa quinta, com as mãos ocupadas. E o relógio
 * só existe no DIA: um «AGORA» a apontar para uma hora de um dia que não é o do
 * evento parece informação e é ruído.
 */
describe("o que vem a seguir", () => {
  const DIA: TimelineItem[] = [
    { id: "t1", time: "09:00", title: "Montagem", owner: "Rita", duracao: 180 },
    { id: "t2", time: "16:00", title: "Receção dos convidados", owner: "Catarina", duracao: 60 },
  ];

  it("no dia do evento responde sozinho, com a hora e a contagem", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 10, 30));
    montar(DIA, { date: "2026-09-07" });

    expect(screen.getByText("Agora")).toBeTruthy();
    // O cartão do topo é a resposta inteira, e lê-se sem procurar nada abaixo.
    const cartao = screen.getByText("A seguir").closest("div")!;
    // A hora do próximo é o maior número do ecrã, e a contagem poupa-lhe a
    // conta de cabeça.
    expect(within(cartao).getByText("16:00")).toBeTruthy();
    expect(within(cartao).getByText("daqui a 5 h 30")).toBeTruthy();
    expect(within(cartao).getByText(/Receção dos convidados/)).toBeTruthy();
    // E o que está a decorrer agora fica em cima, como contexto.
    expect(screen.getByText(/A decorrer · faltam 1 h 30/)).toBeTruthy();
  });

  it("na madrugada seguinte o guião ainda está a correr — não se apaga à meia-noite", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 8, 1, 0));
    montar([{ id: "t9", time: "02:00", title: "Encerramento", duracao: 120 }], {
      date: "2026-09-07",
    });
    expect(screen.getByText("A seguir")).toBeTruthy();
    expect(screen.getByText("daqui a 1 h")).toBeTruthy();
    expect(screen.getByText(/Não há nada marcado neste momento/)).toBeTruthy();
  });

  it("fora do dia do evento não há relógio nenhum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 1, 10, 30));
    montar(DIA, { date: "2026-09-07" });
    expect(screen.queryByText("Agora")).toBeNull();
    expect(screen.queryByText("A seguir")).toBeNull();
  });

  it("e sem data no pedido também não", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 10, 30));
    montar(DIA);
    expect(screen.queryByText("Agora")).toBeNull();
  });
});
