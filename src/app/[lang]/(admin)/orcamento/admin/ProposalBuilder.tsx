"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { quandoGravado } from "@/lib/quando-gravado";
import { porqueFalhouOEnvio } from "./porque-falhou-o-envio";
import { parseMoney } from "./util";
import type { Quote, ProposalLineItem } from "@/lib/orcamento/types";
import { Card, Field, Button, EmptyState, EmCurso } from "@/app/[lang]/(admin)/orcamento/admin/ui";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import { useTravaoDeSaida } from "./useGravacaoAutomatica";
import { tempoEstimado } from "@/lib/custo-do-pdf";
import { eur, round2 } from "@/lib/money";

/* O `eur` e o `round2` da casa. Havia aqui uma quinta cópia local do
   `Intl.NumberFormat`, que é o género de coisa que diverge sem ninguém dar
   por isso — e este ficheiro é justamente onde o dinheiro divergiu. */

const LS_KEY = "liquen-last-proposal-items";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA O «GERAR PDF E ENVIAR» — O PALPITE MAIS HONESTO DAQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O gémeo deste botão é o envio do Estúdio (`AEnviarAProposta`), que sabe
 * quantas fotografias o documento leva e afina a estimativa com as gerações
 * anteriores. Este construtor não tem NENHUM desses dois dados:
 *
 *  · fotografias não tem nenhumas — o PDF que esta rota manda desenhar é o de
 *    linhas (`proposal-pdf.ts`), texto e tabela, sem uma única imagem. Por isso
 *    `tempoEstimado(0)` e não um número inventado: é o custo fixo do modelo,
 *    que é exactamente a parte do desenho que este documento paga;
 *  · amostras não tem nenhumas — as gerações medidas vivem numa chave de
 *    `localStorage` privada do Estúdio, que este ficheiro não pode ler sem
 *    duplicar a chave à mão. Fica-se pelo modelo de arranque.
 *
 * O que aqui manda não é o desenho, é o que a rota faz DEPOIS: falar com o SMTP
 * com o PDF em anexo e a assinatura junto, pedir o link curto ao armazenamento
 * e gravar a proposta. É a mesma ordem de grandeza do envio de um modelo de
 * email (3–10 s) e é esse o palpite — 7 s.
 *
 * Errar por baixo não estraga nada: a barra nunca chega ao fim sozinha (só a
 * resposta a fecha) e ao dobro do estimado a `notaDemorada` toma conta do
 * recado. Errar por cima é que era mau — uma barra parada no princípio.
 */
const MS_DO_CORREIO = 7_000;
const MS_DO_ENVIO = tempoEstimado(0) + MS_DO_CORREIO;

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

/** Os três atalhos que substituem a tabela inteira. */
type Modelo = "single" | "breakdown" | "last";

/** Como se lhes chama numa frase — as palavras dos próprios botões. */
const NOME_DO_MODELO: Record<Modelo, string> = {
  single: "Pacote único",
  breakdown: "Por componentes",
  last: "Última proposta",
};

