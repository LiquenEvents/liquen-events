"use client";

import { useRef, useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import type { Quote, ChecklistItem } from "@/lib/orcamento/types";
import { checklistTemplate } from "@/lib/checklist-templates";
import { Button, Field, EmptyState } from "./ui";

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
  // Confirmação inline (dois cliques) antes de limpar itens concluídos.
  const [confirmClear, setConfirmClear] = useState(false);

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

  function persist(next: ChecklistItem[]) {
    const minha = ++gravacoes.current;
    setItems(next);
    onChange(next);
    const baseAnterior = base.current;
    base.current = next;
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: next, base: { checklist: baseAnterior } }),
    })
      .then(async (res) => {
        /**
         * 409 não é «tenta outra vez»: é «isto mudou noutro sítio», e repetir
         * era escrever por cima do trabalho da outra pessoa. Adopta-se o que o
         * servidor tem e diz-se-lhe.
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
        if (!res.ok) throw new Error();
        if (minha === gravacoes.current) gravado.current = next;
      })
      .catch(() => {
        base.current = baseAnterior;
        // Já foi substituída por uma gravação mais recente: o que essa levar
        // contém o que esta levava, portanto não há nada a desfazer nem nada a
        // dizer. Se ELA também falhar, é ela que repõe — e para o mesmo sítio.
        if (minha !== gravacoes.current) return;
        setItems(gravado.current);
        onChange(gravado.current);
        toast("Não foi possível guardar a checklist. Tenta novamente.", "error");
      });
  }

  function seed() {
    const next = checklistTemplate(quote.category).map((label) => ({
      id: randomId(),
      label,
      done: false,
    }));
    persist(next);
  }
  function toggle(id: string) {
    persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }
  function remove(id: string) {
    persist(items.filter((i) => i.id !== id));
  }
  function add() {
    const l = newItem.trim();
    if (!l) return;
    persist([...items, { id: randomId(), label: l, done: false }]);
    setNewItem("");
  }

  function markAll() {
    persist(items.map((i) => (i.done ? i : { ...i, done: true })));
  }
  function clearCompleted() {
    // Primeiro clique arma a confirmação; o segundo executa. Blur desarma.
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    persist(items.filter((i) => !i.done));
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
    persist(items.map((i) => (i.id === id ? { ...i, label: l } : i)));
  }

  // Itens do modelo ainda em falta (dedupe por label exato, como o applyPlan
  // do ProductionPlan) — permite completar uma checklist já começada.
  const existingLabels = new Set(items.map((i) => i.label));
  const missingFromTemplate = checklistTemplate(quote.category).filter(
    (label) => !existingLabels.has(label),
  );
  function addTemplateItems() {
    if (missingFromTemplate.length === 0) return;
    persist([
      ...items,
      ...missingFromTemplate.map((label) => ({ id: randomId(), label, done: false })),
    ]);
  }

  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <section className="border-t border-foreground/10 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Checklist de Produção</p>
        {items.length > 0 && (
          <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-foreground/55">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="px-4 py-10"
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
            className="mb-5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da checklist"
          >
            <div
              className="h-full rounded-full bg-[#4d6350] motion-safe:transition-[width] motion-safe:duration-500"
              style={{ width: `${pct}%` }}
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
                className="alvo-toque rounded-lg px-2 py-1 text-[11px] tracking-[0.02em] text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground/75 disabled:pointer-events-none disabled:opacity-40 motion-safe:transition-colors"
              >
                Marcar todas
              </button>
              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  onBlur={() => setConfirmClear(false)}
                  className={`alvo-toque rounded-lg px-2 py-1 text-[11px] tracking-[0.02em] motion-safe:transition-colors ${
                    confirmClear
                      ? "bg-[#b5654a]/10 text-[#b5654a] hover:bg-[#b5654a]/[0.16]"
                      : "text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground/75"
                  }`}
                >
                  {confirmClear
                    ? `Remover ${doneCount} ${doneCount === 1 ? "concluída" : "concluídas"}?`
                    : "Limpar concluídas"}
                </button>
              )}
            </div>
            {missingFromTemplate.length > 0 && (
              <button
                type="button"
                onClick={addTemplateItems}
                className="alvo-toque rounded-lg px-2 py-1 text-[11px] tracking-[0.02em] text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground/75 motion-safe:transition-colors"
              >
                Adicionar itens do modelo ({missingFromTemplate.length})
              </button>
            )}
          </div>
          <ul className="mb-5 flex flex-col gap-0.5">
            {items.map((i) => (
              <li
                key={i.id}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-foreground/[0.02]"
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
                    className="bo-input flex-1 px-2 py-0.5 text-sm text-foreground/80"
                  />
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
                      i.done ? "text-foreground/35 line-through" : "text-foreground/75"
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
                  className="alvo-toque shrink-0 rounded-md p-1 text-foreground/25 opacity-100 com-rato:opacity-0 hover:text-[#8a2a22] com-rato:focus-visible:opacity-100 motion-safe:transition-all com-rato:group-hover:opacity-100"
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
    </section>
  );
}
