"use client";

import { useMemo, useRef, useState } from "react";
import { randomId, eur2 } from "./util";
import { useToast } from "./Toast";
import { metaFor } from "./status-meta";
import { Button, EmptyState } from "./ui";
import type { Quote, ChecklistItem, EventSupplierStatus } from "@/lib/orcamento/types";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import {
  DECOR_PRODUCTION,
  PRODUCTION_PHASE_SEP,
  buildProductionPlanItems,
} from "@/lib/production-templates";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";

interface Props {
  quote: Quote;
  onChange?: (productionPlan: ChecklistItem[]) => void;
}

/**
 * Uma gravação que o servidor recusou por o plano ter mudado noutro sítio.
 *
 * Guarda-se o GESTO, não a lista que ele produziu: voltar a mandar a lista era
 * apagar as tarefas que a outra pessoa acrescentou — exactamente o que o 409
 * existe para impedir. O gesto volta a aplicar-se POR CIMA da versão adoptada.
 */
interface Colisao {
  /** O número da gravação que colidiu — é o que põe os gestos por ordem. */
  n: number;
  /** O gesto, nomeado: «marcar «Sourcing · Encomendar flores»». */
  oQue: string;
  /** O mesmo gesto, para o repetir sobre a versão que veio do servidor. */
  reaplicar: (atuais: ChecklistItem[]) => ChecklistItem[];
}

