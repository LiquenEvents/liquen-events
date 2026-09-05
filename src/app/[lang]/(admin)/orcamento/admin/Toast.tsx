"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { idUnico } from "@/lib/id-unico";
/* A escala de movimento da casa — ver `ui/movimento.ts`. Aqui só o botão de
   fechar é um estado de interacção; a ENTRADA da caixa tem escala própria,
   logo abaixo, porque não é um estado a mudar — é o sistema a apresentar. */
import { ESTADO, PRESSAO } from "./ui/movimento";
/* E a SAÍDA é vocabulário da casa, não deste ficheiro: a classe `.bo-saida`
   vive no `globals.css` ao lado da `.bo-entrada`, e o hook que segura o nó
   montado enquanto ela corre vive no `ui/saida.ts`. As duas nasceram aqui e
   estão lá fora de propósito — o mesmo buraco existe em todas as folhas e
   diálogos do back office. */
import { SAIDA_FOLHA, SAIDA_MS, useSaidaAdiada } from "./ui/saida";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_DURATION = 4000;

/**
 * ── QUANTOS AVISOS CABEM NO ECRÃ AO MESMO TEMPO ─────────────────────────────
 *
 * A pilha cresce para cima a partir do canto de baixo à direita e não tinha
 * tecto nenhum. Uma gravação em lote que falha em doze linhas dá doze caixas de
 * ~64 px — 768 px, mais alto do que o ecrã de um telemóvel. Nessa altura o
 * aviso deixou de avisar: tapou a página inteira, incluindo o trabalho a que se
 * refere, e as primeiras caixas nem sequer se vêem porque saem por cima.
 *
 * Quatro é o que cabe folgadamente em 375 px de altura útil. Quando chega mais
 * um, sai o MAIS VELHO: o recente é o que ainda diz respeito ao que se acabou
 * de carregar, e o velho já teve os seus segundos.
 */
const MAX_TOASTS = 4;

/**
 * ── A ENTRADA DE UM AVISO: 240 ms, E A CURVA DE QUEM APRESENTA ──────────────
 *
 * Estava `transition-all duration-300`, sem `motion-safe:`. Três desvios num
 * sítio só, e nenhum deles escolhido:
 *
 *  1. **300 ms.** A casa fixou 240 para tudo o que APARECE por cima da página
 *     — é o número da `.bo-entrada` e da `.view-in` do `globals.css`, e é o que
 *     os outros nove sítios do back office que se apresentam já usam. Trezentos
 *     não era um degrau: era um número solto a discordar dos vizinhos em
 *     silêncio, num aviso que nasce ao lado deles.
 *
 *  2. **A curva.** Sem `ease-*`, uma `transition-*` desta casa sai com o
 *     `--default-transition-timing-function`, que é a curva de ASSINATURA
 *     (`cubic-bezier(0.16, 1, 0.3, 1)`). Essa é para o que o utilizador
 *     provoca. Um aviso não é provocado — chega quando o sistema tem alguma
 *     coisa a dizer —, e o que o sistema apresenta entra na curva que SÓ
 *     DESACELERA, `cubic-bezier(0, 0, 0.2, 1)`. É a mesma da `.bo-entrada`, e
 *     o `duracoes-da-casa.test.ts` prende este literal ao do `globals.css`
 *     para as duas pontas não poderem afinar-se sozinhas.
 *
 *  3. **`transition-all`, e sem `motion-safe:`.** O `all` obriga o browser a
 *     considerar `width`, `height` e `margin` em cada fotograma — layout, no
 *     elemento que aparece precisamente quando alguma coisa já correu mal. A
 *     lista aqui é fechada: `opacity` e `translate` (no Tailwind v4 o
 *     `translate-y-2` emite a propriedade AUTÓNOMA `translate`, não
 *     `transform` — compilado para confirmar), as duas compostas na GPU. E o
 *     `motion-safe:` porque o `globals.css` não tem rede global nenhuma: só
 *     desliga transições dentro de `prefers-reduced-motion` em três sítios
 *     concretos, e este não é nenhum deles.
 *
 * ── PORQUE É QUE NÃO É A CLASSE `.bo-entrada` ───────────────────────────────
 *
 * Seria o caminho mais curto — traz o número, a curva e a guarda de movimento
 * reduzido de graça. Mas a `.bo-entrada` é uma ANIMAÇÃO à montagem, e o
 * `entrada-do-que-aparece.test.ts` (que não é meu) prende, letra por letra, o
 * gesto que este aviso faz hoje: `"opacity-0 translate-y-2"`. Trocá-lo por
 * `.bo-entrada` punha esse teste vermelho num ficheiro que não me cabe
 * corrigir. Fica igual em tudo o que se vê — os mesmos 8 px, os mesmos 240 ms,
 * a mesma curva —, e a mudança da mecânica fica para quem for dono do teste.
 */