/** Quantos segundos o «Anular» fica de pé — os mesmos do Estúdio. */
const SEGUNDOS_PARA_ANULAR = 10;

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
  // Ver `quando-gravado`: hoje é só a hora, ontem e mais atrás levam o dia.
  return quandoGravado(quando);
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
  /** A tabela tal como estava antes do último «×», à espera do «Anular». */
  const [linhaRemovida, setLinhaRemovida] = useState<{
    items: ProposalLineItem[];
    frase: string;
    segundos: number;
  } | null>(null);
  /** O atalho de modelo que está à espera de resposta. */
  const [modeloAConfirmar, setModeloAConfirmar] = useState<{
    novos: ProposalLineItem[];
    pergunta: string;
  } | null>(null);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O PREÇO ZERAVA QUANDO ELA ESCREVIA A VÍRGULA
   * ════════════════════════════════════════════════════════════════════════
   *
   * O campo era `type="number"` com `Number(e.target.value)`. Num
   * `input type="number"` a norma manda o browser apagar o valor sempre que o
   * conteúdo não é um número de vírgula flutuante VÁLIDO — e válido, em HTML,
   * quer dizer com PONTO. A tecla decimal do teclado português é a vírgula.
   * Ela escrevia `150,50`, o `.value` vinha vazio, `Number("")` é `0`, e o
   * preço ficava a zero num orçamento que seguia para o cliente.
   *
   * O resto do back office já fazia o contrário em mais de vinte sítios:
   * `type="text"` + `inputMode="decimal"` + `parseMoney` (que entende
   * «1.500», «1500,50» e «1 500€»). Este campo de dinheiro ficou de fora.
   *
   * Guarda-se o TEXTO enquanto ela escreve — só de uma linha, que é quanto um
   * teclado alcança de cada vez — porque «150,» tem de continuar a ler-se
   * «150,» e não voltar a «150» a meio da palavra. O modelo recebe o número
   * assim que ele é legível; o que não for legível não apaga o que lá estava.
   */
  const [precoEmEdicao, setPrecoEmEdicao] = useState<{ i: number; texto: string } | null>(null);
  /** O número do modelo como se escreve cá: `150,5`, não `150.5`. */
  const precoEscrito = (n: number) => String(n ?? 0).replace(".", ",");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total: number;
    emailed: boolean;
    pdfUrl: string;
    /** A frase do SERVIDOR sobre porque é que o email não saiu. */
    emailError?: string;
  } | null>(null);
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

  // A contagem decrescente do «Anular» de uma linha removida. Um `setTimeout`
  // por segundo, como no Estúdio.
  useEffect(() => {
    if (!linhaRemovida) return;
    if (linhaRemovida.segundos <= 0) {
      setLinhaRemovida(null);
      return;
    }
    const t = setTimeout(
      () => setLinhaRemovida((l) => (l ? { ...l, segundos: l.segundos - 1 } : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [linhaRemovida]);

  /* Os mesmos três `round2` da rota, e pela mesma razão: o ecrã tem de dizer o
     que a folha vai dizer. Sem eles, este painel mostrava «Subtotal 36,50 € ·
     IVA 8,40 € · TOTAL 44,89 €» — e a proposta que saía dizia o mesmo, errado
     da mesma maneira. Ver o comentário longo em
     `api/orcamento/[id]/proposta/route.ts`. */
  const subtotal = round2(
    items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0),
  );
  const vat = round2(subtotal * vatRate);
  const total = round2(subtotal + vat);

  function update(i: number, patch: Partial<ProposalLineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addRow() {
    setItems((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }]);
  }

  /** O que a linha vale — a mesma multiplicação do subtotal, para o aviso não
   *  dizer um número diferente do que a tabela acabou de tirar. */
  const valorDaLinha = (it: ProposalLineItem) =>
    round2((Number(it.qty) || 0) * (Number(it.unitPrice) || 0));

  /** Tem alguma coisa dentro? Uma linha em branco não é trabalho a perder. */
  const linhaEscrita = (it: ProposalLineItem) =>
    (it.description ?? "").trim() !== "" || valorDaLinha(it) > 0;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REMOVER UMA LINHA: ANULAR, E NÃO PERGUNTA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Compor um orçamento nesta tabela É acrescentar e tirar linhas: escreve-se
   * doze, o cliente corta três, muda-se de ideias em duas. O gesto é o mais
   * frequente do ecrã e refazê-lo custa uma descrição e dois números.
   *
   * Uma caixa a perguntar em cada «×» é uma caixa respondida vinte vezes numa
   * tarde — e uma caixa respondida vinte vezes deixa de ser lida à terceira.
   * Pior: passa a ser respondida por reflexo, e a vez em que a resposta
   * interessava é a vez em que ninguém a leu.
   *
   * Por isso faz-se, e fica um «Anular» ao lado durante dez segundos, a dizer
   * QUAL linha saiu e QUANTO tirou ao total. É o mesmo desenho do Estúdio (ver
   * o `limpo`, em `ProposalStudio.tsx`): a pergunta chega antes de se ver o
   * estrago, a anulação chega quando ele já está no ecrã.
   *
   * A linha em branco sai sem aviso nenhum: não há nada para trazer de volta, e
   * uma barra a oferecer o resgate de nada é ruído a cada linha mal começada.
   */
  function removeRow(i: number) {
    if (items.length === 1) return;
    const linha = items[i];
    if (linha && linhaEscrita(linha)) {
      const nome = (linha.description ?? "").trim() || `linha ${i + 1}`;
      const valor = valorDaLinha(linha);
      setLinhaRemovida({
        items,
        frase: `Linha «${nome}» removida${valor > 0 ? ` — menos ${eur(valor)} no total` : ""}.`,
        segundos: SEGUNDOS_PARA_ANULAR,
      });
    }
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  /** As linhas que o atalho iria escrever, ou `null` quando não há nenhumas. */
  function itensDoModelo(tpl: Modelo): ProposalLineItem[] | null {
    if (tpl === "single") {
      return [
        {
          description: "Organização e produção do evento",
          qty: 1,
          unitPrice: Math.round(seedPrice),
        },
      ];
    }
    if (tpl === "breakdown") {
      const linhas = buildFromBreakdown(quote);
      return linhas.length ? linhas : null;
    }
    const last = loadLastItems();
    return last && last.length ? last : null;
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS ATALHOS DE MODELO: PERGUNTA, E NÃO ANULAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Estes três botões não acrescentam nada — SUBSTITUEM a tabela inteira. Doze
   * linhas escritas à mão, uma a uma, desapareciam com uma carregada num botão
   * cinzento de dois centímetros que fica mesmo por cima delas, e o mais
   * perigoso dos três («Última proposta») tem um ícone de recuperação, que se
   * lê como se fosse trazer alguma coisa de volta em vez de levar tudo.
   *
   * É o oposto do «×» de uma linha: raro (faz-se uma vez, no princípio) e caro
   * (perde-se a tabela toda). Por isso leva PERGUNTA e não anulação — e a
   * pergunta diz quantas linhas se perdem e quanto somam, que é o que decide a
   * resposta. Um «Tens a certeza?» aqui não dizia nada de nada.
   *
   * Mas só quando há mesmo o que perder: com a tabela em branco — que é como
   * ela está quando estes botões servem para o que foram feitos — o modelo
   * entra sem pergunta nenhuma. Uma tarefa que não é destrutiva não pode ser
   * atrasada por uma caixa.
   */
  function applyTemplate(tpl: Modelo) {
    const novos = itensDoModelo(tpl);
    // Nada para escrever (uma «última proposta» que não existe) não é uma
    // acção destrutiva nenhuma: não se pergunta e não se mexe na tabela.
    if (!novos) return;
    const escritas = items.filter(linhaEscrita);
    if (escritas.length === 0) {
      setItems(novos);
      return;
    }
    const soma = round2(escritas.reduce((s, it) => s + valorDaLinha(it), 0));
    setModeloAConfirmar({
      novos,
      pergunta:
        `Substituir ${escritas.length === 1 ? "a linha já escrita" : `as ${escritas.length} linhas já escritas`}` +
        `${soma > 0 ? ` (${eur(soma)})` : ""} por «${NOME_DO_MODELO[tpl]}»? O que está na tabela não volta atrás.`,
    });
  }

  async function send() {
    if (sending) return;
    /* ── A PERGUNTA DIZ O QUE VAI, E NÃO SÓ QUANTO ─────────────────────────
       O envio é a acção irreversível deste ecrã — o PDF é desenhado, o email
       sai e o cliente lê-o — e a pergunta trazia o total e a morada. Faltava a
       parte que se pode ter enganado sem dar por isso: QUANTAS linhas seguem.
       Uma linha apagada por engano há dois minutos não muda o total o
       suficiente para dar nas vistas, e é a última vez que alguém a pode
       contar. É a mesma frase do Estúdio, em ponto pequeno.

       O `total` é o mesmo que a tabela mostra e que a rota vai imprimir (ver
       os `round2` acima): uma segunda conta aqui era garantir que um dia a
       pergunta e o documento diziam números diferentes. */
    const escritas = items.filter(linhaEscrita).length;
    if (
      !window.confirm(
        `Enviar a proposta para ${quote.email || "o cliente"}?\n\n` +
          `Vai um PDF com ${escritas} ${escritas === 1 ? "linha" : "linhas"}, ` +
          `${eur(total)} com IVA incluído.`,
      )
    )
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
      /**
       * ══════════════════════════════════════════════════════════════════════
       * LER O CORPO SEM PARTIR, E DIZER O QUE O ESTADO SIGNIFICA
       * ══════════════════════════════════════════════════════════════════════
       *
       * O `res.json()` corria ANTES de se olhar ao `res.ok`. Um 504 devolve uma
       * PÁGINA HTML, o interpretador atirava, e o que ficava no ecrã era a
       * mensagem crua da excepção:
       *
       *   ⚠ Unexpected token '<', "<!DOCTYPE "... is not valid JSON
       *
       * Uma frase em inglês, de programador, que não diz o que aconteceu nem o
       * que fazer — e que esconde o que interessa: um 504 acontece DEPOIS de a
       * rota ter falado com o SMTP, portanto o email pode ter saído. Ela vê um
       * erro, carrega outra vez, e o casal recebe duas propostas.
       *
       * O `porqueFalhouOEnvio` já existia e já dizia a frase certa para cada
       * estado — só o Estúdio é que o usava. É a mesma rota e a mesma avaria.
       */
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || porqueFalhouOEnvio(res.status));
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
      setResult({
        total: data.total,
        emailed: data.emailed,
        pdfUrl,
        ...(typeof data.emailError === "string" ? { emailError: data.emailError } : {}),
      });
      /**
       * ══════════════════════════════════════════════════════════════════════
       * «PROPOSTA ENVIADA» SÓ QUANDO FOI MESMO ENVIADA
       * ══════════════════════════════════════════════════════════════════════
       *
       * O `onSent` escreve no histórico PERMANENTE do pedido «Proposta enviada
       * — 3.690,00 €», e era chamado mesmo com `emailed:false`. Daqui a três
       * semanas, a pergunta «mandámos ou não mandámos?» tem uma resposta
       * escrita — e era a errada.
       *
       * É a mesma regra que o Estúdio já segue, com a nota a explicá-la: o
       * email não ter saído é um ERRO, não uma informação. A proposta fica
       * gravada na mesma; o que não fica é a afirmação de que seguiu.
       */
      if (data.emailed) onSent?.(data.total);
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
          /**
           * A frase do SERVIDOR, quando ele a manda. Ele distingue três
           * avarias com três resoluções diferentes — «acrescenta o email e
           * reenvia», «reenvia daqui a pouco», «o SMTP não está configurado» —
           * e o ecrã deitava-as fora e mostrava sempre a terceira, que é a
           * única que manda enviar À MÃO. Nas outras duas, ela enviava à mão um
           * email que devia ter seguido sozinho.
           */
          description={
            result.emailed
              ? `Enviada por e-mail para ${quote.email}.`
              : result.emailError ||
                "A proposta foi gerada mas o E-MAIL NÃO SAIU — o cliente não recebeu nada. " +
                  "Descarrega o PDF e envia-o à mão."
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
                ? "mt-2 inline-flex rounded-full bg-[#8a2a22]/12 px-2 py-0.5 text-[11px] font-semibold text-[#8a2a22]"
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

      {/* ── A PERGUNTA DO ATALHO, POR BAIXO DO BOTÃO QUE A LEVANTOU ─────────
          Encostada aos três botões e por cima da tabela que vai desaparecer:
          quem lê a frase tem o que ela conta mesmo ali à vista.

          `alertdialog` + `assertive` porque está à espera de resposta — um
          botão que não anuncia nada carrega-se outra vez. */}
      {modeloAConfirmar && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label="Confirmar substituição das linhas"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/45 bg-[#c98a2e]/[0.08] px-3 py-2.5"
        >
          <span className="min-w-[12rem] flex-1 text-xs leading-relaxed text-foreground/80">
            {modeloAConfirmar.pergunta}
          </span>
          {/* Cancelar não escreve NADA: fecha a pergunta e a tabela fica onde
              estava, linha por linha. */}
          <Button variant="ghost" size="sm" onClick={() => setModeloAConfirmar(null)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setItems(modeloAConfirmar.novos);
              setModeloAConfirmar(null);
            }}
          >
            Substituir
          </Button>
        </div>
      )}

      {/* ── O «ANULAR» DA LINHA REMOVIDA ───────────────────────────────────
          Por cima da tabela e não no lugar da linha: a linha saiu, e as de
          baixo subiram — uma oferta pendurada num sítio que já mudou de forma
          é uma oferta que salta enquanto se procura.

          SEM `aria-live`, como a barra irmã do Estúdio (ver `limpo`, em
          `ProposalStudio.tsx`): a contagem muda de segundo a segundo, e uma
          região viva com um número lá dentro põe o leitor de ecrã a repetir a
          mesma frase dez vezes seguidas. Isso não é anunciar — é tapar o que
          quer que ela estivesse a ouvir a seguir. */}
      {linhaRemovida && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#c98a2e]/35 bg-[#c98a2e]/[0.06] px-3 py-2">
          <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/70">
            {linhaRemovida.frase} Pode anular durante {linhaRemovida.segundos}s.
          </span>
          <button
            type="button"
            className="alvo-toque shrink-0 text-xs font-medium text-[#4d6350] underline-offset-2 hover:underline"
            onClick={() => {
              setItems(linhaRemovida.items);
              setLinhaRemovida(null);
            }}
          >
            Anular
          </button>
        </div>
      )}

      {/*
        Line items

        ── PORQUE É QUE A LINHA SE PARTE EM DUAS NO TELEMÓVEL ────────────────
        As três colunas fixas (Qt. 64 px, Unit. € 96 px, remover 40 px) mais os
        intervalos comem 224 px da linha, aconteça o que acontecer. Medido no
        iPhone SE (375 px), com este painel a 292 px: sobravam 68 px para a
        DESCRIÇÃO — o campo onde se escreve "Decoração floral de cerimónia".
        Com 68 px vêem-se quatro letras de cada vez, e a coluna que manda na
        proposta era a mais pequena das quatro.

        Abaixo de 24 rem a descrição passa a ocupar a linha inteira e os
        números vão para a linha de baixo. O limiar é uma *container query*
        (a largura DESTE painel, não a da janela) porque ele vive na gaveta do
        pedido, que muda de largura com o ecrã: medido, o painel tem 292 px a
        375, 469 px a 768, 661 px a 1024 e 444 px a 1280 — todos acima das 24
        rem, portanto no computador nada se mexe.

        O cabeçalho desaparece com a linha única, como o `@max-[36rem]:hidden`
        do `PaymentsPanel` já fazia: uma fila de títulos por cima de campos que
        já não estão debaixo dela mente mais do que a ausência dela. Os campos
        continuam a ter nome para quem ouve — os rótulos são `sr-only`, não
        inexistentes.
      */}
      <div className="@container flex flex-col gap-2 mb-2">
        <div className="hidden @min-[24rem]:flex gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/55">
          <span className="flex-1">Descrição</span>
          <span className="w-16 text-center">Qt.</span>
          <span className="w-24 text-right">Unit. €</span>
          <span className="w-10" />
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap @min-[24rem]:flex-nowrap gap-2 items-center">
            <Field
              hideLabel
              label={`Descrição da linha ${i + 1}`}
              containerClassName="w-full min-w-0 @min-[24rem]:w-auto @min-[24rem]:flex-1"
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
              type="text"
              inputMode="decimal"
              value={precoEmEdicao?.i === i ? precoEmEdicao.texto : precoEscrito(it.unitPrice)}
              onChange={(e) => {
                const texto = e.target.value;
                setPrecoEmEdicao({ i, texto });
                const n = parseMoney(texto);
                // Um texto ainda por acabar («150,») não apaga o que lá está.
                if (n !== undefined) update(i, { unitPrice: n });
              }}
              onBlur={() => setPrecoEmEdicao(null)}
              className="text-right"
            />
            <Button
              variant="ghost"
              onClick={() => removeRow(i)}
              disabled={items.length === 1}
              aria-label="Remover linha"
              // A altura já vinha do `ui/Button.tsx` (`pointer-coarse:h-11`); a
              // largura ficava presa em `w-10`. Medido no telemóvel: 40 × 44 —
              // quatro píxeis a menos do que o mínimo, num botão que apaga uma
              // linha de orçamento.
              className="h-10 w-10 pointer-coarse:w-11 shrink-0 px-0 text-lg"
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
              className="rounded-lg border border-foreground/20 bg-white px-2 py-1 text-xs text-foreground/70 focus:outline-none focus:border-foreground/40"
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

      {/* ── ENQUANTO ESTÁ A IR ───────────────────────────────────────────────
          Isto é a operação irreversível deste ecrã, e é a gémea do envio do
          Estúdio: a mesma rota, o mesmo trabalho, e dezenas de segundos numa
          quinta com 4G fraco. O que havia era o botão a rodar — que diz «estou
          ocupado» e não diz mais nada: nem o que está a acontecer, nem para
          quem vai, nem que o separador não se fecha.

          O cartão substitui o botão em vez de ficar por cima dele: o botão
          desaparecido é a garantia de que não há segundo envio a caminho, e
          duas propostas no email do casal é a avaria que não se desfaz. */}
      {sending ? (
        <EmCurso
          titulo="A gerar o PDF e a enviar ao cliente…"
          estimadoMs={MS_DO_ENVIO}
          nota={
            /* Nunca «Enviada»: quem dá o envio por feito é a resposta, e
               enquanto isto está no ecrã a resposta não chegou. */
            quote.email
              ? `A proposta vai para ${quote.email}. Não feches nem recarregues esta página.`
              : "Não feches nem recarregues esta página."
          }
          notaDemorada="Com rede fraca demora — não feches o separador. O email pode estar mesmo a sair."
        />
      ) : (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={send}
          disabled={subtotal <= 0}
          iconRight={<span aria-hidden="true">→</span>}
        >
          Gerar PDF e enviar ao cliente
        </Button>
      )}
    </Card>
  );
}