const STATUS_LABEL: Record<EventSupplierStatus, { label: string; color: string }> = {
  contactado: { label: "Contactado", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#7c854b" },
  pago: { label: "Pago", color: "#4d6350" },
};

// Separador + transform partilhados com o seed do servidor (production-templates),
// para o plano gerado na UI e o gerado no aceite da proposta serem idênticos.
const SEP = PRODUCTION_PHASE_SEP;

/**
 * Decor production plan: a phased atelier timeline (Sourcing → Strike) stored
 * in the quote's own `productionPlan` field (separado do `checklist` do evento,
 * para os dois painéis não se sobreporem). One click seeds the phase tasks as
 * ChecklistItems (prefixed with the phase), each toggle PATCHes
 * /api/orcamento/:id. Suppliers booked in Custos are surfaced read-only so the
 * per-event supplier assignment is visible from the production view.
 */
export default function ProductionPlan({ quote, onChange }: Props) {
  const { toast } = useToast();
  // Novo campo dedicado: default [] quando ausente. Sem migração de dados — em
  // orçamentos antigos, itens de produção que tenham ficado gravados em
  // `checklist` permanecem lá intactos até serem re-aplicados aqui.
  const [items, setItems] = useState<ChecklistItem[]>(quote.productionPlan ?? []);
  const [newLabel, setNewLabel] = useState("");
  const [newPhase, setNewPhase] = useState<string>(DECOR_PRODUCTION[0].key);
  // A colisão fica no ECRÃ, e não num toast que desaparece: é onde o gesto que
  // não passou continua à vista e recuperável com um clique.
  const [colisoes, setColisoes] = useState<Colisao[]>([]);
  const suppliers = quote.eventSuppliers ?? [];

  /**
   * Otimista com reversão — mas a reversão é para o último estado que o SERVIDOR
   * confirmou, e só quando não há gravação mais recente.
   *
   * `const snapshot = items` era lido ANTES do `await`, ou seja um instante que
   * já passou. O atelier risca tarefas em série, portanto dois PATCH no ar são o
   * caso normal: o segundo leva o plano INTEIRO (já com a primeira marcação
   * dentro) e o servidor fica com as duas; a primeira, ao falhar, repunha o
   * instante anterior às DUAS e desriscava uma tarefa que estava gravada.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<ChecklistItem[]>(quote.productionPlan ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * DE ONDE ESTE PLANO FOI COPIADO
   * ══════════════════════════════════════════════════════════════════════
   *
   * O plano é copiado UMA vez, ao montar, e ao gravar vai INTEIRO — logo a
   * gravação é «substitui o plano por este», e não «risca esta tarefa».
   *
   * O CENÁRIO, sem corrida nenhuma e com as duas gravações a responder 200:
   * duas pessoas no atelier, cada uma com o seu telemóvel, a riscar o mesmo
   * plano ao longo da manhã. A que abriu o painel primeiro risca uma tarefa às
   * onze e manda o plano que copiou às nove — e as seis tarefas que a colega
   * riscou pelo meio voltam todas a por fazer. Ninguém vê nada; o que se vê é
   * o trabalho a aparecer por fazer no dia seguinte.
   *
   * `base` é a versão de que este plano partiu. Vai no pedido, o servidor
   * compara-a com a que tem e recusa com 409 (ver `api/orcamento/[id]`).
   *
   * Avança ao ENVIAR e não ao confirmar: riscar duas tarefas seguidas põe dois
   * PATCH no ar e o segundo já leva o primeiro lá dentro — declarar a versão
   * de antes do primeiro era inventar uma colisão dela consigo própria.
   */
  const base = useRef<ChecklistItem[]>(quote.productionPlan ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * A GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * As quatro acções do plano passam por aqui, e todas falhavam com «Não foi
   * possível guardar o plano de produção. Tenta novamente.» — a mesma frase
   * para a rede em baixo, a sessão expirada, o pedido apagado por outra pessoa
   * e o servidor em baixo. Nos dois do meio, repetir não resolve nada.
   *
   * O `oQue` nomeia a TAREFA: o plano tem trinta linhas, a reversão desfaz uma
   * só, e sem o nome ninguém sabe qual delas se desriscou sozinha no ecrã.
   */
  async function persist(oQue: string, reaplicar: (atuais: ChecklistItem[]) => ChecklistItem[]) {
    const next = reaplicar(items);
    const minha = ++gravacoes.current;
    setItems(next);
    onChange?.(next);
    const baseAnterior = base.current;
    base.current = next;

    // Desfaz o que foi posto no ecrã e diz porquê — a não ser que já haja uma
    // gravação mais recente: o que essa levar contém o que esta levava,
    // portanto não há nada a desfazer nem nada a dizer. Se ELA também falhar, é
    // ela que repõe — e para o mesmo sítio.
    const reporEDizer = (mensagem: string) => {
      if (minha !== gravacoes.current) return;
      // A base acompanha o que fica no ecrã: declarar uma versão que nunca
      // chegou a ser gravada dava um 409 inventado na gravação seguinte.
      base.current = gravado.current;
      setItems(gravado.current);
      onChange?.(gravado.current);
      toast(mensagem, "error");
    };

    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionPlan: next, base: { productionPlan: baseAnterior } }),
      });
    } catch {
      reporEDizer(porqueRebentou(oQue).mensagem);
      return;
    }
    /**
     * 409 não é «tenta outra vez»: é «isto mudou noutro sítio», e repetir a
     * mesma lista era desriscar o que a colega riscou. Adopta-se o que o
     * servidor tem — e o gesto fica guardado no aviso, para o poder voltar a
     * aplicar por cima dessa versão sem perder nem um lado nem o outro. Por
     * isso a frase não é a do `porqueFalhou`: aqui não se manda recarregar
     * nada, o plano já está em dia no ecrã.
     */
    if (res.status === 409) {
      const corpo = (await res.json().catch(() => null)) as {
        current?: { productionPlan?: ChecklistItem[] };
      } | null;
      const doServidor = corpo?.current?.productionPlan ?? gravado.current;
      gravado.current = doServidor;
      base.current = doServidor;
      if (minha === gravacoes.current) {
        setItems(doServidor);
        onChange?.(doServidor);
      }
      // Dois gestos podem colidir os dois (dois toques dela enquanto a
      // outra pessoa gravava). Cada gesto é um DELTA, portanto o mais
      // recente não contém o anterior: guardam-se todos, por ordem de
      // envio, e reaplicam-se por essa ordem — senão o primeiro perdia-se
      // ao chegar o segundo, e as respostas nem sequer vêm por ordem.
      setColisoes((c) => [...c, { n: minha, oQue, reaplicar }].sort((a, b) => a.n - b.n));
      return;
    }
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      reporEDizer(porqueFalhou(oQue, res, corpo).mensagem);
      return;
    }
    if (minha === gravacoes.current) gravado.current = next;
  }

  /**
   * Os gestos que o 409 travou, agora POR CIMA do plano que veio do servidor
   * — e pela ordem por que ela os fez, que é a única em que dão o mesmo
   * resultado. Uma gravação só: o que ela quis fica todo dentro dela.
   */
  function voltarAAplicar() {
    if (colisoes.length === 0) return;
    const gestos = colisoes;
    setColisoes([]);
    void persist(gestos.map((g) => g.oQue).join(" e "), (atuais) =>
      gestos.reduce((lista: ChecklistItem[], g) => g.reaplicar(lista), atuais),
    );
  }

  function applyPlan() {
    const existing = new Set(items.map((i) => i.label));
    const additions = buildProductionPlanItems(randomId, existing);
    if (additions.length === 0) return;
    void persist(
      `aplicar o plano de produção (${additions.length} ${
        additions.length === 1 ? "tarefa" : "tarefas"
      })`,
      // O dedupe por rótulo repete-se aqui dentro: se isto for reaplicado
      // depois de uma colisão, o plano de que parte já é o do servidor — e a
      // colega pode ter aplicado o mesmo modelo entretanto. Sem isto, voltar a
      // aplicar duplicava trinta tarefas.
      (atuais) => [...atuais, ...additions.filter((a) => !atuais.some((i) => i.label === a.label))],
    );
  }

  function toggle(id: string) {
    const tarefa = items.find((i) => i.id === id);
    // O alvo é o `done` que ela quis, e não «o contrário do que lá estiver»:
    // reaplicado por cima da versão do servidor, um `!i.done` cego voltava a
    // desriscar a tarefa se a colega já a tivesse riscado entretanto.
    const querFicar = !tarefa?.done;
    void persist(
      `${tarefa?.done ? "desmarcar" : "marcar"} «${tarefa?.label ?? "a tarefa"}»`,
      (atuais) => atuais.map((i) => (i.id === id ? { ...i, done: querFicar } : i)),
    );
  }

  function removeItem(id: string) {
    const tarefa = items.find((i) => i.id === id);
    void persist(`remover «${tarefa?.label ?? "a tarefa"}» do plano`, (atuais) =>
      atuais.filter((i) => i.id !== id),
    );
  }

  // Tarefa própria: prefixa a fase escolhida (mesmo formato do seed) para o
  // agrupamento por fase continuar a funcionar.
  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const phase = DECOR_PRODUCTION.find((p) => p.key === newPhase) ?? DECOR_PRODUCTION[0];
    // O id nasce aqui e não dentro do gesto: reaplicar depois de uma colisão
    // tem de acrescentar a MESMA tarefa, não uma segunda cópia.
    const tarefa = { id: randomId(), label: `${phase.label}${SEP}${label}`, done: false };
    void persist(`acrescentar «${label}» a ${phase.label}`, (atuais) => [...atuais, tarefa]);
    setNewLabel("");
  }

  /**
   * Group the production plan by phase via the label prefix — MAIS o que não
   * cair em fase nenhuma.
   *
   * O crachá «X/Y do plano» lê a lista inteira e a vista só desenhava o que
   * tivesse prefixo: uma tarefa sem ele era contada e invisível, e — sem linha
   * — também não tinha caixa para riscar nem × para remover. Ficava presa no
   * plano a puxar o denominador, com ela a contar cinco no ecrã e a ler «2/6».
   *
   * E o rótulo não é um campo privado deste painel: repor uma cópia de
   * segurança traz o `productionPlan` do ficheiro tal e qual (`looseObject`), o
   * PATCH aceita qualquer texto até 300 caracteres, e mudar o NOME de uma fase
   * em `DECOR_PRODUCTION` desprende de uma vez tudo o que já está gravado (o
   * que se guarda é o rótulo, não a chave da fase).
   *
   * O grupo das sobras só existe quando há sobras — com o plano normal não há
   * secção nenhuma a mais.
   */
  const grupos = useMemo(() => {
    const porFase = DECOR_PRODUCTION.map((phase) => {
      const prefixo = phase.label + SEP;
      return {
        key: phase.key,
        titulo: phase.label,
        prefixo,
        itens: items.filter((i) => i.label.startsWith(prefixo)),
      };
    });
    const arrumados = new Set(porFase.flatMap((g) => g.itens.map((i) => i.id)));
    const sobras = items.filter((i) => !arrumados.has(i.id));
    const todos =
      sobras.length > 0
        ? [...porFase, { key: "sem-fase", titulo: "Sem fase", prefixo: "", itens: sobras }]
        : porFase;
    return todos.map((g) => ({ ...g, feitos: g.itens.filter((i) => i.done).length }));
  }, [items]);

  // O crachá e o desenho passam a ler a MESMA lista: se há itens, há-os para
  // ver. Era esta a distância que deixava o vazio «por gerar» ao lado de um
  // crachá que já contava tarefas — e aplicar o plano por cima duplicava-as.
  const seeded = items.length > 0;

  return (
    // O `pt-5` eram 20 px a qualquer largura. `--bo-p-vista` (12 → 24) é o
    // token que os painéis vizinhos desta zona passaram a ler para o mesmo
    // separador — um só ritmo, e 8 px de volta no telemóvel.
    <div className="border-t border-[var(--bo-hairline-strong)] pt-[var(--bo-p-vista)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="bo-eyebrow">Produção Decor</p>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 0 && (
            <span className="rounded-full bg-[var(--bo-tinta-6)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--bo-text-faint)]">
              {items.filter((i) => i.done).length}/{items.length} do plano
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={applyPlan}
            iconLeft={<span aria-hidden="true">+</span>}
          >
            Aplicar plano de produção
          </Button>
        </div>
      </div>

      {/* ── A COLISÃO FICA À VISTA, E COM SAÍDA ────────────────────────────
          Um toast desaparece sozinho e leva com ele a única pista do que não
          ficou guardado. Aqui o plano do servidor já está no ecrã (é a
          verdade), e este aviso fica ao lado a dizer o que é que ela estava a
          fazer quando ele chegou — com o gesto ainda por aplicar, à distância
          de um clique. Reaplicar é somar-se ao que a colega riscou, não
          apagá-lo: o gesto corre por cima da versão adoptada. */}
      {colisoes.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[#8a2a22]/25 bg-[#f6e6df]/50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-[#8a2a22]">
            Não deu para {colisoes.map((c) => c.oQue).join(" e ")}: o plano mudou noutro sítio
            entretanto.
          </p>
          <p className="bo-text-muted mt-1">
            O plano que está no ecrã é o que ficou guardado. Não se perdeu nada — podes voltar a
            aplicar o que estavas a fazer por cima dele.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={voltarAAplicar}>
              Voltar a aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setColisoes([])}>
              Ficar com a versão guardada
            </Button>
          </div>
        </div>
      )}

      {!seeded ? (
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
              <path d="M12 3 3 8l9 5 9-5-9-5Z" />
              <path d="m3 13 9 5 9-5" />
            </svg>
          }
          title="Plano de produção por gerar"
          description="Gera as tarefas de atelier — do sourcing das flores à desmontagem no local — e ajusta-as a este evento."
          action={{ label: "Aplicar plano de produção", onClick: applyPlan }}
        />
      ) : (
        <div className="flex flex-col gap-4 mb-4">
          {grupos.map(({ key, titulo, prefixo, itens, feitos }) => {
            if (itens.length === 0) return null;
            const pct = Math.round((feitos / itens.length) * 100);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[var(--bo-text-faint)] text-[11px] font-medium tracking-[0.08em] uppercase">
                    {titulo}
                  </p>
                  <span className="text-foreground/35 text-[10px] tabular-nums bg-[var(--bo-tinta-6)] rounded-full px-2 py-0.5">
                    {feitos}/{itens.length}
                  </span>
                </div>
                <div className="h-1 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full w-full origin-left bg-[#4d6350] rounded-full motion-safe:transition-transform motion-safe:duration-500"
                    style={{ transform: `scaleX(${fraccaoDaBarra(pct, 100)})` }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  {itens.map((i) => (
                    <div key={i.id} className="group flex items-center gap-2.5 py-1.5">
                      {/* 16×16 medidos a 375 px — a mais pequena caixa de
                          marcar do dossier, pouco mais de um terço dos 44 do
                          mínimo. Mesma correcção da checklist do evento:
                          cresce o botão, o quadrado desenhado fica nos 16 no
                          `span` de dentro. */}
                      <button
                        onClick={() => toggle(i.id)}
                        role="checkbox"
                        aria-checked={i.done}
                        aria-label={i.label}
                        className="alvo-toque shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${i.done ? "bg-[#4d6350] border-[#4d6350]" : "border-foreground/25 hover:border-[#4d6350]/60"}`}
                        >
                          {i.done && (
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
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
                      <span
                        className={`flex-1 text-sm ${i.done ? "text-foreground/35 line-through" : "text-[var(--bo-tinta-72)]"}`}
                      >
                        {/* Sem fase não há prefixo a cortar: mostra-se inteiro. */}
                        {i.label.slice(prefixo.length)}
                      </span>
                      {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 30 destes botões e
                            ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                            disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                            PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                            há mesmo rato, e a 375 e a 768 com dedo ficam os 30 visíveis.

                            Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                            os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
                      <button
                        type="button"
                        onClick={() => removeItem(i.id)}
                        aria-label="Remover tarefa"
                        className="alvo-toque shrink-0 p-1 text-foreground/20 sem-rato:text-[var(--bo-text-faint)] hover:text-[#8a2a22] opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 transition-all"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Adicionar uma tarefa própria a qualquer fase do plano. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={newPhase}
          onChange={(e) => setNewPhase(e.target.value)}
          aria-label="Fase"
          className="bo-input w-auto px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
        >
          {DECOR_PRODUCTION.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCustom();
          }}
          placeholder="Nova tarefa (ex.: encomendar velas)"
          aria-label="Nova tarefa de produção"
          className="bo-input min-w-[10rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-text)]"
        />
        <Button
          size="sm"
          onClick={addCustom}
          disabled={!newLabel.trim()}
          iconLeft={<span aria-hidden="true">+</span>}
        >
          Adicionar
        </Button>
      </div>

      {/* Suppliers assigned to this event — managed in Custos, shown read-only. */}
      <div className="mt-5 pt-4 border-t border-[var(--bo-hairline)]">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-foreground/45 text-[11px] tracking-[0.1em] uppercase">
            Fornecedores atribuídos
          </p>
          {suppliers.length > 0 && (
            <span className="text-foreground/35 text-[10px] tabular-nums bg-[var(--bo-tinta-6)] rounded-full px-2 py-0.5">
              {suppliers.length}
            </span>
          )}
        </div>
        {suppliers.length === 0 ? (
          <p className="text-foreground/45 text-xs leading-relaxed">
            Sem fornecedores atribuídos. Faz a gestão no separador Custos.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {suppliers.map((s) => {
              // `STATUS_LABEL[s.status].color` à bruta era `undefined.color`
              // assim que aparecesse um estado de fora — uma linha antiga, uma
              // migração, uma correcção feita à mão na base de dados. Num
              // componente de cliente isso não perde a linha do fornecedor:
              // perde o back office inteiro para o ecrã de erro. O valor cru
              // fica à vista, em cinzento, para se saber qual é a linha.
              const estado = metaFor(STATUS_LABEL, s.status);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2.5 bg-[var(--bo-tinta-3)] border border-[var(--bo-hairline)] rounded-xl px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[var(--bo-text)] text-xs font-medium truncate">{s.name}</p>
                    <p className="text-foreground/45 text-[10px]">{s.category}</p>
                  </div>
                  <span
                    className="text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md shrink-0 font-medium"
                    style={{
                      background: `${estado.color}1f`,
                      color: estado.color,
                    }}
                  >
                    {estado.label}
                  </span>
                  <span className="text-[var(--bo-text-faint)] text-[11px] tabular-nums shrink-0">
                    {eur2(s.estimatedCost)}
                  </span>
                </div>
              );
            })}
            <p className="text-foreground/40 text-[10px] mt-1">Geridos no separador Custos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
