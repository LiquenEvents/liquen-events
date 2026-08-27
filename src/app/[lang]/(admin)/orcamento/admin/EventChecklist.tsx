"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DesistirDaEdicao } from "./ui/DesistirDaEdicao";
import { randomId } from "./util";
import { useToast } from "./Toast";
import type { Quote, ChecklistItem } from "@/lib/orcamento/types";
import { checklistTemplate } from "@/lib/checklist-templates";
import { Button, Field, EmptyState, PerguntaDestrutiva } from "./ui";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE PERGUNTA E O QUE SE ANULA, NESTA CHECKLIST
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta lista é lida e corrigida de pé, numa quinta, com o telemóvel numa mão.
 * A conta é sempre a mesma: pergunta-se o que é raro e caro; oferece-se anular
 * o que é frequente e barato de refazer.
 *
 *   RISCAR, DESRISCAR, REMOVER UM ITEM e MARCAR TODAS são os gestos do dia.
 *   Riscar e desriscar desfazem-se no mesmo sítio, com o mesmo dedo, e não
 *   precisam de nada. Os outros dois deitam alguma coisa fora — o texto de uma
 *   linha, o estado de todas as que estavam por fazer — e por isso ficam com um
 *   «Anular» ao lado durante uns segundos. NÃO levam pergunta: uma caixa a
 *   perguntar em cada item removido é o atrito que faz ignorar a caixa.
 *
 *   LIMPAR AS CONCLUÍDAS leva PERGUNTA. Sai um punhado de linhas de uma vez, e
 *   o que se perde é o TEXTO delas — refazer é reescrever à mão o que já
 *   estava escrito. A pergunta diz quantas são e nomeia-as.
 *
 * GERAR A CHECKLIST não pergunta nada, e é de propósito: o botão só existe no
 * ecrã vazio (`items.length === 0`), portanto ali não há nada para deitar fora.
 * Uma pergunta sobre uma lista vazia é atrito numa tarefa que não é destrutiva.
 */

/** Uma pergunta que nomeia o que se perde, e o que fazer se a resposta for sim. */
interface Pergunta {
  /** A pergunta, com o NOME da coisa lá dentro. Nunca «Tens a certeza?». */
  titulo: string;
  /** Uma linha por coisa que desaparece, cada uma com o seu número. */
  oQueSePerde: ReactNode[];
  /** A frase por baixo da lista. */
  aviso?: ReactNode;
  /** O verbo, repetido no botão: «Remover as 3», não «Confirmar». */
  rotulo: string;
  fazer: () => void | Promise<void>;
}

/** Uma alteração feita sem perguntar, reversível durante uns segundos. */
interface Anulavel {
  /** O que aconteceu, para a tira o poder dizer: ««Escadote» saiu da lista.» */
  texto: string;
  repor: () => void;
}

/** Quanto tempo fica o «Anular» no ecrã, em milissegundos. Oito segundos dá
 *  para ver o que desapareceu, perceber que foi engano e carregar — sem ficar
 *  lá pendurado a dizer que há alguma coisa por decidir. */
const MS_PARA_ANULAR = 8000;

/** Nomeia até três linhas e conta o resto. Uma lista de vinte nomes dentro de
 *  uma pergunta não se lê; três chegam para reconhecer o lote errado. */
function ateTres(labels: string[]): string[] {
  const primeiros = labels.slice(0, 3).map((l) => `«${l}»`);
  const resto = labels.length - primeiros.length;
  return resto > 0 ? [...primeiros, `e mais ${resto}`] : primeiros;
}

interface Props {
  quote: Quote;
  onChange: (items: ChecklistItem[]) => void;
}

