"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote, ProposalLineItem } from "@/lib/orcamento/types";
import { Card, Field, Button, EmptyState } from "@/app/[lang]/(site)/orcamento/admin/ui";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import { useTravaoDeSaida } from "./useGravacaoAutomatica";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

const LS_KEY = "liquen-last-proposal-items";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RASCUNHO DESTA FERRAMENTA — QUE ATÉ AQUI NÃO EXISTIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As linhas, o IVA, a validade e as notas viviam só em estado do React até
 * alguém carregar em «Gerar PDF e enviar». Não havia rascunho nenhum, em lado
 * nenhum — e este ecrã é DESMONTADO por gestos normais e frequentes: trocar de
 * cliente, abrir o estúdio, mudar de separador de detalhe. Doze linhas
 * escritas à mão, uma a uma, desapareciam sem pergunta e sem aviso.
 *
 * ── Porquê aqui e não num armazém novo ────────────────────────────────────
 *
 * O estúdio já tem rascunho por pedido, no servidor (`app_state`, através de
 * `/api/orcamento/[id]/proposta-rascunho`), já com cópia de segurança e já com
 * a parte difícil feita: saber DIZER quando a gravação não chegou ao servidor.
 * Inventar um segundo armazenamento seria inventar um segundo sítio onde a
 * mesma avaria voltaria a ser silenciosa.
 *
 * O que não podia era partilhar a mesma gaveta: `proposal-draft:<pedido>` é o
 * documento do estúdio, e as duas ferramentas escrevem sobre o MESMO pedido —
 * à «última escrita vence», uma apagaria o trabalho da outra. Daí a
 * `?variante=orcamento-linhas` da rota, que dá a esta ferramenta uma chave só
 * dela dentro do mesmo espaço de nomes (ver o comentário na rota).
 *
 * ── E porque é que a máquina de gravar está aqui repetida ─────────────────
 *
 * Está a ser extraída, noutro sítio, para um hook partilhado
 * (`useGravacaoAutomatica`). Enquanto esse não aterra, isto é a mesma cadeia
 * do estúdio em ponto pequeno — e sobretudo as MESMAS palavras: «a guardar…»,
 * «guardado às HH:MM», «guardado só neste computador». Duas linguagens para a
 * mesma coisa no mesmo back office seria obrigá-la a aprender o dobro.
 */
const RASCUNHO_VARIANTE = "orcamento-linhas";

/** O que se guarda: exactamente os quatro sítios onde ela escreve. */
interface RascunhoDoOrcamento {
  items: ProposalLineItem[];
  vatRate: number;
  validUntil: string;
  notes: string;
}

const chaveLocal = (quoteId: string) => `liquen-proposal-builder-${quoteId}`;
const rotaDoRascunho = (quoteId: string) =>
  `/api/orcamento/${quoteId}/proposta-rascunho?variante=${RASCUNHO_VARIANTE}`;

/** Os três estados que o ecrã sabe dizer. São os do estúdio, à letra. */
type EstadoDaGravacao = "a-guardar" | "guardado" | "so-neste-computador";

/** Uma gravação que morre por uma ligação que caiu não pode morrer à primeira;
 *  um 4xx, ou um 503 marcado como `permanente`, dá a mesma resposta à terceira
 *  vez que à primeira e repeti-lo só atrasa o aviso. É o desenho do estúdio. */
const TENTATIVAS = 3;
const PAUSA_MS = 400;

async function enviarRascunhoParaServidor(
  quoteId: string,
  corpo: { doc: RascunhoDoOrcamento; baseUpdatedAt: string | null },
): Promise<{ guardado: boolean; updatedAt?: string; porque?: string }> {
  let porque: string | undefined;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(rotaDoRascunho(quoteId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await res.json().catch(() => null);
      if (res.ok) {
        return {
          guardado: true,
          updatedAt: typeof dados?.updatedAt === "string" ? dados.updatedAt : undefined,
        };
      }
      porque = typeof dados?.erro === "string" ? dados.erro : undefined;
      if (res.status < 500 || dados?.permanente === true) break;
    } catch {
      /* rede em baixo — é o caso que a repetição existe para apanhar */
    }
    if (tentativa < TENTATIVAS) await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
  }
  return { guardado: false, porque };
}

