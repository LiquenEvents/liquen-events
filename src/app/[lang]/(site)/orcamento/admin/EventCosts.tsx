"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseMoney, randomId, eur2 } from "./util";
import { useToast } from "./Toast";
import type { Quote, EventSupplier, EventSupplierStatus, Supplier } from "@/lib/orcamento/types";
import { contractedAmounts, effectiveVatRate } from "@/lib/orcamento/dossier";
import { round2 } from "@/lib/money";
import { Button, Field, EmptyState } from "./ui";
import { metaFor } from "./status-meta";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

const STATUS_META: Record<EventSupplierStatus, { label: string; color: string }> = {
  contactado: { label: "Contactado", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#7c854b" },
  pago: { label: "Pago", color: "#4d6350" },
};

/**
 * As três peças de um quadrado de número — a caixa, o valor, o rótulo e a nota.
 *
 * Ficam em constantes porque os três quadrados têm de mudar de forma AO MESMO
 * TEMPO: abaixo dos 26 rem de painel são três linhas de uma caixa só, acima são
 * três cartões. Um deles ficar para trás é a leitura partir-se a meio.
 *
 * O `PaymentsPanel` tem o mesmo bloco, com os mesmos limiares e as mesmas
 * razões — os dois vivem lado a lado no dossier e não podem divergir.
 */
const QUADRADO =
  "flex flex-wrap items-baseline gap-x-3 p-3 text-left " +
  "@min-[26rem]:block @min-[26rem]:rounded-xl @min-[26rem]:border " +
  "@min-[26rem]:border-foreground/[0.06] @min-[26rem]:bg-foreground/[0.03] @min-[26rem]:text-center";

/** O número. `whitespace-nowrap` é o que impede «202 889,00 €» de partir em duas. */
const VALOR =
  "order-2 ml-auto whitespace-nowrap text-sm font-semibold tabular-nums " +
  "@min-[26rem]:order-none @min-[26rem]:ml-0";

/** O rótulo, que abre a linha no telemóvel e volta para baixo do número a 26 rem. */
const ROTULO =
  "order-1 text-[10px] uppercase tracking-[0.16em] text-foreground/45 @min-[26rem]:mt-1";

/** A linha de apoio (o valor com IVA, o aviso de prejuízo): sempre por baixo. */
const NOTA =
  "order-3 mt-1 w-full text-[9px] leading-tight tabular-nums text-foreground/35 @min-[26rem]:w-auto";

const CATEGORIES = [
  "Catering",
  "Floristas",
  "Música/DJ",
  "Fotografia",
  "Vídeo",
  "Decoração",
  "Espaços",
  "Audiovisual",
  "Transporte",
  "Outro",
];

interface Props {
  quote: Quote;
  onChange: (eventSuppliers: EventSupplier[]) => void;
}

/**
 * Uma gravação que o servidor recusou por os custos terem mudado noutro sítio.
 *
 * Guarda-se o GESTO, não a lista que ele produziu: voltar a mandar a lista era
 * apagar o custo que a outra pessoa acabou de escrever — exactamente o que o
 * 409 existe para impedir. O gesto volta a aplicar-se POR CIMA da versão
 * adoptada, e ficam os dois números.
 */
interface Colisao {
  /** O número da gravação que colidiu — é o que põe os gestos por ordem. */
  n: number;
  /** O gesto, nomeado: «guardar o custo real de «Flores da Vila»». */
  oQue: string;
  /** O mesmo gesto, para o repetir sobre a versão que veio do servidor. */
  reaplicar: (atuais: EventSupplier[]) => EventSupplier[];
}

/**
 * Per-event supplier bookings with budgeted vs actual cost. Combined with the
 * event's revenue (quotedPrice) it gives a live margin — the single most useful
 * number for running events profitably. Suppliers can be picked from the
 * directory or typed free-hand; the name is denormalised so the booking
 * survives if the directory entry is later removed.
 */
export default function EventCosts({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<EventSupplier[]>(quote.eventSuppliers ?? []);
  const [directory, setDirectory] = useState<Supplier[]>([]);
  /** A leitura do diretório falhou. Ver o `useEffect` mais abaixo: um diretório
   *  que não se conseguiu ler não é um diretório vazio. */
  const [diretorioFalhou, setDiretorioFalhou] = useState(false);
  const [adding, setAdding] = useState(false);
  // A colisão fica no ECRÃ, e não num toast que desaparece: é onde o número
  // que ela escreveu continua à vista e recuperável com um clique.
  const [colisoes, setColisoes] = useState<Colisao[]>([]);
  // Buffer de escrita por campo ("id:est" / "id:act") — deixa escrever "1.500,50"
  // livremente e só grava (um PATCH) ao sair do campo, em vez de a cada tecla.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    category: "Catering",
    estimatedCost: "",
    supplierId: "" as string | "",
  });

  /**
   * Lê o diretório de fornecedores, para as reservas se poderem escolher lá.
   *
   * O `catch(() => {})` que aqui estava engolia a falha inteira: sem diretório,
   * o seletor «Do diretório de fornecedores» simplesmente NÃO APARECE — e o
   * formulário fica igual ao de quem ainda não tem fornecedores nenhuns. Quem
   * o vê escreve o nome à mão, e a reserva nasce solta do diretório (sem
   * `supplierId`), que é precisamente o que a denormalização do nome existe
   * para evitar. Uma leitura que não aconteceu não pode passar por «não há
   * nada»: agora diz-se, no sítio onde o seletor devia estar.
   */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/fornecedores", { cache: "no-store" });
        const d = r.ok ? await r.json().catch(() => null) : null;
        if (!vivo) return;
        if (Array.isArray(d)) setDirectory(d);
        else setDiretorioFalhou(true);
      } catch {
        if (vivo) setDiretorioFalhou(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Receita e custos comparados na MESMA base (sem IVA): o preço "Preço final
  // (sem IVA)" já é líquido; os custos de fornecedor são com IVA e o IVA é
  // dedutível, por isso divide-se por (1+taxa). Assim a margem é o lucro real —
  // antes comparava receita sem IVA com custos com IVA (margem falsamente baixa).
  const amounts = contractedAmounts(quote);
  const vatRate = effectiveVatRate(quote);
  const totals = useMemo(() => {
    let estimated = 0;
    let actual = 0;
    for (const it of items) {
      estimated += it.estimatedCost || 0;
      actual += it.actualCost ?? it.estimatedCost ?? 0;
    }
    const actualNet = round2(actual / (1 + vatRate));
    const revenueNet = amounts.net;
    const margin = round2(revenueNet - actualNet);
    const marginPct = revenueNet > 0 ? Math.round((margin / revenueNet) * 100) : 0;
    return { estimated, actual, actualNet, revenueNet, margin, marginPct };
  }, [items, amounts.net, vatRate]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * A GRAVAÇÃO, E DOIS DEFEITOS QUE ESTAVAM AQUI
   * ══════════════════════════════════════════════════════════════════════
   *
   * O primeiro é a frase: todas as escritas deste painel falhavam com «Não foi
   * possível guardar o custo. Tenta novamente.» — a mesma para a rede em
   * baixo, a sessão expirada, o pedido apagado por outra pessoa e o servidor
   * em baixo. Nos dois do meio, repetir não pode funcionar; e nenhuma dizia de
   * QUE fornecedor falava, num painel que mostra nove linhas.
   *
   * O segundo é a reversão. `const snapshot = items` era lido ANTES do pedido,
   * ou seja um instante que já passou. Aqui grava-se campo a campo, ao sair de
   * cada caixa: escrever o orçado, saltar para o real e sair põe dois PATCH no
   * ar, e o segundo leva a lista INTEIRA (já com o primeiro valor dentro). Se o
   * primeiro falhasse, repunha o instante anterior aos DOIS e apagava do ecrã
   * um custo que o servidor tinha aceitado — e estes números são a margem, o
   * número por que ela decide se o evento vale a pena.
   *
   * A correcção é a mesma dos outros painéis do dossier: repõe-se para o
   * último estado que o SERVIDOR confirmou, e só quando não há gravação mais
   * recente.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<EventSupplier[]>(quote.eventSuppliers ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * DE ONDE ESTA LISTA DE CUSTOS FOI COPIADA
   * ══════════════════════════════════════════════════════════════════════
   *
   * A lista é copiada UMA vez, ao montar, e ao gravar vai INTEIRA — logo a
   * gravação é «substitui os custos por estes», e não «muda o real deste
   * fornecedor».
   *
   * O CENÁRIO, sem corrida nenhuma e com as duas gravações a responder 200:
   * ele recebe a factura do catering e escreve o custo real, 4 200 €. Ela tem
   * o painel aberto desde a manhã e, à tarde, marca a florista como paga — e
   * manda a lista de manhã, onde o catering ainda tem só o orçado de 3 000 €.
   * O real do catering desaparece e a margem do evento sobe 1 200 € sozinha.
   * É por este número que se decide se o evento valeu a pena.
   *
   * `base` é a versão de que esta lista partiu. Vai no pedido, o servidor
   * compara-a com a que tem e recusa com 409 (ver `api/orcamento/[id]`).
   *
   * Avança ao ENVIAR e não ao confirmar: escrever o orçado, saltar para o real
   * e sair põe dois PATCH no ar, e o segundo já leva o primeiro lá dentro —
   * declarar a versão de antes do primeiro era inventar uma colisão dela
   * consigo própria a meio de um gesto normal.
   */
  const base = useRef<EventSupplier[]>(quote.eventSuppliers ?? []);

  function persist(oQue: string, reaplicar: (atuais: EventSupplier[]) => EventSupplier[]) {
    const next = reaplicar(items);
    const minha = ++gravacoes.current;
    setItems(next);
    onChange(next);
    const baseAnterior = base.current;
    base.current = next;

    const reporEDizer = (mensagem: string) => {
      // Já foi substituída por uma gravação mais recente: o que essa levar
      // contém o que esta levava, portanto não há nada a desfazer nem nada a
      // dizer. Se ELA também falhar, é ela que repõe — e para o mesmo sítio.
      if (minha !== gravacoes.current) return;
      // A base acompanha o que fica no ecrã: declarar uma versão que nunca
      // chegou a ser gravada dava um 409 inventado na gravação seguinte.
      base.current = gravado.current;
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
          body: JSON.stringify({ eventSuppliers: next, base: { eventSuppliers: baseAnterior } }),
        });
      } catch {
        reporEDizer(porqueRebentou(oQue).mensagem);
        return;
      }
      /**
       * 409 não é «tenta outra vez»: é «isto mudou noutro sítio», e repetir a
       * mesma lista era apagar o custo que ele acabou de lançar. Adopta-se o
       * que o servidor tem — e o gesto dela fica guardado no aviso, para o
       * poder voltar a aplicar por cima dessa versão sem perder nem um número
       * nem o outro. Por isso a frase não é a do `porqueFalhou`: aqui não se
       * manda recarregar nada, a lista já está em dia no ecrã.
       */
      if (res.status === 409) {
        const corpo = (await res.json().catch(() => null)) as {
          current?: { eventSuppliers?: EventSupplier[] };
        } | null;
        const doServidor = corpo?.current?.eventSuppliers ?? gravado.current;
        gravado.current = doServidor;
        base.current = doServidor;
        if (minha === gravacoes.current) {
          setItems(doServidor);
          onChange(doServidor);
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
    })();
  }

  /**
   * Os gestos que o 409 travou, agora POR CIMA da lista que veio do servidor
   * — e pela ordem por que ela os fez, que é a única em que dão o mesmo
   * resultado. Uma gravação só: o que ela quis fica todo dentro dela.
   */
  function voltarAAplicar() {
    if (colisoes.length === 0) return;
    const gestos = colisoes;
    setColisoes([]);
    persist(gestos.map((g) => g.oQue).join(" e "), (atuais) =>
      gestos.reduce((lista: EventSupplier[], g) => g.reaplicar(lista), atuais),
    );
  }

  function add() {
    const name = form.name.trim();
    if (!name) return;
    const est = parseMoney(form.estimatedCost) ?? 0;
    // A reserva nasce AQUI e não dentro do gesto: reaplicá-la depois de uma
    // colisão tem de acrescentar a MESMA linha, e não uma segunda com id novo.
    const reserva: EventSupplier = {
      id: randomId(),
      supplierId: form.supplierId || undefined,
      name,
      category: form.category,
      estimatedCost: est,
      status: "contactado",
    };
    persist(`acrescentar «${name}» aos custos do evento`, (atuais) => [...atuais, reserva]);
    setForm({ name: "", category: "Catering", estimatedCost: "", supplierId: "" });
    setAdding(false);
  }

  function update(oQue: string, id: string, patch: Partial<EventSupplier>) {
    persist(oQue, (atuais) => atuais.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function remove(id: string) {
    const it = items.find((x) => x.id === id);
    persist(`remover «${it?.name ?? "o fornecedor"}» dos custos`, (atuais) =>
      atuais.filter((x) => x.id !== id),
    );
  }

  // Cycle the booking status with a single tap (contactado → confirmado → pago).
  function cycleStatus(it: EventSupplier) {
    const order: EventSupplierStatus[] = ["contactado", "confirmado", "pago"];
    const next = order[(order.indexOf(it.status) + 1) % order.length];
    update(`marcar «${it.name}» como ${STATUS_META[next].label.toLowerCase()}`, it.id, {
      status: next,
    });
  }

  // Picking a directory supplier prefills name + category.
  function pickDirectory(supplierId: string) {
    const s = directory.find((x) => x.id === supplierId);
    setForm((f) => ({
      ...f,
      supplierId,
      name: s ? s.name : f.name,
      category: s ? s.category : f.category,
    }));
  }

  return (
    // `@container`: os três quadrados de número aqui em baixo reagem à largura
    // DESTE painel, não à da janela — ele vive no dossier, onde a coluna lateral
    // lhe rouba largura sem a janela encolher. É o mesmo que o `PaymentsPanel`
    // já faz, e pela mesma razão.
    //
    // O `pt-6` do separador eram 24 px de ar por cima do título, iguais a 375 e
    // a 1440 — e na mesma zona do dossier há quatro painéis destes, cada um a
    // pagar os seus. `--bo-p-vista` é o token do respiro vertical de uma vista
    // (12 → 24): devolve 12 px por painel no telemóvel e deixa o computador
    // exactamente como estava.
    <div className="@container border-t border-foreground/10 pt-[var(--bo-p-vista)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Fornecedores &amp; Custos</p>
        {items.length > 0 && (
          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[11px] tabular-nums text-foreground/55">
            {items.length}
          </span>
        )}
      </div>

      {/* ── A COLISÃO FICA À VISTA, E COM SAÍDA ────────────────────────────
          Um toast desaparece sozinho e leva com ele a única pista do que não
          ficou guardado — e aqui o que não ficou guardado é um número que ela
          copiou de uma factura em papel. A lista do servidor já está no ecrã
          (é a verdade) e este aviso fica em cima a dizer o que é que ela
          estava a fazer quando ele chegou, com o gesto à distância de um
          clique. Reaplicar é somar-se ao que ele lançou, não apagá-lo: o gesto
          corre por cima da versão adoptada. */}
      {colisoes.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-[#a03a1a]/25 bg-[#f6e6df]/50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-[#a03a1a]">
            Não deu para {colisoes.map((c) => c.oQue).join(" e ")}: os custos mudaram noutro sítio
            entretanto.
          </p>
          <p className="bo-text-muted mt-1">
            A lista que está no ecrã é a que ficou guardada. Não se perdeu nada — podes voltar a
            aplicar o que estavas a fazer por cima dela.
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

      {/* Margin summary — the headline number. Receita/Custos/Margem na mesma base
          (sem IVA) para reconciliarem no ecrã; o valor com IVA vai por baixo. */}
      {/* ── O TERCEIRO NÍVEL DE MOLDURA, E PORQUE É QUE ELE SAI ────────────
          Estes três quadrados são uma caixa DENTRO do cartão de zona, que já
          está dentro de uma coluna. Medido a 375 px: sobram 279 px para o
          painel, e duas colunas com `p-3` deixavam **110 px** de conteúdo por
          célula. «202 889,00 €» precisa de 109 — ou seja, o número mais alto
          que ela lança aqui ficava a um pixel de partir, e partia mesmo assim
          que o rótulo por baixo era mais largo do que ele.

          Abaixo dos 26 rem os quadrados perdem a moldura própria e passam a
          três linhas dentro da MESMA caixa, separadas por um risco: rótulo à
          esquerda, número à direita. A célula passa de 110 para **255 px** de
          conteúdo, e o `whitespace-nowrap` garante que o valor nunca se parte
          ao meio — se não couber ao lado do rótulo, o `flex-wrap` dá-lhe uma
          linha inteira em vez de o embrulhar. É o padrão do `Overview.tsx`
          (:1641), aqui em *container query* e não em `sm:` porque a pergunta é
          sobre a largura DESTE painel, não sobre a da janela: num iPad a
          768 px o `sm:` disparava e o painel continuava com os mesmos 279.

          A partir de 26 rem volta tudo ao que era: três cartões com a sua
          moldura, os números ao centro. No computador não muda nada. */}
      <div className="mb-5 flex flex-col divide-y divide-foreground/[0.08] rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] @min-[26rem]:grid @min-[26rem]:grid-cols-3 @min-[26rem]:gap-2.5 @min-[26rem]:divide-y-0 @min-[26rem]:rounded-none @min-[26rem]:border-0 @min-[26rem]:bg-transparent">
        <div className={QUADRADO}>
          <p className={`${VALOR} text-foreground/80`}>{eur2(totals.revenueNet)}</p>
          <p className={ROTULO}>Receita (s/ IVA)</p>
          <p className={NOTA}>c/ IVA {eur2(amounts.gross)}</p>
        </div>
        <div className={QUADRADO}>
          <p className={`${VALOR} text-[#a4642f]`}>{eur2(totals.actualNet)}</p>
          <p className={ROTULO}>Custos (s/ IVA)</p>
          <p className={NOTA}>c/ IVA {eur2(totals.actual)}</p>
        </div>
        <div className={QUADRADO}>
          <p className={`${VALOR} ${totals.margin >= 0 ? "text-[#4d6350]" : "text-[#8a2a22]"}`}>
            {eur2(totals.margin)}
          </p>
          <p className={ROTULO}>Margem{totals.revenueNet > 0 ? ` · ${totals.marginPct}%` : ""}</p>
          {totals.margin < 0 && (
            <p className="order-3 mt-1 w-full text-[9px] uppercase leading-tight tracking-[0.12em] text-[#8a2a22] @min-[26rem]:w-auto">
              Prejuízo
            </p>
          )}
        </div>
      </div>

      {/* Bookings list */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="group rounded-xl border border-foreground/[0.08] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(42,38,32,0.04)]"
            >
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground/80">{it.name}</p>
                  <p className="text-[11px] text-foreground/45">{it.category}</p>
                </div>
                {/* Parece uma pastilha de estado, mas é um botão: cada toque
                    faz rodar contactado → confirmado → pago. Media 27 px de
                    altura a 375 px (49 a 88 de largura, conforme a palavra), e
                    fica encostado ao «Remover» da mesma linha — falhar-lhe o
                    alvo é apagar o fornecedor.

                    A cor pintada fica no `span`, e não no botão: com o fundo
                    no alvo de 44 px a pastilha passava a ser um bloco de cor
                    do tamanho de um botão principal, e esta é uma marca de
                    estado, não a acção mais importante da linha. Assim o
                    desenho fica igual ao que era e só o alvo cresce — a mesma
                    divisão das caixas de marcar deste dossier. */}
                <button
                  onClick={() => cycleStatus(it)}
                  className="alvo-toque shrink-0 motion-safe:transition-opacity hover:opacity-80"
                  title="Clica para mudar o estado"
                >
                  <span
                    className="rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.1em]"
                    style={{
                      background: `${metaFor(STATUS_META, it.status).color}18`,
                      color: metaFor(STATUS_META, it.status).color,
                    }}
                  >
                    {metaFor(STATUS_META, it.status).label}
                  </span>
                </button>
                {/* MEDIDO a 768×1024 com dedo (o iPad em retrato): 9 destes botões e
                      ZERO visíveis. 768 passa dos 640 do `sm:`, portanto `sm:opacity-0`
                      disparava — e sem rato não há como o revelar. A pergunta certa é sobre o
                      PONTEIRO, não sobre a largura: `com-rato:` (globals.css) esconde só onde
                      há mesmo rato, e a 375 e a 768 com dedo ficam os 9 visíveis.

                      Fica um ícone e não um menu «⋯»: com UMA acção por linha, o menu custa
                      os mesmos 44 px e cobra um toque a mais para chegar ao mesmo sítio. */}
                <button
                  onClick={() => remove(it.id)}
                  className="alvo-toque shrink-0 p-1 text-foreground/25 sem-rato:text-foreground/55 opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 hover:text-[#8a2a22] motion-safe:transition-all"
                  aria-label="Remover"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* Dois campos de dinheiro a 16 px (o piso de `pointer: coarse`).
                  Medido a 375 px: o painel tem 279, a moldura da linha come
                  28 (`px-3.5`) e as duas colunas ficam com 119 cada — e um
                  valor de seis algarismos a 16 px precisa de 115 mais o
                  `px-2` do campo. Empilham por omissão e voltam a par assim
                  que o PAINEL tem 22 rem, que é o limiar que o
                  `StatsDashboard` já usa para a mesma pergunta. */}
              <div className="mt-3 grid grid-cols-1 gap-3 @min-[22rem]:grid-cols-2">
                <Field
                  as="input"
                  type="text"
                  inputMode="decimal"
                  label="Orçado (€)"
                  value={draft[`${it.id}:est`] ?? (it.estimatedCost || "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [`${it.id}:est`]: e.target.value }))}
                  onBlur={(e) => {
                    update(`guardar o orçado de «${it.name}»`, it.id, {
                      estimatedCost: parseMoney(e.target.value) ?? 0,
                    });
                    setDraft((d) => {
                      const n = { ...d };
                      delete n[`${it.id}:est`];
                      return n;
                    });
                  }}
                  placeholder="0"
                />
                <Field
                  as="input"
                  type="text"
                  inputMode="decimal"
                  label="Real (€)"
                  value={draft[`${it.id}:act`] ?? it.actualCost ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [`${it.id}:act`]: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    update(`guardar o custo real de «${it.name}»`, it.id, {
                      actualCost: v === "" ? undefined : (parseMoney(v) ?? 0),
                    });
                    setDraft((d) => {
                      const n = { ...d };
                      delete n[`${it.id}:act`];
                      return n;
                    });
                  }}
                  placeholder="—"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add booking */}
      {adding ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
          {diretorioFalhou && (
            // Sem esta linha, o formulário de quem não conseguiu ler o
            // diretório é igual ao de quem ainda não tem nenhum fornecedor
            // guardado — e o nome escrito à mão nasce solto do diretório.
            <p className="text-[11px] text-[#a03a1a]">
              Não deu para ler o diretório de fornecedores. Podes escrever o nome à mão, ou
              atualizar a página para o voltar a tentar.
            </p>
          )}
          {directory.length > 0 && (
            <Field
              as="select"
              label="Do diretório de fornecedores"
              value={form.supplierId}
              onChange={(e) => pickDirectory(e.target.value)}
            >
              <option value="">Escolher do diretório…</option>
              {directory.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.category}
                </option>
              ))}
            </Field>
          )}
          {/* `sm:grid-cols-2` media a JANELA: num iPad a 768 px disparava e
              punha o nome do fornecedor e a categoria a par dentro de um
              painel que continuava com 279. O limiar passa a ser o do
              painel, e é o mesmo dos quadrados de número aqui em cima. */}
          <div className="grid grid-cols-1 gap-3 @min-[26rem]:grid-cols-2">
            <Field
              label="Nome do fornecedor"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, supplierId: "" }))}
              placeholder="Ex.: Flores da Vila"
              autoFocus
            />
            <Field
              as="select"
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Field>
          </div>
          <Field
            as="input"
            type="text"
            inputMode="decimal"
            label="Custo orçado (€)"
            value={form.estimatedCost}
            onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="0"
          />
          <div className="flex items-center gap-2 pt-1">
            <Button variant="primary" onClick={add} disabled={!form.name.trim()}>
              Adicionar
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="round" />
            </svg>
          }
          title="Ainda sem fornecedores"
          description="Adiciona fornecedores para acompanhar custos orçados, reais e a margem do evento."
          action={{ label: "Adicionar fornecedor", onClick: () => setAdding(true) }}
        />
      ) : (
        <Button
          variant="secondary"
          fullWidth
          iconLeft={
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          }
          onClick={() => setAdding(true)}
        >
          Adicionar fornecedor ao evento
        </Button>
      )}
    </div>
  );
}