const ENTRADA_DO_AVISO =
  "motion-safe:transition-[opacity,translate] " +
  "motion-safe:duration-[240ms] " +
  "motion-safe:ease-[cubic-bezier(0,0,0.2,1)]";

/** A curva de quem apresenta, escrita como o CSS a quer (ver o ponto 2 acima). */
const CURVA_QUE_APRESENTA = "cubic-bezier(0, 0, 0.2, 1)";

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A SAÍDA DE UM AVISO — porque é que ela não podia ser feita da maneira óbvia
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui o aviso ENTRAVA com animação e SAÍA num fotograma: desaparecia do
 * array e os que ficavam mudavam de sítio de repente. Estava escrito como
 * dívida, com duas razões concretas, e são estas duas que este ficheiro
 * responde. O QUE é a saída — 200 ms, `--ease-in`, 8 px, e o `pointer-events`
 * largado dentro da própria classe — está na `.bo-saida` do `globals.css`;
 * COMO se segura um nó montado enquanto ela corre está no `ui/saida.ts`. Aqui
 * fica só o que é desta pilha e de mais nenhum sítio.
 *
 * ── 1. O ESPAÇO TEM DE ENCOLHER, E ENCOLHER NÃO PODE SER LAYOUT ─────────────
 *
 * Desvanecer o aviso em `opacity` não corrige o salto — adia-o 200 ms. Para os
 * que ficam DESLIZAREM em vez de saltarem, o espaço do que sai tem de fechar-se
 * ao longo dos mesmos 200 ms. As três maneiras de o fazer foram MEDIDAS, num
 * Chromium, com o `Performance.getMetrics` do próprio browser (contador
 * `LayoutCount`), sobre uma página com 1500 linhas em fluxo e a pilha de quatro
 * avisos por cima — o instrumento está em `e2e/saida-do-aviso.mjs` e volta a
 * correr com `node e2e/saida-do-aviso.mjs`:
 *
 *     A · transicionar `height`               ~19 layouts   ~1,4 ms de layout
 *     B · `grid-template-rows: 1fr → 0fr`     ~19 layouts   ~1,4 ms de layout
 *     C · só `transform` nos irmãos            ~4 layouts   ~0,3 ms de layout
 *
 * A conclusão desmente a suposição com que este trabalho começou: o truque do
 * `grid-template-rows` NÃO é mais barato do que a altura. É o MESMO custo —
 * dezanove recálculos de layout, um por fotograma da transição, contra os
 * quatro de C (que são as medições feitas à mão, uma vez, e não por fotograma).
 * O browser interpola o tamanho da faixa e volta a dispor a grelha e tudo o que
 * ela contém, exactamente como faria com a altura. A diferença que se lhe
 * costuma atribuir é outra coisa: o custo fica CONFINADO porque a pilha é
 * `position: fixed` e portanto fora de fluxo — e esse confinamento vale
 * igualmente para a altura, ou seja não é argumento para escolher entre as
 * duas.
 *
 * Fica portanto C, que é a única que cumpre a regra da casa à letra: **só
 * `transform` e `opacity`**. Funciona assim, e é um FLIP clássico:
 *
 *   · o aviso que sai passa a `position: absolute` no sítio exacto onde já
 *     estava — sai do FLUXO num fotograma, sem se mexer um pixel à vista;
 *   · nesse mesmo fotograma, antes de o browser pintar, mede-se de quanto é que
 *     cada um dos que ficam se deslocou, e dá-se-lhes um `transform` que os
 *     põe de volta onde estavam (o passo «inverter»);
 *   · no fotograma seguinte tira-se-lhes o `transform` com transição de 200 ms:
 *     deslizam para o lugar novo em vez de saltarem.
 *
 * São DUAS medições por saída — uma antes e uma depois de tirar do fluxo —, não
 * uma por fotograma. É essa a diferença que interessa.
 *
 * Porque é que se mede em vez de calcular «altura da caixa + gap»: a pilha são
 * duas regiões (`role="alert"` e `role="status"`) com `gap` entre elas e dentro
 * delas, e o aviso que sai pode ser o último da sua região — casos em que a
 * conta dá o número errado. Medir dá o certo em todos, e é código a menos.
 *
 * E a curva do deslize é a de quem APRESENTA (`cubic-bezier(0, 0, 0.2, 1)`) e
 * não a `--ease-in` da caixa que sai: quem desliza não se vai embora — chega ao
 * lugar novo e assenta lá.
 *
 * ── 2. OS `POINTER-EVENTS` LARGAM-SE NO PRIMEIRO FOTOGRAMA ──────────────────
 *
 * Esta pilha pousa em cima da barra de acção do estúdio de propostas (ver o
 * comentário do `bottom-[calc(…)]` mais abaixo). Um aviso a desvanecer-se por
 * cima do botão «Gerar e enviar» continua a ser o alvo do toque enquanto lá
 * estiver: o utilizador carrega, e não acontece nada — durante 200 ms, e sem
 * nenhum sinal de porquê. É a razão pela qual sair de repente era, até aqui,
 * mais seguro do que sair bonito.
 *
 * Por isso o `pointer-events-none` não é aplicado quando a animação acaba, nem
 * num `setTimeout`, nem num `requestAnimationFrame`: entra no MESMO commit do
 * React que marca o aviso como «a sair», ou seja antes de o browser pintar o
 * primeiro fotograma da saída. E vem duas vezes, de propósito — pela classe
 * `.bo-saida` (que o traz para toda a casa) e pelo utilitário do Tailwind aqui
 * no sítio, que é o que fica de pé se alguém um dia trocar a classe. O
 * `Toast.saida.test.tsx` tem um teste só para isto.
 */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pilhaRef = useRef<HTMLDivElement | null>(null);
  /** O nó de cada aviso montado, para o FLIP os poder medir e deslocar. */
  const nos = useRef(new Map<string, HTMLDivElement>());
  /** Saídas cujo deslize já foi montado — o efeito de layout é reentrante. */
  const jaDeslizados = useRef(new Set<string>());

  /** Tira o aviso do array de vez. Chamado pelo hook quando a saída acaba. */
  const arrumar = useCallback((id: string) => {
    jaDeslizados.current.delete(id);
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev.filter((t) => t.id !== id) : prev));
  }, []);

  /**
   * `comecarSaida` NÃO remove o aviso: um aviso que sai do array desaparece
   * antes de poder animar seja o que for, e era isso que fazia a saída seca. O
   * que ele faz é marcá-lo — e é essa marca que, no mesmo commit, lhe tira os
   * `pointer-events` e lhe põe o gesto de saída.
   */
  const { aSair, comecarSaida, podar } = useSaidaAdiada(arrumar);

  // The auto-dismiss timer now lives in each ToastItem so it can be paused on
  // hover/focus — the provider just enqueues.
  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = idUnico();
    setToasts((prev) => [...prev, { id, kind, message }].slice(-MAX_TOASTS));
  }, []);

  /**
   * O FLIP. Corre num efeito de LAYOUT — antes de o browser pintar —, senão o
   * salto que isto existe para esconder aparecia um fotograma antes de ser
   * corrigido, que é precisamente o defeito.
   */
  useLayoutEffect(() => {
    const pilha = pilhaRef.current;
    if (!pilha) return;

    for (const id of aSair) {
      if (jaDeslizados.current.has(id)) continue;
      const noQueSai = nos.current.get(id);
      const grupo = noQueSai?.parentElement;
      if (!noQueSai || !grupo) continue;
      jaDeslizados.current.add(id);

      // Os que ficam. Um irmão que JÁ está a sair está fora de fluxo e pregado
      // ao sítio onde morreu: deslocá-lo seria mexer num fantasma.
      const irmaos = [...nos.current.entries()]
        .filter(([outro, el]) => outro !== id && !aSair.includes(outro) && el.isConnected)
        .map(([, el]) => el);

      // FIRST — onde é que cada um está agora.
      const caixaPilha = pilha.getBoundingClientRect();
      const antes = irmaos.map((el) => el.getBoundingClientRect().top);

      // A largura da pilha é a do aviso mais largo, e a caixa está encostada à
      // direita. Se quem sai for o mais largo, tirá-lo do fluxo encolhe a pilha
      // e leva os que ficam com ela, para o lado. Fixa-se a largura durante a
      // saída; volta ao normal quando a pilha ficar sem ninguém a sair.
      pilha.style.minWidth = `${caixaPilha.width}px`;

      // Fora do fluxo, no sítio exacto onde já estava. O grupo é `relative`,
      // portanto o `top` é medido a partir dele.
      //
      // E MEDE-SE O GRUPO DEPOIS, NÃO ANTES. Esta ordem custou uma medição a
      // descobrir e é a armadilha toda deste bloco: ao sair do fluxo, o aviso
      // deixa de contar para a altura do grupo — e como a pilha está encostada
      // ao FUNDO, o grupo encolhe pelo topo e desce. Um `top` calculado com a
      // caixa antiga do grupo punha o fantasma 42 a 50 px abaixo de onde
      // estava, ou seja o aviso SALTAVA no primeiro fotograma da saída, que é
      // exactamente o defeito que isto existe para corrigir. Medido nos quatro
      // arranjos possíveis da pilha (ver `e2e/saida-do-aviso.mjs`); com o grupo
      // medido depois, o salto é zero nos quatro.
      const caixa = noQueSai.getBoundingClientRect();
      noQueSai.style.position = "absolute";
      noQueSai.style.right = "0px";
      noQueSai.style.width = `${caixa.width}px`;
      const caixaGrupo = grupo.getBoundingClientRect();
      noQueSai.style.top = `${caixa.top - caixaGrupo.top}px`;

      // LAST — e onde é que cada um passou a estar.
      const depois = irmaos.map((el) => el.getBoundingClientRect().top);

      // INVERT — de volta ao sítio antigo, sem transição nenhuma.
      const deslocados: HTMLDivElement[] = [];
      irmaos.forEach((el, i) => {
        const desvio = antes[i] - depois[i];
        if (Math.abs(desvio) < 0.5) return;
        el.style.transition = "none";
        el.style.transform = `translateY(${desvio}px)`;
        deslocados.push(el);
      });

      if (deslocados.length === 0) continue;
      // Obriga o browser a assentar o `transform` acima ANTES de o fotograma
      // seguinte lhe mexer: sem esta leitura as duas escritas juntavam-se numa
      // só e não havia transição nenhuma para animar.
      void pilha.offsetHeight;

      // PLAY — e daí para o lugar novo, nos mesmos 200 ms do desvanecimento.
      // Dois `requestAnimationFrame` porque o primeiro pode ainda cair no
      // fotograma que já está a ser preparado, e aí o «inverter» e o «largar»
      // aconteciam no mesmo — ou seja, não se via nada.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const el of deslocados) {
            el.style.transition = `transform ${SAIDA_MS}ms ${CURVA_QUE_APRESENTA}`;
            el.style.transform = "translateY(0px)";
          }
        });
      });
    }
  }, [aSair]);

  /**
   * Quando não há ninguém a sair, apaga-se tudo o que o FLIP escreveu à mão.
   * Não é arrumação por gosto: um `transform` que fica pendurado num elemento
   * cria um containing block, e é assim que um `position: fixed` lá dentro
   * deixa de ser fixo. Corre num efeito de layout para o apagar antes de pintar
   * — nesse instante os irmãos já estão em `translateY(0px)`, portanto
   * tirar-lho não mexe nada.
   */
  useLayoutEffect(() => {
    if (aSair.length > 0) return;
    for (const el of nos.current.values()) {
      el.style.transition = "";
      el.style.transform = "";
    }
    if (pilhaRef.current) pilhaRef.current.style.minWidth = "";
  }, [aSair]);

  /**
   * Um aviso a sair pode ser deitado fora pelo tecto do `MAX_TOASTS` antes de a
   * saída acabar. Sem esta poda ficava um nome preso na lista do hook para
   * sempre — e com ele a pilha com a largura fixa e os irmãos com `transform`
   * colado.
   */
  useLayoutEffect(() => {
    podar(toasts.map((t) => t.id));
  }, [toasts, podar]);

  const registar = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nos.current.set(id, el);
    else nos.current.delete(id);
  }, []);

  // Errors go to an assertive `role="alert"` region so they interrupt and are
  // never missed; success/info stay in a polite `role="status"` region. Both
  // sit in one visual stack (bottom-right) so ordering still reads naturally.
  const errorToasts = toasts.filter((t) => t.kind === "error");
  const politeToasts = toasts.filter((t) => t.kind !== "error");

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* ── O AVISO NÃO PODE POUSAR EM CIMA DA NAVEGAÇÃO ──────────────────
          MEDIDO a 375×667: com `bottom-6` (24 px) a caixa do aviso acabava aos
          635 px e a barra de baixo do telemóvel começa aos 610 — 25 px de
          sobreposição, opaco sobre opaco, mesmo por cima dos ícones de «Visão
          Geral» e «Pedidos» (que ficam nos primeiros ~20 px da barra). E é o
          pior momento possível para tapar a navegação: o aviso aparece quando
          alguma coisa falhou, que é quando ela quer sair dali.

          A conta é a mesma que o `<main>` já faz para não esconder a última
          linha da lista: a altura da barra, mais o entalhe, mais um respiro.
          Acima de `lg` não há barra nenhuma e volta aos 24 px de sempre.

          ── E A ALTURA VEM DO TOKEN, não de um «56px» escrito aqui ──────────
          Estava escrito. Era a TERCEIRA cópia do mesmo número (o `<main>` tinha
          as outras duas), e foi a que sobrou quando a barra cresceu para 72 px
          ao levantar os rótulos de 8 px para o chão de 12: o aviso passou a
          acabar aos 603 px com a barra a começar aos 594, ou seja a pousar-lhe
          em cima — exactamente o defeito que este comentário diz ter corrigido.
          Quem o apanhou foi o passeio `admin-mobile.spec.ts`, não os olhos.
          Com `var(--bo-barra-inferior)` deixa de haver número para discordar.

          ── E HÁ UM ECRÃ COM UMA SEGUNDA BARRA POR CIMA DESSA ──────────────
          O estúdio de propostas põe a sua acção principal («Pré-visualizar»,
          «Gerar e enviar») numa barra que pousa em cima da navegação, com uns
          64 px de altura. O aviso levantava-se 12 px do chão e nascia DENTRO
          dessa faixa — em cima do botão, a apanhar-lhe o toque durante os 4 s
          em que fica no ecrã. Medido a 375 px.
          `--bo-barra-accao` é a altura MEDIDA dessa barra, publicada pelo
          próprio estúdio enquanto está aberto (e ausente — logo, zero — em
          todo o resto do back office, que não tem barra nenhuma ali). O aviso
          soma-a e passa a pousar-lhe em cima, à vista, sem tapar nada. Acima
          de `lg` a navegação do telemóvel desaparece mas a barra do estúdio
          fica, encostada ao fundo: por isso o `lg:` também a soma. */}
      <div
        ref={pilhaRef}
        className="fixed bottom-[calc(var(--bo-barra-inferior)+var(--bo-barra-accao,0px)+env(safe-area-inset-bottom)+0.75rem)] right-6 z-[80] flex flex-col gap-2 pointer-events-none lg:bottom-[calc(var(--bo-barra-accao,0px)+1.5rem)]"
      >
        {/* `relative` porque o aviso que sai passa a `absolute` DENTRO da sua
            região, no sítio exacto onde estava (ver o FLIP acima). Sem isto o
            sítio seria medido a partir de outra caixa e o aviso mudava de lugar
            no primeiro fotograma da saída, que é o oposto do que se quer. */}
        <div role="alert" aria-live="assertive" className="relative flex flex-col gap-2">
          {errorToasts.map((t) => (
            <ToastItem
              key={t.id}
              toast={t}
              aSair={aSair.includes(t.id)}
              aoFechar={() => comecarSaida(t.id)}
              registar={registar}
            />
          ))}
        </div>
        <div role="status" aria-live="polite" className="relative flex flex-col gap-2">
          {politeToasts.map((t) => (
            <ToastItem
              key={t.id}
              toast={t}
              aSair={aSair.includes(t.id)}
              aoFechar={() => comecarSaida(t.id)}
              registar={registar}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

const DOT: Record<ToastKind, string> = {
  success: "#7c854b",
  error: "#8a2a22",
  info: "#8a8a82",
};

function ToastItem({
  toast,
  aSair,
  aoFechar,
  registar,
}: {
  toast: Toast;
  aSair: boolean;
  aoFechar: () => void;
  registar: (id: string, el: HTMLDivElement | null) => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Auto-dismiss after TOAST_DURATION, but pause the countdown while the toast is
  // hovered or focused (and resume from where it left off on leave/blur) so a
  // reader is never rushed off a message they're still engaging with.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(TOAST_DURATION);
  const startedRef = useRef(0);
  const onCloseRef = useRef(aoFechar);
  // Keep the ref current without touching it during render (refs are write-only
  // outside render/effects); this lets the mount-only timer always call the
  // latest onClose without re-arming on every parent re-render.
  useEffect(() => {
    onCloseRef.current = aoFechar;
  });

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const resume = () => {
    clear();
    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current(), remainingRef.current);
  };
  const pause = () => {
    if (!timerRef.current) return;
    clear();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
  };

  useEffect(() => {
    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current(), remainingRef.current);
    return clear;
    // Run once on mount; onClose is read via ref so it needn't be a dep.
  }, []);

  // Já a sair: o relógio não tem mais nada a fazer, e um aviso fora de fluxo
  // não deve poder recomeçar a contagem por um `mouseleave` de despedida.
  useEffect(() => {
    if (aSair) clear();
  }, [aSair]);

  return (
    <div
      ref={(el) => registar(toast.id, el)}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      /* ── O `pointer-events` LARGA-SE AQUI, E É POR ISSO QUE É UMA CLASSE ──
         `aSair` chega a este componente no mesmo commit do React em que a saída
         começa, portanto o `pointer-events-none` está aplicado antes de o
         browser pintar o primeiro fotograma. Se isto fosse feito num
         `setTimeout`, num `requestAnimationFrame` ou no fim da animação, havia
         uma janela em que uma caixa a desaparecer continuava a ser o alvo do
         toque — e por baixo dela está o botão «Gerar e enviar» do estúdio. Ver
         o bloco grande lá em cima, ponto 2.

         A `.bo-saida` já traz `pointer-events: none` dentro dela; o utilitário
         aqui é a segunda volta à chave, e é o que um teste em jsdom consegue
         ver (uma folha de estilo não é carregada lá). */
      className={`${
        aSair
          ? `${SAIDA_FOLHA} pointer-events-none`
          : `pointer-events-auto ${ENTRADA_DO_AVISO} ${
              shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`
      } flex items-center gap-3 min-w-[260px] max-w-sm bg-white border border-[var(--bo-hairline-strong)] rounded-xl pl-4 pr-3 py-3 shadow-[var(--bo-sombra-suspensa)]`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: DOT[toast.kind] }}
      />
      <p className="flex-1 text-[var(--bo-tinta-72)] text-sm leading-snug">{toast.message}</p>
      {/* ── 9×14 PX, E É O BOTÃO QUE FECHA UM AVISO ──────────────────────
          MEDIDO a 375 px: nove píxeis de largura por catorze de altura. É o
          alvo mais pequeno de todo o back office, e está no elemento que
          aparece precisamente quando alguma coisa correu mal — «Não foi
          possível guardar», «Não foi possível criar a tarefa». Num telemóvel
          não havia como o fechar: restava esperar que se apagasse sozinho,
          com o aviso pousado por cima do conteúdo até lá.

          `alvo-toque` dá-lhe 44×44 só sob `(pointer: coarse)`; o `×` desenhado
          continua do mesmo tamanho, e no portátil o aviso fica igual. O
          `-mr-1.5` devolve ao aviso a largura que a caixa maior lhe tirava,
          para o texto não encolher por causa disto. */}
      <button
        onClick={aoFechar}
        className={`alvo-toque pointer-coarse:-mr-1.5 text-foreground/40 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO} text-sm leading-none shrink-0`}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