/** A hora tal como o indicador do estúdio a escreve — «14:32», e nada mais. */
function horaCurta(quando: Date | null): string {
  return quando ? quando.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "";
}

/** Um rascunho vindo do servidor (ou do navegador) tem de ser lido com
 *  desconfiança: pode ser de uma versão anterior desta ferramenta, ou vir
 *  corrompido de um `localStorage` mexido à mão. O que não tiver forma
 *  aproveitável é simplesmente ignorado — nunca faz a página estoirar. */
function lerRascunho(cru: unknown): Partial<RascunhoDoOrcamento> | null {
  if (!cru || typeof cru !== "object") return null;
  const r = cru as Record<string, unknown>;
  const out: Partial<RascunhoDoOrcamento> = {};
  if (Array.isArray(r.items)) {
    const linhas = r.items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
      .map((it) => ({
        description: typeof it.description === "string" ? it.description : "",
        qty: Number(it.qty) || 0,
        unitPrice: Number(it.unitPrice) || 0,
      }));
    // Zero linhas não é um orçamento: o ecrã trabalha sempre com pelo menos
    // uma, e restaurar uma lista vazia dava um formulário sem campos nenhuns.
    if (linhas.length) out.items = linhas;
  }
  if (typeof r.vatRate === "number" && r.vatRate >= 0 && r.vatRate < 1) out.vatRate = r.vatRate;
  if (typeof r.validUntil === "string") out.validUntil = r.validUntil;
  if (typeof r.notes === "string") out.notes = r.notes;
  return Object.keys(out).length ? out : null;
}