export default function EventChecklist({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ChecklistItem[]>(quote.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  // Edição inline do texto de um item: commit em blur/Enter, Escape cancela.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** A pergunta em curso — ver o comentário no topo do ficheiro. */
  const [aPerguntar, setAPerguntar] = useState<Pergunta | null>(null);
  /** O último gesto que se pode anular, enquanto a janela estiver aberta. */
  const [anular, setAnular] = useState<Anulavel | null>(null);

  /**
   * Otimista com reversão — mas a reversão é para o último estado que o SERVIDOR
   * confirmou, e só quando não há gravação mais recente.
   *
   * Guardar `items` antes do pedido e repô-lo no erro era guardar um instante
   * que já passou. Esta lista usa-se a percorrer e a ir marcando, portanto dois
   * PATCH no ar são o caso normal e não a corrida rara. O segundo leva a
   * checklist INTEIRA (já com a primeira marcação dentro), portanto quando o
   * servidor o aceita fica com as duas; a primeira, ao falhar, repunha o
   * instante anterior às DUAS e desriscava no ecrã uma tarefa gravada — que a
   * edição seguinte voltava a gravar como por fazer.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<ChecklistItem[]>(quote.checklist ?? []);

  /**
   * ── DE ONDE ESTA LISTA FOI COPIADA ───────────────────────────────────────
   *
   * A checklist é copiada UMA vez, ao montar, e ao gravar vai INTEIRA — logo a
   * gravação é «substitui a checklist por esta», não «marca este item». Uma
   * cópia de há duas horas apagava as tarefas que a colega acrescentou pelo
   * meio, com as duas gravações a responder 200.
   *
   * `base` é a versão de que esta lista partiu; o servidor compara-a com a que
   * tem e recusa com 409 se mudou. Avança ao ENVIAR (não ao confirmar): dois
   * toques seguidos põem dois PATCH no ar e o segundo já leva o primeiro lá
   * dentro — declarar a versão de antes do primeiro era inventar uma colisão
   * dela consigo própria.
   */
  const base = useRef<ChecklistItem[]>(quote.checklist ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * A GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * Todas as oito acções deste painel passam por aqui, e todas falhavam com a
   * mesma frase: «Não foi possível guardar a checklist. Tenta novamente.» —
   * para a rede em baixo, a sessão expirada, o pedido apagado por outra
   * pessoa e o servidor em baixo. Nos dois do meio, «tenta novamente» é um
   * conselho que não pode funcionar.
   *
   * O `oQue` diz qual foi o gesto («marcar «Confirmar catering»», «remover as
   * 3 concluídas»): a lista tem dezenas de linhas e a reversão desfaz UMA
   * delas — sem o nome, quem lê não sabe qual é que voltou atrás.
   */
  function persist(oQue: string, next: ChecklistItem[]) {
    const minha = ++gravacoes.current;
    setItems(next);
    onChange(next);
    const baseAnterior = base.current;
    base.current = next;

    // Desfaz o que foi posto no ecrã e diz porquê — a não ser que já haja uma
    // gravação mais recente: o que essa levar contém o que esta levava,
    // portanto não há nada a desfazer nem nada a dizer. Se ELA também falhar, é
    // ela que repõe — e para o mesmo sítio.
    const reporEDizer = (mensagem: string) => {
      base.current = baseAnterior;
      if (minha !== gravacoes.current) return;
      setItems(gravado.current);
      onChange(gravado.current);
      toast(mensagem, "error");
    };

    void (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checklist: next, base: { checklist: baseAnterior } }),
        });
      } catch {
        reporEDizer(porqueRebentou(oQue).mensagem);
        return;
      }
      /**
       * 409 não é «tenta outra vez»: é «isto mudou noutro sítio», e repetir
       * era escrever por cima do trabalho da outra pessoa. Adopta-se o que o
       * servidor tem e diz-se-lhe — e por isso esta frase é a da colisão, e
       * não a do `porqueFalhou`: aqui não se repõe nada, fica a versão
       * guardada.
       */
      if (res.status === 409) {
        const corpo = (await res.json().catch(() => null)) as {
          current?: { checklist?: ChecklistItem[] };
        } | null;
        const doServidor = corpo?.current?.checklist ?? gravado.current;
        base.current = doServidor;
        gravado.current = doServidor;
        if (minha === gravacoes.current) {
          setItems(doServidor);
          onChange(doServidor);
        }
        toast("A checklist foi alterada noutro sítio. Está aqui a versão guardada.", "error");
        return;
      }
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        reporEDizer(porqueFalhou(oQue, res, corpo).mensagem);
        return;
      }
      if (minha === gravacoes.current) gravado.current = next;
    })();
  }

  // O «Anular» some-se sozinho. A dependência é o objecto inteiro de propósito:
  // cada gesto põe lá um objecto NOVO, portanto o segundo reinicia a contagem em
  // vez de herdar os segundos que sobravam do primeiro.
  useEffect(() => {
    if (!anular) return;
    const relogio = setTimeout(() => setAnular(null), MS_PARA_ANULAR);
    return () => clearTimeout(relogio);
  }, [anular]);

  function seed() {
    const next = checklistTemplate(quote.category).map((label) => ({
      id: randomId(),
      label,
      done: false,
    }));
    persist("gerar a checklist deste evento", next);
  }
  function toggle(id: string) {
    const item = items.find((i) => i.id === id);
    persist(
      `${item?.done ? "desmarcar" : "marcar"} «${item?.label ?? "o item"}»`,
      items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    );
  }
  /**
   * REMOVER UM ITEM NÃO PERGUNTA — repõe-se com um toque.
   *
   * É o gesto de arrumar a lista, e faz-se em série. Uma caixa por cada item
   * removido custava um toque a mais em cada arrumação e, ao fim de uma semana,
   * ninguém lê o que lá está escrito — que é como uma pergunta deixa de
   * proteger seja o que for.
   *
   * O que se guarda para o «Anular» é a lista INTEIRA de antes, e não o item
   * solto: assim a linha volta ao sítio onde estava, e não ao fim.
   */
  function remove(id: string) {
    const item = items.find((i) => i.id === id);
    const antes = items;
    persist(
      `remover «${item?.label ?? "o item"}» da checklist`,
      items.filter((i) => i.id !== id),
    );
    setAnular({
      texto: `«${item?.label ?? "O item"}» saiu da checklist.`,
      repor: () => {
        setAnular(null);
        persist(`repor «${item?.label ?? "o item"}» na checklist`, antes);
      },
    });
  }
  function add() {
    const l = newItem.trim();
    if (!l) return;
    persist(`acrescentar «${l}» à checklist`, [
      ...items,
      { id: randomId(), label: l, done: false },
    ]);
    setNewItem("");
  }

  /**
   * «MARCAR TODAS» NÃO PERGUNTA — ANULA-SE.
   *
   * É um toque que risca de uma vez tudo o que estava por fazer. Nada
   * desaparece (o texto fica todo lá), mas desfazer À MÃO seria voltar a
   * carregar em cada caixa uma por uma — e é por isso que não basta dizer «é
   * reversível». A janela de anular repõe a lista exactamente como estava, de
   * uma vez.
   *
   * Uma pergunta aqui seria atrito num gesto rápido e frequente, no fim de uma
   * montagem, com o telemóvel na mão.
   */
  function markAll() {
    const antes = items;
    const quantas = items.filter((i) => !i.done).length;
    persist(
      "marcar toda a checklist como feita",
      items.map((i) => (i.done ? i : { ...i, done: true })),
    );
    setAnular({
      texto: `${quantas} ${quantas === 1 ? "item riscado" : "itens riscados"} de uma vez.`,
      repor: () => {
        setAnular(null);
        persist("desmarcar o que a marcação em bloco riscou", antes);
      },
    });
  }

  /**
   * LIMPAR AS CONCLUÍDAS PERGUNTA, E A PERGUNTA DIZ QUAIS.
   *
   * O que estava aqui era uma confirmação de dois cliques: o botão trocava para
   * «Remover 3 concluídas?» e o segundo clique executava. Tinha o número — o que
   * já era melhor do que a maioria — mas não dizia QUAIS, e desarmava-se no
   * `blur`: num telemóvel, rolar a lista chega para o botão voltar atrás sem
   * ninguém perceber porquê.
   *
   * Passa a nomear as linhas que saem. O que se perde é o texto delas, escrito
   * à mão uma a uma, e três nomes chegam para reconhecer o lote errado antes de
   * ele desaparecer.
   */
  function clearCompleted() {
    const concluidas = items.filter((i) => i.done);
    const quantas = concluidas.length;
    if (quantas === 0) return;
    const ficam = items.length - quantas;
    setAPerguntar({
      titulo: `Remover ${quantas} ${quantas === 1 ? "concluída" : "concluídas"} da checklist?`,
      oQueSePerde: ateTres(concluidas.map((i) => i.label)),
      aviso: `O texto delas não fica guardado em lado nenhum. Ficam ${ficam} ${
        ficam === 1 ? "linha" : "linhas"
      } na checklist.`,
      rotulo: quantas === 1 ? "Remover a concluída" : `Remover as ${quantas}`,
      fazer: () =>
        persist(
          `remover ${quantas} ${quantas === 1 ? "concluída" : "concluídas"} da checklist`,
          items.filter((i) => !i.done),
        ),
    });
  }

  function startEdit(item: ChecklistItem) {
    setEditingId(item.id);
    setDraft(item.label);
  }
  function commitEdit() {
    const id = editingId;
    setEditingId(null); // fecha já — o blur que se segue não repete o commit
    if (!id) return;
    const item = items.find((i) => i.id === id);
    const l = draft.trim();
    // Vazio ou inalterado cancela em vez de gravar um item sem texto.
    if (!item || !l || l === item.label) return;
    persist(
      `mudar «${item.label}» para «${l}»`,
      items.map((i) => (i.id === id ? { ...i, label: l } : i)),
    );
  }

  // Itens do modelo ainda em falta (dedupe por label exato, como o applyPlan
  // do ProductionPlan) — permite completar uma checklist já começada.
  const existingLabels = new Set(items.map((i) => i.label));
  const missingFromTemplate = checklistTemplate(quote.category).filter(
    (label) => !existingLabels.has(label),
  );
  function addTemplateItems() {
    if (missingFromTemplate.length === 0) return;
    persist(
      `acrescentar ${missingFromTemplate.length} ${
        missingFromTemplate.length === 1 ? "item" : "itens"
      } do modelo à checklist`,
      [...items, ...missingFromTemplate.map((label) => ({ id: randomId(), label, done: false }))],
    );
  }

  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    // O `pt-6` do separador eram 24 px de ar por cima do título, iguais a 375
    // e a 1440, e nesta zona do dossier há vários painéis destes empilhados.
    // `--bo-p-vista` (12 → 24) é o token do respiro vertical de uma vista:
    // 12 px de volta no telemóvel, computador na mesma.
    <section className="border-t border-[var(--bo-hairline-strong)] pt-[var(--bo-p-vista)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Checklist de Produção</p>
        {items.length > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--bo-tinta-6)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--bo-text-muted)]">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
          title="Sem checklist ainda"
          description="Começa por um modelo pensado para este tipo de evento e ajusta os itens à vontade."
          action={{ label: "Gerar checklist do evento", onClick: seed }}
        />
      ) : (
        <>
          <div
            className="mb-5 h-1.5 overflow-hidden rounded-full bg-[var(--bo-tinta-6)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da checklist"
          >
            <div
              className="h-full w-full origin-left rounded-full bg-[#4d6350] motion-safe:transition-transform motion-safe:duration-500"
              style={{ transform: `scaleX(${fraccaoDaBarra(pct, 100)})` }}
            />
          </div>
          {/* Os três botões desta barra mediam 27 px de altura a 375 px — e
              dois deles são destrutivos («Limpar concluídas» apaga, «Marcar
              todas» risca a lista inteira). `alvo-toque` põe-nos nos 44 sob
              dedo e deixa o portátil como estava. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={markAll}
                disabled={doneCount === items.length}
                className="alvo-toque rounded-lg px-2 py-1 text-[11px] tracking-[0.02em] text-foreground/45 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] disabled:pointer-events-none disabled:opacity-40 motion-safe:transition-colors"
              >
                Marcar todas
              </button>
              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="alvo-toque rounded-lg px-2 py-1 text-[11px] tracking-[0.02em] text-foreground/45 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] motion-safe:transition-colors"
                >
                  Limpar concluídas
                </button>
              )}
            </div>
            {missingFromTemplate.length > 0 && (
              <button
                type="button"
                onClick={addTemplateItems}
                className="alvo-toque rounded-lg px-2 py-1 text-[11px] tracking-[0.02em] text-foreground/45 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] motion-safe:transition-colors"
              >
                Adicionar itens do modelo ({missingFromTemplate.length})
              </button>
            )}
          </div>
          {/* ── A JANELA PARA ANULAR ──────────────────────────────────────
              Por cima da lista, onde os olhos já estão quando a linha
              desaparece — e não num aviso no canto do ecrã, que num telemóvel
              fica atrás do teclado. `role="status"` para quem não vê o ecrã
              ouvir o que aconteceu e que ainda dá para voltar atrás. */}
          {anular && (
            <div
              role="status"
              className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bo-tinta-6)] px-3 py-2 text-xs text-[var(--bo-tinta-72)]"
            >
              <span>{anular.texto}</span>
              <Button size="sm" variant="ghost" onClick={anular.repor}>
                Anular
              </Button>
            </div>
          )}
          <ul className="mb-5 flex flex-col gap-0.5">
            {items.map((i) => (
              <li
                key={i.id}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--bo-tinta-3)]"
              >
                {/* ── O ALVO CRESCE, O QUADRADO NÃO ────────────────────────
                    Medido a 375 px com a checklist cheia: este botão dava
                    20×20 px. É menos de metade dos 44 do mínimo, e é a caixa
                    que ela risca DE PÉ, no local, com o telemóvel numa mão —
                    o gesto mais repetido deste ecrã e aquele em que acertar
                    ao lado marca o item errado.

                    Cresce o BOTÃO (`alvo-toque`, só sob `pointer: coarse`) e
                    o quadrado desenhado passa para o `span` de dentro, que
                    fica nos mesmos 20 px. É a regra que o `globals.css` já
                    escreve ao lado da classe: quem cresce é o alvo, não o
                    desenho. No portátil nada muda. */}
                <button
                  onClick={() => toggle(i.id)}
                  role="checkbox"
                  aria-checked={i.done}
                  aria-label={i.label}
                  className="alvo-toque shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border motion-safe:transition-colors ${
                      i.done
                        ? "border-[#4d6350] bg-[#4d6350]"
                        : "border-foreground/30 hover:border-[#4d6350]/60"
                    }`}
                  >
                    {i.done && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 6l2.5 2.5L10 3"
                          stroke="white"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                </button>
                {editingId === i.id ? (
                  <>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label="Editar item"
                      className="bo-input flex-1 px-2 py-0.5 text-sm text-[var(--bo-text)]"
                    />
                    {/* Num telemóvel não há Escape, e tudo o que tira o foco
                        GRAVA — ver `DesistirDaEdicao`. */}
                    <DesistirDaEdicao onDesistir={() => setEditingId(null)} oQue="o item" />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    title="Editar item"
                    // 197×39 medidos a 375 px: o rótulo é a porta para editar
                    // o item e ficava 5 px abaixo do mínimo. `!justify-start`
                    // porque `alvo-toque` centra por omissão e este texto é
                    // corrido, alinhado à esquerda.
                    className={`alvo-toque !justify-start flex-1 rounded-md text-left text-sm leading-snug decoration-dotted underline-offset-2 hover:underline ${
                      i.done ? "text-foreground/35 line-through" : "text-[var(--bo-tinta-72)]"
                    }`}
                  >
                    {i.label}
                  </button>
                )}
                {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 10 destes botões e
                      ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                      disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                      PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                      há mesmo rato, e a 375 e a 768 com dedo ficam os 10 visíveis.

                      Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                      os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
                <button
                  onClick={() => remove(i.id)}
                  className="alvo-toque shrink-0 rounded-md p-1 text-foreground/25 sem-rato:text-[var(--bo-text-muted)] opacity-100 com-rato:opacity-0 hover:text-[#8a2a22] com-rato:focus-visible:opacity-100 motion-safe:transition-all com-rato:group-hover:opacity-100"
                  aria-label={`Remover ${i.label}`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2">
            <Field
              as="input"
              label="Novo item da checklist"
              hideLabel
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Adicionar item…"
              containerClassName="flex-1"
            />
            <Button variant="primary" onClick={add} disabled={!newItem.trim()}>
              Adicionar
            </Button>
          </div>
        </>
      )}

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          `ui/PerguntaDestrutiva`: folha inferior no telemóvel (ao pé do
          polegar), diálogo centrado no computador, e o verbo repetido no botão
          em vez de «OK». Um `confirm()` do browser não cabe em 375 px, não se
          traduz e não leva uma lista de números lá dentro — que é a única
          coisa que faz a pergunta valer a pena. */}
      <PerguntaDestrutiva
        aberto={!!aPerguntar}
        onFechar={() => setAPerguntar(null)}
        titulo={aPerguntar?.titulo ?? ""}
        oQueSePerde={aPerguntar?.oQueSePerde}
        aviso={aPerguntar?.aviso}
        rotuloConfirmar={aPerguntar?.rotulo ?? ""}
        // Fecha PRIMEIRO e só depois age, em vez de esperar pela resposta com a
        // caixa aberta: estes ecrãs são optimistas — tiram a linha logo e
        // repõem-na se o servidor recusar — e uma caixa a rodar por cima deles
        // atrasaria um gesto que hoje é instantâneo, e impedia dois seguidos.
        onConfirmar={() => {
          const escolhido = aPerguntar;
          setAPerguntar(null);
          void escolhido?.fazer();
        }}
      />
    </section>
  );
}