function loadLastItems(): ProposalLineItem[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastItems(items: ProposalLineItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function buildFromBreakdown(q: Quote): ProposalLineItem[] {
  const pb = q.priceBreakdown;
  if (!pb)
    return [
      {
        description: "Organização e produção do evento",
        qty: 1,
        unitPrice: Math.round(q.quotedPrice || 0),
      },
    ];
  const items: ProposalLineItem[] = [];
  // Base do serviço já com o multiplicador do pacote aplicado, para que a
  // soma das linhas reproduza o subtotal do breakdown.
  const packaged = Math.round((pb.basePrice + pb.guestCost) * (pb.packageMultiplier || 1));
  if (packaged > 0) {
    items.push({ description: "Produção e coordenação do evento", qty: 1, unitPrice: packaged });
  }
  if (pb.locationSurcharge > 0)
    items.push({
      description: "Suplemento deslocação",
      qty: 1,
      unitPrice: Math.round(pb.locationSurcharge),
    });
  if (pb.weekendSurcharge > 0)
    items.push({
      description: "Suplemento fim de semana",
      qty: 1,
      unitPrice: Math.round(pb.weekendSurcharge),
    });
  if (pb.seasonSurcharge > 0)
    items.push({
      description: "Suplemento época alta",
      qty: 1,
      unitPrice: Math.round(pb.seasonSurcharge),
    });
  if (pb.urgencySurcharge > 0)
    items.push({
      description: "Suplemento urgência",
      qty: 1,
      unitPrice: Math.round(pb.urgencySurcharge),
    });
  if (pb.addonsCost > 0)
    items.push({
      description: "Serviços adicionais",
      qty: 1,
      unitPrice: Math.round(pb.addonsCost),
    });
  if (items.length === 0)
    items.push({
      description: "Organização e produção do evento",
      qty: 1,
      unitPrice: Math.round(q.quotedPrice || pb.subtotal || 0),
    });
  return items;
}

interface Props {
  quote: Quote;
  onSent?: (total: number) => void;
}

export default function ProposalBuilder({ quote, onSent }: Props) {
  const seedPrice = quote.quotedPrice || quote.priceBreakdown?.subtotal || 0;
  /**
   * O orçamento com que o ecrã nasce.
   *
   * Está num sítio só porque agora tem DOIS leitores: os campos e o rascunho,
   * que precisa de saber com o que é que a página abriu para distinguir «ela
   * escreveu» de «isto é o que estava cá». Escrito duas vezes, uma alteração
   * num dos lados fazia a montagem contar como alteração e gravar sozinha um
   * orçamento que ninguém tocou.
   */
  const inicial = useMemo<RascunhoDoOrcamento>(
    () => ({
      items: [
        {
          description: "Organização e produção do evento",
          qty: 1,
          unitPrice: Math.round(seedPrice),
        },
      ],
      vatRate: 0.23,
      validUntil: "",
      notes: "",
    }),
    [seedPrice],
  );
  const [items, setItems] = useState<ProposalLineItem[]>(inicial.items);
  const [vatRate, setVatRate] = useState(inicial.vatRate);
  const [validUntil, setValidUntil] = useState(inicial.validUntil);
  const [notes, setNotes] = useState(inicial.notes);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ total: number; emailed: boolean; pdfUrl: string } | null>(
    null,
  );
  const [hasLastItems, setHasLastItems] = useState(false);

  useEffect(() => {
    setHasLastItems(!!loadLastItems());
  }, []);

  // ── O rascunho: onde está, quando lá ficou, e o que se diz sobre isso ──
  const CHAVE = chaveLocal(quote.id);
  const [gravadoEm, setGravadoEm] = useState<Date | null>(null);
  const [estado, setEstado] = useState<EstadoDaGravacao | null>(null);
  /** O que o servidor recusou dizer, para o aviso poder dizer o que resolver. */
  const [porqueNaoGuardou, setPorqueNaoGuardou] = useState<string | undefined>();
  /** Há trabalho por gravar? Lido por um `ref` porque quem precisa dele é a
   *  limpeza da desmontagem, que corre uma vez só e ficaria presa ao primeiro
   *  desenho se lesse estado. */
  const porGravarRef = useRef(false);
  /** O mesmo, em estado: o registo do back office desenha-se com isto, e um
   *  `ref` não faz ninguém voltar a desenhar. Andam sempre a par — quem mexer
   *  num tem de mexer no outro. */
  const [porGravar, setPorGravar] = useState(false);
  /** A proposta já seguiu para o cliente — a partir daqui não há rascunho para
   *  guardar, há uma proposta enviada. */
  /**
   * Já foi enviada? Vive em DUAS formas de propósito, e não por descuido.
   *
   * O `ref` é lido dentro da gravação, que corre fora do desenho e precisa do
   * valor do instante — um `state` aí estaria uma renderização atrasado e o
   * rascunho voltava a ser gravado depois de a proposta já ter saído.
   *
   * O espelho em estado existe porque a inscrição no registo do back office é
   * calculada NO DESENHO, e ler `ref.current` durante o desenho é uma regra do
   * React partida: o componente não volta a desenhar quando o valor muda, e o
   * botão «Guardar tudo» ficaria a contar um orçamento que já saiu.
   */
  const jaEnviada = useRef(false);
  const [foiEnviada, setFoiEnviada] = useState(false);
  const marcarEnviada = (valor: boolean) => {
    jaEnviada.current = valor;
    setFoiEnviada(valor);
  };
  /** O carimbo do rascunho do servidor que estamos a editar — vai em cada
   *  escrita para a rota poder avisar que alguém gravou pelo meio. */
  const carimboDoServidor = useRef<string | null>(null);
  /**
   * O rascunho tal como ELE FOI POSTO NO ECRÃ pela última reposição (montagem,
   * cópia local, servidor).
   *
   * É o que distingue «ela escreveu» de «nós repusemos»: sem isto, cada
   * reposição contava como alteração e disparava uma gravação de volta — e,
   * pior, marcava o ecrã como sujo, o que travava a leitura do servidor que
   * vinha a caminho.
   */
  const reposto = useRef<string>(JSON.stringify(inicial));

  const aplicarRascunho = useCallback(
    (r: Partial<RascunhoDoOrcamento>, base: RascunhoDoOrcamento) => {
      const completo: RascunhoDoOrcamento = { ...base, ...r };
      reposto.current = JSON.stringify(completo);
      setItems(completo.items);
      setVatRate(completo.vatRate);
      setValidUntil(completo.validUntil);
      setNotes(completo.notes);
    },
    [],
  );

  /**
   * ── ABRIR: primeiro o que este navegador tem, depois o que o servidor tem ──
   *
   * A cópia local abre num instante e funciona sem rede; a do servidor é a que
   * sobrevive a mudar de computador — e é a que vale quando for mais recente.
   * Em empate ganha o servidor, que é a versão que os outros dispositivos veem.
   *
   * E nada do que volta do servidor é posto por cima do que ela já escreveu
   * entretanto: entre esperar pela resposta e escrever a primeira linha vão
   * milissegundos, mas é nesses milissegundos que se apagaria trabalho.
   */
  useEffect(() => {
    let vivo = true;
    const base = (): RascunhoDoOrcamento => JSON.parse(reposto.current);
    let marcaLocal = 0;
    try {
      marcaLocal = Number(localStorage.getItem(`${CHAVE}:at`) ?? 0);
      const cru = localStorage.getItem(CHAVE);
      const local = cru ? lerRascunho(JSON.parse(cru)) : null;
      if (local) aplicarRascunho(local, base());
    } catch {
      /* localStorage indisponível ou rascunho ilegível — vale o do servidor */
    }
    (async () => {
      try {
        const res = await fetch(rotaDoRascunho(quote.id), { cache: "no-store" });
        if (!res.ok || !vivo) return;
        const dados = await res.json().catch(() => null);
        const draft = dados?.draft as { doc?: unknown; updatedAt?: string } | null | undefined;
        if (!draft?.doc) return;
        carimboDoServidor.current = draft.updatedAt ?? null;
        const doServidor = lerRascunho(draft.doc);
        if (!doServidor || !vivo) return;
        const servidorMaisRecente =
          !marcaLocal || (draft.updatedAt ? Date.parse(draft.updatedAt) >= marcaLocal : false);
        // `porGravarRef` é a prova de que ela mexeu desde que abrimos.
        if (servidorMaisRecente && !porGravarRef.current) aplicarRascunho(doServidor, base());
      } catch {
        /* offline — fica a valer a cópia local, que já está no ecrã */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quote.id, CHAVE, aplicarRascunho]);

  /**
   * ── GRAVAR SOZINHO, 800 ms DEPOIS DA ÚLTIMA TECLA ─────────────────────────
   *
   * Primeiro no navegador (é instantâneo e funciona sem rede), depois no
   * servidor (é o que sobrevive a mudar de computador). Falhar no servidor não
   * interrompe nada: continua-se a escrever e a gravação seguinte tenta outra
   * vez. O que não pode é falhar sem se ver — foi assim que uma proposta
   * inteira ficou presa no `localStorage` de um portátil.
   */
  const gravar = useRef<() => Promise<ResultadoDoEcra>>(async () => ({ estado: "guardado" }));
  useEffect(() => {
    const actual: RascunhoDoOrcamento = { items, vatRate, validUntil, notes };
    const serializado = JSON.stringify(actual);
    // Isto é o que nós acabámos de repor no ecrã, não uma alteração dela.
    if (serializado === reposto.current) return;
    porGravarRef.current = true;
    setPorGravar(true);

    const fazer = async (): Promise<ResultadoDoEcra> => {
      // Depois de a proposta seguir, o rascunho foi descartado de propósito.
      // Uma gravação adiada a disparar a seguir ressuscitava-o — e a próxima
      // abertura deste pedido mostrava um orçamento que já foi enviado.
      if (jaEnviada.current) return { estado: "guardado" };
      setEstado("a-guardar");
      try {
        localStorage.setItem(CHAVE, serializado);
        localStorage.setItem(`${CHAVE}:at`, String(Date.now()));
      } catch {
        /* quota / indisponível — o servidor a seguir continua a valer */
      }
      porGravarRef.current = false;
      setPorGravar(false);
      const r = await enviarRascunhoParaServidor(quote.id, {
        doc: actual,
        baseUpdatedAt: carimboDoServidor.current,
      });
      setGravadoEm(new Date());
      if (r.guardado) {
        if (r.updatedAt) carimboDoServidor.current = r.updatedAt;
        setEstado("guardado");
        setPorqueNaoGuardou(undefined);
        return { estado: "guardado" };
      }
      setEstado("so-neste-computador");
      setPorqueNaoGuardou(r.porque);
      // A cópia local já está feita (é a linha de cima, e é síncrona): o
      // trabalho existe, mas só neste portátil. Dizer «não ficou guardado»
      // seria assustar a mais; dizer «guardado» seria a mentira que fez perder
      // uma proposta inteira.
      return { estado: "so-neste-computador", porque: r.porque };
    };
    gravar.current = fazer;
    const t = setTimeout(fazer, 800);
    return () => clearTimeout(t);
  }, [items, vatRate, validUntil, notes, quote.id, CHAVE]);

  /**
   * ── AO DESMONTAR, GRAVA-SE O QUE FALTAVA ──────────────────────────────────
   *
   * A limpeza acima cancela o temporizador em QUALQUER desmontagem, e este ecrã
   * é desmontado por gestos normais: trocar de cliente, abrir o estúdio, mudar
   * de separador. Escrever a última linha e clicar noutro sítio dentro de 800
   * ms era perdê-la. Corre depois da limpeza de cima (as limpezas seguem a
   * ordem de declaração dos efeitos), portanto não há gravação a dobrar.
   */
  useEffect(() => {
    return () => {
      if (porGravarRef.current) void gravar.current();
    };
  }, []);

  /**
   * ── ESTE ORÇAMENTO NO REGISTO DO BACK OFFICE ──────────────────────────────
   *
   * Inscreve-se à mão porque tem máquina de gravar própria (ver acima), e a
   * inscrição não precisa de esperar pela migração para o hook partilhado: são
   * as três coisas que o gesto único precisa de saber — como se chama isto para
   * ela, se há coisa por gravar, e como gravar já.
   *
   * O nome traz o cliente porque é assim que ela distingue este orçamento de
   * outro: ao fechar o separador, «Orçamento de Ana Marques» diz-lhe o que está
   * em risco; «ProposalBuilder» não diz nada a ninguém.
   */
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: `Orçamento de ${quote.name}`,
    porGravar: porGravar || estado === "so-neste-computador",
    gravarJa: () => gravar.current(),
    // Enviada a proposta, o rascunho foi descartado de propósito: não há nada
    // por gravar, e continuar inscrito era pôr o botão a contar um trabalho
    // que já saiu.
    activo: !foiEnviada && !result,
  });

  /** Fechar o separador com trabalho por gravar — a janela é estreita (800 ms),
   *  mas é a mesma janela em que se perdia a última linha escrita.
   *
   *  Havendo registo, quem trava é ele: um travão só para o back office
   *  inteiro, capaz de dizer O QUE é que se perde. Este continua a valer onde
   *  não há registo — um travão que desaparecesse em silêncio seria a pior
   *  troca possível.
   *
   *  ── PORQUE É QUE ISTO LÊ O ESTADO E NÃO O `ref` ─────────────────────────
   *  Estava escrito à mão, e o que o armava eram `oRegistoFalaPorMim` e
   *  `estado`. Mas `estado` só ganha valor QUANDO A PRIMEIRA GRAVAÇÃO COMEÇA,
   *  e `porGravarRef` é um `ref`: mudar não volta a correr efeito nenhum. Ou
   *  seja, durante os primeiros 800 ms de escrita — a única janela que este
   *  travão existe para cobrir — não havia travão nenhum. É para isto que o
   *  `porGravar` anda em estado a par do `ref` (ver a declaração). */
  useTravaoDeSaida(!oRegistoFalaPorMim && (porGravar || estado === "so-neste-computador"));

  const subtotal = items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  function update(i: number, patch: Partial<ProposalLineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addRow() {
    setItems((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }]);
  }
  function removeRow(i: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function applyTemplate(tpl: "single" | "breakdown" | "last") {
    if (tpl === "single") {
      setItems([
        {
          description: "Organização e produção do evento",
          qty: 1,
          unitPrice: Math.round(seedPrice),
        },
      ]);
    } else if (tpl === "breakdown") {
      setItems(buildFromBreakdown(quote));
    } else {
      const last = loadLastItems();
      if (last) setItems(last);
    }
  }

  async function send() {
    if (sending) return;
    if (!window.confirm(`Enviar a proposta de ${eur(total)} por e-mail para ${quote.email}?`))
      return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: items,
          vatRate,
          validUntil: validUntil || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      saveLastItems(items);
      setHasLastItems(true);
      // A proposta seguiu: o rascunho já não é trabalho por acabar, e deixá-lo
      // ficar fazia a próxima abertura deste pedido ressuscitar um orçamento
      // que já foi enviado. Falhar a limpeza não estraga nada (o rascunho fica
      // onde estava) e por isso NUNCA pode fazer falhar o envio.
      marcarEnviada(true);
      porGravarRef.current = false;
      try {
        localStorage.removeItem(CHAVE);
        localStorage.removeItem(`${CHAVE}:at`);
      } catch {
        /* localStorage indisponível — nada a limpar aqui */
      }
      void fetch(rotaDoRascunho(quote.id), { method: "DELETE" }).catch(() => {});
      setEstado(null);
      const pdfUrl = `data:application/pdf;base64,${data.pdfBase64}`;
      setResult({ total: data.total, emailed: data.emailed, pdfUrl });
      onSent?.(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar a proposta.");
    } finally {
      setSending(false);
    }
  }

  if (result) {
    return (
      <Card padding="none">
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title={`Proposta criada — ${eur(result.total)}`}
          description={
            result.emailed
              ? `Enviada por e-mail para ${quote.email}.`
              : "Gerada (e-mail não configurado — descarrega e envia manualmente)."
          }
          action={{
            label: "Descarregar PDF",
            onClick: () => {
              const a = document.createElement("a");
              a.href = result.pdfUrl;
              a.download = `Proposta-Liquen-${quote.id}.pdf`;
              a.click();
            },
          }}
          secondaryAction={{
            label: "Nova proposta",
            onClick: () => {
              // Volta a haver trabalho por guardar: o que ela escrever a partir
              // daqui é uma proposta nova, e não pode ficar de fora do rascunho
              // por causa do envio anterior.
              marcarEnviada(false);
              setResult(null);
            },
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-5">
        <p className="bo-eyebrow mb-1.5">Proposta</p>
        <h3 className="font-display text-lg leading-tight text-foreground/90">
          Criar e enviar proposta (PDF)
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/55">
          Compõe as linhas, define o IVA e envia o PDF ao cliente. O que escreveres fica guardado
          sozinho — podes sair daqui e voltar mais tarde.
        </p>
        {/* O INDICADOR, com as palavras do estúdio.
            Até aqui esta ferramenta não guardava nada e, coerentemente, não
            dizia nada. Agora que guarda, tem de dizer ONDE guardou — e o
            terceiro estado tem de ser lido, não decifrado: são as palavras «só
            neste computador», por extenso, a vermelho, porque é a única forma
            de a informação mudar o que ela faz a seguir (não fechar o
            separador, falar com quem gere a instalação). */}
        {estado && (
          <p
            className={
              estado === "so-neste-computador"
                ? "mt-2 inline-flex rounded-full bg-[#c0392b]/12 px-2 py-0.5 text-[11px] font-semibold text-[#a03123]"
                : "mt-2 text-[11px] text-foreground/35"
            }
            aria-live={estado === "so-neste-computador" ? "assertive" : "polite"}
            title={
              estado === "so-neste-computador" && porqueNaoGuardou ? porqueNaoGuardou : undefined
            }
          >
            {estado === "a-guardar"
              ? "a guardar…"
              : estado === "guardado"
                ? `guardado às ${horaCurta(gravadoEm)}`
                : `⚠ guardado só neste computador${
                    gravadoEm ? ` às ${horaCurta(gravadoEm)}` : ""
                  }${porqueNaoGuardou ? ` — ${porqueNaoGuardou}` : ""}`}
          </p>
        )}
      </div>

      {/* Template shortcuts */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Button variant="ghost" size="sm" onClick={() => applyTemplate("single")}>
          Pacote único
        </Button>
        {quote.priceBreakdown && (
          <Button variant="ghost" size="sm" onClick={() => applyTemplate("breakdown")}>
            Por componentes
          </Button>
        )}
        {hasLastItems && (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => applyTemplate("last")}
            iconLeft={<span aria-hidden="true">↺</span>}
          >
            Última proposta
          </Button>
        )}
      </div>

      {/* Line items */}
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/55">
          <span className="flex-1">Descrição</span>
          <span className="w-16 text-center">Qt.</span>
          <span className="w-24 text-right">Unit. €</span>
          <span className="w-10" />
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Field
              hideLabel
              label={`Descrição da linha ${i + 1}`}
              containerClassName="flex-1 min-w-0"
              value={it.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Ex.: Decoração floral"
            />
            <Field
              hideLabel
              label={`Quantidade da linha ${i + 1}`}
              containerClassName="w-16"
              type="number"
              min={1}
              value={it.qty}
              onChange={(e) => update(i, { qty: Number(e.target.value) })}
              className="text-center"
            />
            <Field
              hideLabel
              label={`Preço unitário da linha ${i + 1}`}
              containerClassName="w-24"
              type="number"
              min={0}
              value={it.unitPrice}
              onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
              className="text-right"
            />
            <Button
              variant="ghost"
              onClick={() => removeRow(i)}
              disabled={items.length === 1}
              aria-label="Remover linha"
              className="h-10 w-10 shrink-0 px-0 text-lg"
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={addRow}
        iconLeft={<span aria-hidden="true">+</span>}
        className="mt-2 mb-5 text-[#4d6350] hover:text-[#415440]"
      >
        Adicionar linha
      </Button>

      {/* Totals */}
      <div className="rounded-xl bg-foreground/[0.035] p-4 flex flex-col gap-2 mb-5">
        <div className="flex justify-between text-sm">
          <span className="text-foreground/55">Subtotal</span>
          <span className="text-foreground/75">{eur(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span className="text-foreground/55 flex items-center gap-2">
            IVA
            <select
              aria-label="Taxa de IVA"
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className="rounded-lg border border-foreground/20 bg-white px-2 py-1 text-xs text-foreground/70 shadow-[0_1px_2px_rgba(42,38,32,0.04)] focus:outline-none focus:border-foreground/40"
            >
              <option value={0.23}>23%</option>
              <option value={0.13}>13%</option>
              <option value={0.06}>6%</option>
              <option value={0}>0%</option>
            </select>
          </span>
          <span className="text-foreground/75">{eur(vat)}</span>
        </div>
        <div className="flex justify-between text-base font-medium pt-2 border-t border-foreground/10">
          <span className="text-foreground/75">Total</span>
          <span className="text-[#4d6350] font-semibold">{eur(total)}</span>
        </div>
      </div>

      {/* Validity + notes */}
      <div className="flex flex-col gap-4 mb-5">
        <Field
          label="Válida até"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
        <Field
          as="textarea"
          label="Notas (no PDF)"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Condições, observações, o que está incluído…"
          className="resize-none"
        />
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mb-4 flex items-start gap-1.5 text-sm leading-relaxed text-[#8a2a22]"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={send}
        loading={sending}
        disabled={subtotal <= 0}
        iconRight={<span aria-hidden="true">→</span>}
      >
        {sending ? "A gerar e enviar…" : "Gerar PDF e enviar ao cliente"}
      </Button>
    </Card>
  );
}
