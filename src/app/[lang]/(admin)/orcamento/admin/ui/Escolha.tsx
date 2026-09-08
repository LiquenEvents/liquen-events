"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useCapacidade, useMontado } from "./adaptativo";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";
import { SAIDA, useSaidaDeUmSo } from "./saida";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESCOLHER DEIXA DE SER UMA CAIXA DO SISTEMA OPERATIVO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com duas capturas de `<select>` abertos por baixo: «fica assim
 * para escolher e eu quero melhorar o design disto e a animação».
 *
 * Ela tem razão e não há meio-termo: a lista de um `<select>` é desenhada pelo
 * SISTEMA OPERATIVO, fora do documento. Não é «CSS difícil» — é CSS impossível.
 * Nem `background`, nem raio, nem a nossa `.bo-entrada` lá chegam; o azul das
 * capturas é o azul de selecção do Windows e não uma cor desta casa. Para haver
 * desenho e movimento tem de haver uma lista NOSSA, no documento.
 *
 * ── E O QUE UM `<select>` DÁ DE GRAÇA, QUE É MUITO ──────────────────────────
 *
 * Isto é sobretudo trabalho de ACESSIBILIDADE disfarçado de desenho. A caixa
 * feia traz, sem uma linha escrita: teclado completo (setas, Home/End, escrever
 * para saltar), leitor de ecrã perfeito, funciona sem JavaScript, participa no
 * formulário (`name`, `value`, `required`, validação nativa) e, no iPhone, abre
 * o selector de roda do sistema. Um substituto mal feito é MUITO pior do que a
 * caixa que substitui — por isso está aqui tudo, e por isso há testes de
 * teclado a sério ao lado (`Escolha.teclado.test.tsx`).
 *
 * ── A DECISÃO DO TELEMÓVEL: NO TOQUE MANTÉM-SE O NATIVO ─────────────────────
 *
 * Há duas soluções válidas — um componente só para todos, ou o nativo no dedo e
 * o nosso no rato. Esta escolheu a segunda, e a razão é medida, não gosto:
 *
 *  1. **A queixa é do computador.** As duas capturas mostram a lista aberta com
 *     o realce azul do sistema e as opções sem estilo nenhum. É esse o desenho
 *     que o sistema impõe COM RATO. No iPhone o `<select>` não desenha lista
 *     nenhuma: abre a roda do sistema, colada em baixo, ao alcance do polegar,
 *     com inércia, com o rotor do VoiceOver a funcionar e com o «Concluído»
 *     que toda a gente já conhece. Substituir isso é trocar uma coisa boa por
 *     uma imitação.
 *
 *  2. **O que ela vê fechado é o mesmo nos dois.** O botão fechado — moldura,
 *     raio, tinta, seta, pressão — é desenhado por nós nos DOIS caminhos, com a
 *     mesma cadeia de classes (`FECHADO`). O que muda é só o que acontece ao
 *     tocar. Ou seja: o ganho de desenho chega ao telemóvel na mesma; o que não
 *     chega é a nossa animação de abertura, e no lugar dela está a do sistema.
 *
 *  3. **O que se perderia é caro e invisível.** Uma lista nossa num ecrã de
 *     390 px tem de resolver o teclado virtual a tapar metade do ecrã, a
 *     rolagem com inércia, o alcance do polegar no topo de um ecrã de 6", e o
 *     VoiceOver em modo de toque — quatro sítios onde se falha em silêncio.
 *
 *  4. **E há uma regra desta casa a apontar para o mesmo lado.** O `globals.css`
 *     dá a `input, textarea, select` sob `(pointer: coarse)` os 16 px que
 *     impedem o Safari de AMPLIAR a página ao focar, e os 44 px de altura
 *     mínima. Um `<button>` não está nessas listas. Ficar no nativo herda as
 *     duas; o caminho nosso tem de as pedir à mão (e pede — ver `FECHADO`).
 *
 * A decisão é uma PROPRIEDADE (`nativoNoToque`, ligada por omissão) e não uma
 * lei: no dia em que a lista nossa for testada no iPhone dela, desliga-se num
 * sítio só.
 *
 * ── E POR ISSO NÃO HÁ PISCAR NENHUM À CHEGADA ───────────────────────────────
 *
 * O servidor não sabe que apontador é que há do outro lado (`matchMedia` não
 * existe lá), e responder mal a essa pergunta é como se troca um desenho à
 * frente de quem está a olhar. A resposta aqui é dupla:
 *
 *  · **O primeiro desenho — servidor e primeiro fotograma do browser — é
 *    sempre o `<select>` nativo.** Sai HTML que funciona SEM JavaScript, com o
 *    valor certo e dentro do formulário. Só depois de montado é que o rato
 *    ganha a lista nossa.
 *  · **E a troca não se vê**, porque os dois estados fechados partilham a mesma
 *    cadeia de classes. É a mesma lição que o `MenuDeAccoes` escreveu ao trocar
 *    o `usePodeEsconderNoHover()` por variantes de CSS: uma decisão em
 *    JavaScript custa um fotograma, e o que se paga com ele é o desenho ser
 *    igual dos dois lados.
 *
 * ── O PADRÃO ARIA, E PORQUE É QUE O FOCO NUNCA SAI DO BOTÃO ─────────────────
 *
 * É o «select-only combobox» do APG: `role="combobox"` no botão,
 * `role="listbox"` na lista, `role="option"` em cada linha, e
 * `aria-activedescendant` a dizer qual delas está sob o cursor. O FOCO do DOM
 * fica sempre no botão — nunca salta para as opções.
 *
 * Isso resolve de graça o requisito que mais vezes se vê partido: «o foco volta
 * ao botão quando fecha, sempre, e no instante». Aqui não há volta nenhuma a
 * dar, porque nunca foi a lado nenhum — nem depois do Escape, nem depois de
 * escolher, nem 200 ms depois com um `setTimeout`. O único caminho que mexia no
 * foco era o rato a carregar numa opção, e esse está travado no
 * `onPointerDown` (`preventDefault`), que é o mesmo truque que impede o botão
 * de perder o foco enquanto se escolhe.
 *
 * ── O MOVIMENTO VEM TODO DO VOCABULÁRIO ─────────────────────────────────────
 *
 * Zero números à mão: a entrada é a `.bo-entrada` (4 px, a distância de um item
 * de menu — que é exactamente o que isto é), a saída é a `.bo-saida` pelo
 * `useSaidaDeUmSo`, e os estados e a pressão são o `ESTADO`/`PRESSAO` de
 * `movimento.ts`. Quem subir as distâncias e os tempos do vocabulário sobe isto
 * junto, sem tocar aqui.
 *
 * E a regra que já custou caro nesta casa: **a lista larga os toques no
 * primeiro fotograma da saída**, sem temporizador nenhum. Vem de dentro da
 * `.bo-saida` (`pointer-events: none` está na própria classe), aplicada no
 * MESMO commit em que a lista é marcada como a sair. Uma caixa a desvanecer-se
 * que continue a apanhar o toque impede o clique no que está por baixo.
 *
 * @example
 * <Escolha
 *   aria-label="Filtrar por categoria"
 *   valor={cat}
 *   aoMudar={setCat}
 *   opcoes={[{ valor: "todas", rotulo: "Todas" }]}
 * />
 *
 * @example  // com os `<option>` de sempre, para migrar um `<select>` sem os reescrever
 * <Escolha valor={area} aoMudar={setArea} aria-label="Área">
 *   <option value="">Área…</option>
 *   {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
 * </Escolha>
 */

export interface OpcaoDeEscolha {
  /** O valor gravado. É sempre uma cadeia, como no `<select>` nativo. */
  valor: string;
  /** O que se desenha na linha. */
  rotulo: ReactNode;
  /**
   * O que se LÊ — o que aparece no botão fechado e o que o «escrever para
   * saltar» procura. Só é preciso quando o `rotulo` não é texto simples (um
   * ícone, uma cor, duas linhas); nesse caso, sem isto, a opção fica sem nome.
   */
  texto?: string;
  desactivada?: boolean;
  /** O `<optgroup>`: opções com o mesmo grupo aparecem juntas, sob o nome. */
  grupo?: string;
}

export interface EscolhaProps {
  /** As opções. Em alternativa, passa-se `<option>`/`<optgroup>` como filhos. */
  opcoes?: readonly OpcaoDeEscolha[];
  /** `<option>` e `<optgroup>`, para migrar um `<select>` sem reescrever nada. */
  children?: ReactNode;
  /** O valor escolhido. Cadeia, como no nativo — `String(n)` para números.
   *  Deixá-lo por dizer torna o campo NÃO-CONTROLADO, como um `<select>` sem
   *  `value`: o estado passa a ser de cá dentro e arranca no `valorInicial`. */
  valor?: string;
  /** O arranque de um campo não-controlado. É o `defaultValue` do nativo. */
  valorInicial?: string;
  /** Chamado com o valor NOVO. Não é um evento: é o valor. */
  aoMudar: (valor: string) => void;
  /** O texto do botão quando nenhuma opção casa com o `valor`. */
  vazio?: string;
  disabled?: boolean;
  required?: boolean;
  /** Participa no formulário à volta com este nome (ver a nota no `<select>`
   *  escondido, lá em baixo — é ele que traz o `required` nativo junto). */
  name?: string;
  /** O `id` do controlo. Atenção: um `<label for>` NOMEIA um `<select>` por ele
   *  ser nativo, mas NÃO nomeia um `role="combobox"` — esse recebe o nome do
   *  autor. Quem migra um campo com rótulo tem de passar `aria-labelledby` (ou
   *  `aria-label`); há uma varredura a guardá-lo (`Escolha.nome.test.ts`). */
  id?: string;
  /**
   * Uma referência para o CONTROLO — o botão com rato, o `<select>` no dedo.
   *
   * Existe porque há quem leve o foco ao primeiro campo de um formulário ao
   * abri-lo (o painel de pagamentos). Tipada em `HTMLElement` e não em
   * `HTMLSelectElement`, porque o elemento muda com o apontador — e é essa a
   * única coisa que quem a usa precisa de saber.
   */
  controloRef?: { current: HTMLElement | null };
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** A pele do controlo fechado. `nua` deixa o desenho todo a quem chama — é o
   *  que o `Field` usa, para os seus vinte campos não mudarem de aspecto. */
  variante?: "caixa" | "sublinhado" | "nua";
  /** Classes do botão fechado (e do `<select>` nativo, que é o mesmo desenho). */
  className?: string;
  /** Estilo do controlo fechado. Um `<select>` aceitava-o e há quem o use para
   *  pintar o valor à cor do estado (a lista de convidados). */
  style?: CSSProperties;
  /**
   * Classes da CAIXA à volta — e é aqui que vai a LARGURA, não no `className`.
   *
   * Não é preferência: a seta é desenhada por cima, em posição absoluta
   * relativa a esta caixa. Se o controlo lá dentro fosse mais estreito do que
   * ela (um `w-24` numa célula de tabela), a seta ficava a flutuar longe do
   * campo a que pertence. Por isso a caixa é um `inline-grid` — encolhe ao que
   * tem dentro — e quem quer outra largura di-la AQUI (`w-full`, `flex-1`,
   * `sm:w-44`), que é onde ela vale para os dois de uma vez.
   */
  containerClassName?: string;
  /**
   * No dedo, abre-se o selector do sistema em vez da lista nossa. Ligado por
   * omissão — a justificação está no cabeçalho deste ficheiro.
   */
  nativoNoToque?: boolean;
}

/* ── O DESENHO FECHADO, UM SÓ PARA OS DOIS CAMINHOS ────────────────────────
   É esta cadeia que faz a troca `<select>` → botão ser invisível à chegada, e
   por isso a geometria tem de ser a MESMA nos dois: o mesmo preenchimento, a
   mesma reserva à direita (`pr-9`) e a seta desenhada por cima em posição
   absoluta — nunca como filho de um `flex` num lado e sobreposta no outro, que
   era como os dois deixavam de coincidir ao pixel.

   O que ela NÃO traz é largura: quem chama é que a dá (`w-auto`, `sm:w-44`, …),
   tal como já dava ao `<select>` que aqui estava. O `.bo-input` põe 100% por
   omissão, dentro de `@layer components`, portanto um `w-auto` continua a
   ganhar-lhe (é a nota do `globals.css` sobre a largura).

   `pointer-coarse:min-h-11` e `pointer-coarse:text-base`: os 44 px e os 16 px
   que o `globals.css` dá a um `<select>` sob `(pointer: coarse)` — o primeiro
   para o dedo acertar, o segundo para o Safari do iOS não AMPLIAR a página ao
   focar. Um `<button>` não está nessas listas e tem de os pedir. Só contam
   quando alguém desligar o `nativoNoToque`, e é precisamente aí que têm de já
   lá estar. */
const FECHADO_BASE =
  "text-left pr-9 pointer-coarse:min-h-11 pointer-coarse:text-base " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  ESTADO;

/**
 * As peles. São as mesmas duas do `Field`, e a terceira é a ausência delas.
 *
 * `nua` existe porque o `Field` desenha o seu próprio controlo há muito tempo,
 * com a sua cadeia e as suas cores de erro, e a migração não podia mudar o
 * aspecto de vinte campos de uma vez — o que se troca lá é o MECANISMO de
 * escolher, não o desenho. Com `nua`, a cadeia de quem chama é a única que
 * pinta.
 */
/** A caixa. `inline-grid` para encolher ao controlo — ver `containerClassName`. */
const CAIXA = "relative inline-grid align-middle";

const PELE = {
  caixa: "bo-input px-3.5 py-2.5",
  sublinhado:
    "w-full rounded-none border-0 border-b border-foreground/20 bg-transparent px-0 py-2 " +
    "text-sm hover:border-foreground/40 focus:border-sage-600",
  nua: "",
} as const;

/* ── A SETA VIRA-SE, E NÃO ESCREVE UM TEMPO SEU ────────────────────────────
   Primeira versão: `rotate-180` com `motion-safe:transition-transform` e a
   duração lida do `ESTADO` por expressão regular. Funcionava — e o
   `movimento.test.ts` desta pasta chumbou-a, com razão. A regra que ele guarda
   é «as durações vivem só no `movimento.ts`», e um ficheiro que traz a cadeia
   `motion-safe:duration-` escrita, mesmo que seja só para a LER, é um sítio
   onde no dia seguinte alguém escreve um número.

   A saída não é dobrar o guarda: é não precisar dele. O `ESTADO` já transiciona
   `scale` — foi a propriedade que o `movimento.ts` teve de lá pôr para o toque
   do `Button` deixar de ser um corte seco. E uma seta que se vira ao contrário
   é exactamente um `scale` de -1 no eixo Y: o mesmo desenho de um `rotate-180`,
   com a diferença de cair dentro da lista de propriedades que o vocabulário já
   anima. Zero durações aqui, zero curvas aqui, e a subida dos tempos do
   vocabulário chega-lhe sem se tocar neste ficheiro.

   ── E ISTO É A ARMADILHA DO TAILWIND 4, DO OUTRO LADO ─────────────────────
   `-scale-y-100` emite a propriedade AUTÓNOMA `scale`, não `transform`. Um
   `rotate-180` emitiria a propriedade autónoma `rotate`, que NÃO está na lista
   do `ESTADO` — e a seta saltaria a seco com os 120 ms ao lado sem lhe tocarem.
   É a mesma avaria que o `movimento.ts` conta ter apanhado no `scale` do
   `Button`, e é por isso que há um teste ao lado a proibir o `rotate-` aqui. */

/** A folga entre o campo e a lista (o `mt-1`/`mb-1`), mais um fio. */
const MARGEM = 8;
/** Meio segundo sem tocar no teclado apaga o que se escreveu. É o que o APG usa
 *  para o «escrever para saltar», e o que um `<select>` nativo faz. */
const MEMORIA_DO_TECLADO_MS = 500;

/* ═══════════════════════════════════════════════════════════════════════════
   OS `<option>` DE SEMPRE, LIDOS COMO DADOS
   ═══════════════════════════════════════════════════════════════════════════

   Quarenta e dois `<select>` no back office, e quase todos com os `<option>`
   escritos à mão ou saídos de um `.map()`. Obrigá-los todos a passar a um array
   era reescrever quarenta e dois sítios à mão — e cada reescrita é uma
   oportunidade de trocar um valor por um rótulo em silêncio.

   Por isso os filhos continuam a valer, e são lidos com as MESMAS regras do
   nativo, que é onde os enganos moram:
    · sem `value`, o valor é o TEXTO da opção (`<option>Todas</option>`);
    · o `value` é convertido para cadeia (`value={0.23}` → `"0.23"`), tal como
      o DOM faz — é por isso que quem lê números faz `Number(v)` do outro lado;
    · `<optgroup label>` vira o `grupo` das opções lá dentro. */
function textoDe(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textoDe).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textoDe(node.props.children);
  return "";
}

function opcoesDosFilhos(children: ReactNode, grupo?: string): OpcaoDeEscolha[] {
  const saida: OpcaoDeEscolha[] = [];
  for (const filho of Children.toArray(children)) {
    if (!isValidElement(filho)) continue;
    if (filho.type === "optgroup") {
      const props = filho.props as { label?: string; children?: ReactNode };
      saida.push(...opcoesDosFilhos(props.children, props.label));
      continue;
    }
    if (filho.type !== "option") continue;
    const props = filho.props as {
      value?: string | number | readonly string[];
      children?: ReactNode;
      disabled?: boolean;
    };
    const texto = textoDe(props.children);
    saida.push({
      valor: props.value === undefined ? texto : String(props.value),
      rotulo: props.children ?? texto,
      texto,
      desactivada: props.disabled,
      grupo,
    });
  }
  return saida;
}

/** Sem acentos e em minúsculas: «Área» encontra-se escrevendo «a», que é o que
 *  se faz sem pensar num teclado português. */
function achatar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function rotuloLegivel(o: OpcaoDeEscolha): string {
  return o.texto ?? textoDe(o.rotulo);
}

export function Escolha({
  opcoes,
  children,
  valor: valorDeFora,
  valorInicial,
  aoMudar,
  vazio = "—",
  disabled,
  required,
  name,
  id,
  variante = "caixa",
  controloRef,
  className,
  style,
  containerClassName,
  nativoNoToque = true,
  ...aria
}: EscolhaProps) {
  const idAutomatico = useId();
  const idBotao = id ?? `${idAutomatico}-botao`;
  const idLista = `${idAutomatico}-lista`;

  const lista = useMemo<OpcaoDeEscolha[]>(
    () => (opcoes ? [...opcoes] : opcoesDosFilhos(children)),
    [opcoes, children],
  );

  /**
   * OS GRUPOS, AGRUPADOS UMA VEZ SÓ.
   *
   * Um `<optgroup>` não é decoração: para quem ouve o ecrã é ele que diz «isto
   * são eixos» antes de ler doze etiquetas seguidas. Por isso as opções
   * consecutivas do mesmo grupo passam a viver dentro de um bloco — que no
   * caminho nativo vira um `<optgroup>` e no nosso vira um `role="group"` com
   * nome. Sem este passo a lista ficava plana e o nome do grupo era um
   * `<div>` solto no meio das opções: desenho a fingir de estrutura.
   */
  const blocos = useMemo(() => {
    const saida: { grupo?: string; itens: { o: OpcaoDeEscolha; i: number }[] }[] = [];
    lista.forEach((o, i) => {
      const ultimo = saida[saida.length - 1];
      if (ultimo && ultimo.grupo === o.grupo) ultimo.itens.push({ o, i });
      else saida.push({ grupo: o.grupo, itens: [{ o, i }] });
    });
    return saida;
  }, [lista]);

  /**
   * CONTROLADO OU NÃO, COMO O NATIVO.
   *
   * Um `<select>` sem `value` guarda o seu próprio estado, e há chamadores
   * desta casa que contam com isso (`defaultValue`). Sem esta linha, migrá-los
   * dava um campo preso no vazio — e preso em silêncio, que é o pior modo de
   * falhar: o campo desenha-se, abre-se, escolhe-se, e não muda.
   */
  const [valorInterno, setValorInterno] = useState(valorInicial ?? "");
  const valor = valorDeFora ?? valorInterno;
  const controlado = valorDeFora !== undefined;

  const { toque } = useCapacidade();
  const montado = useMontado();
  // O primeiro desenho é sempre o nativo: no servidor e no primeiro fotograma
  // do browser `montado` é falso, portanto sai HTML que funciona sem JavaScript
  // e o telemóvel nunca chega a ver outra coisa. Ver o cabeçalho.
  const usarNativo = nativoNoToque && (toque || !montado);

  const indiceDoValor = lista.findIndex((o) => o.valor === valor);
  const escolhida = indiceDoValor === -1 ? undefined : lista[indiceDoValor];

  const [aberto, setAberto] = useState(false);
  // Onde está o cursor DENTRO da lista aberta. Não é o valor: só passa a valor
  // quando se carrega em Enter, em Espaço, ou com o rato.
  const [activa, setActiva] = useState(-1);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const teclado = useRef<{ texto: string; relogio: ReturnType<typeof setTimeout> | null }>({
    texto: "",
    relogio: null,
  });
  /**
   * ── ONDE É QUE A LISTA CABE ───────────────────────────────────────────────
   *
   * Duas perguntas, e a primeira versão só fazia uma delas: «de que lado há
   * mais espaço?». Faltava a segunda — «e cabe lá?». Numa janela de 420 px de
   * altura com o campo a meio, a lista virava-se para cima e saía SETENTA E UM
   * PÍXEIS por cima do topo do ecrã: as primeiras opções ficavam inalcançáveis,
   * sem barra de rolagem e sem sinal nenhum. Foi o passeio do Playwright que a
   * apanhou (`e2e/escolha.spec.ts`) — em jsdom não há disposição nenhuma e
   * todas as medidas são zero, portanto lá isto nunca poderia aparecer.
   *
   * Agora escolhe-se o lado E aperta-se a altura ao que há: a lista passa a ter
   * scroll em vez de sair do ecrã. O tecto continua a ser o da classe
   * (`max-h-72`); isto só o encurta quando é preciso.
   */
  const [encaixe, setEncaixe] = useState<{ acima: boolean; alturaMax: number } | null>(null);

  const aSair = useSaidaDeUmSo(aberto);

  const primeiraUtil = useCallback(
    (desde: number, passo: number) => {
      for (let i = desde; i >= 0 && i < lista.length; i += passo) {
        if (!lista[i].desactivada) return i;
      }
      return -1;
    },
    [lista],
  );

  const abrir = useCallback(
    (posicao?: number) => {
      if (disabled) return;
      const doValor =
        indiceDoValor !== -1 && !lista[indiceDoValor].desactivada ? indiceDoValor : -1;
      const alvo = posicao ?? (doValor !== -1 ? doValor : primeiraUtil(0, 1));
      setActiva(alvo);
      setAberto(true);
    },
    [disabled, indiceDoValor, lista, primeiraUtil],
  );

  /**
   * Fechar é uma coisa só, e o foco faz parte dela.
   *
   * O `.focus()` está aqui mesmo quando o foco já está no botão — que é o caso
   * normal deste padrão. Não é redundância inútil: é o que garante o requisito
   * quando alguém, um dia, puser algo focável dentro da lista. E é síncrono,
   * dentro do próprio manipulador do gesto: nunca num `setTimeout`, nunca no
   * fim da animação de saída.
   */
  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    setActiva(-1);
    if (devolverFoco) botaoRef.current?.focus();
  }, []);

  const mudar = useCallback(
    (novo: string) => {
      if (novo === valor) return;
      if (!controlado) setValorInterno(novo);
      aoMudar(novo);
    },
    [aoMudar, controlado, valor],
  );

  const escolher = useCallback(
    (i: number) => {
      const o = lista[i];
      if (!o || o.desactivada) return;
      mudar(o.valor);
      fechar();
    },
    [fechar, lista, mudar],
  );

  /** Escrever para saltar. Devolve o índice encontrado, ou -1. */
  const saltarPorTexto = useCallback(
    (tecla: string, partirDe: number) => {
      const t = teclado.current;
      if (t.relogio) clearTimeout(t.relogio);
      t.texto += achatar(tecla);
      t.relogio = setTimeout(() => {
        t.texto = "";
        t.relogio = null;
      }, MEMORIA_DO_TECLADO_MS);

      // Todas as letras iguais («eee») quer dizer «o próximo que comece por e»:
      // é assim que se percorrem os cinco «Ent…» de uma lista, e é o que o
      // `<select>` nativo faz.
      const letras = [...t.texto];
      const mesmaLetra = letras.length > 1 && letras.every((c) => c === letras[0]);
      const procura = mesmaLetra ? letras[0] : t.texto;
      // Com uma letra repetida começa-se DEPOIS da actual; a escrever uma
      // palavra fica-se onde se está, senão «ev» saltava o «Eventos» que o «e»
      // acabou de encontrar.
      const inicio = mesmaLetra || t.texto.length === 1 ? partirDe + 1 : partirDe;

      for (let n = 0; n < lista.length; n++) {
        const i = (((inicio + n) % lista.length) + lista.length) % lista.length;
        const o = lista[i];
        if (o.desactivada) continue;
        if (achatar(rotuloLegivel(o)).startsWith(procura)) return i;
      }
      return -1;
    },
    [lista],
  );

  useEffect(() => {
    const t = teclado.current;
    return () => {
      if (t.relogio) clearTimeout(t.relogio);
    };
  }, []);

  // Fechar ao carregar fora. `pointerdown` e não `click`, pela mesma razão do
  // `MenuDeAccoes`: com `click` a lista só fechava depois de a acção por baixo
  // já ter disparado. E sem devolver o foco — aqui ele vai para onde a pessoa
  // carregou, que é exactamente onde ela quis ir.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) fechar(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto, fechar]);

  // A opção sob o cursor tem de estar à vista — com trinta opções, o cursor
  // desaparecia para fora da caixa e as setas pareciam não fazer nada.
  useEffect(() => {
    if (!aberto || activa < 0) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-i="${activa}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [aberto, activa]);

  /**
   * ── E MEDE-SE OUTRA VEZ QUANDO O CHÃO SE MEXE ─────────────────────────────
   *
   * Medir uma vez, ao abrir, não chega — e a razão só aparece num browser. A
   * lista está posicionada em relação ao CAMPO, portanto rola com a página; a
   * conta de «cabe por baixo?» é em relação ao ECRÃ, e essa muda a cada píxel
   * de scroll. Entre a medida e o fotograma seguinte há pelo menos uma coisa a
   * rolar de certeza: o `scrollIntoView` que traz a opção sob o cursor à vista.
   *
   * Foi assim que o passeio do Playwright viu a lista dois píxeis acima do topo
   * do ecrã com a conta toda certa — a conta estava certa PARA ONDE O CAMPO
   * ESTAVA. Agora refaz-se enquanto ela estiver aberta.
   */
  useEffect(() => {
    // Fechada não se mede nada — e a medida ANTERIOR fica. Não é desleixo:
    // limpá-la aqui era um `setState` dentro de um efeito (que o lint desta
    // casa desaconselha, e com razão) para trocar um fotograma com a colocação
    // certa da última vez por um fotograma com a colocação por omissão. A
    // primeira coisa que o efeito faz ao reabrir é medir outra vez.
    if (!aberto) return;
    const medir = () => {
      const b = botaoRef.current?.getBoundingClientRect();
      const lista = listaRef.current;
      if (!b || !lista) return;
      // A altura que ela QUERIA ter, e não a que já lhe demos: sem isto, a
      // segunda medida via a lista já apertada e nunca mais a deixava crescer.
      const querida = lista.scrollHeight;
      if (!querida) return;
      const abaixo = window.innerHeight - b.bottom - MARGEM;
      const acimaDela = b.top - MARGEM;
      const acima = querida > abaixo && acimaDela > abaixo;
      const espaco = acima ? acimaDela : abaixo;
      /* SEM CHÃO MÍNIMO, E É DELIBERADO.
         A primeira correcção punha aqui um piso («nunca abaixo de duas
         linhas»). Parecia cuidado e era o mesmo defeito outra vez, mais
         pequeno: numa janela baixa o piso ganhava ao espaço e a lista voltava a
         sair do ecrã — agora só dois píxeis, que é pior do que setenta, porque
         passa despercebido. Uma lista curta com scroll lê-se; uma lista cortada
         fora do ecrã não. */
      const alturaMax = Math.min(querida, Math.max(espaco, 0));
      setEncaixe((antes) =>
        antes && antes.acima === acima && Math.abs(antes.alturaMax - alturaMax) < 1
          ? antes
          : { acima, alturaMax },
      );
    };
    medir();
    // `capture` para apanhar o scroll de QUALQUER contentor pelo caminho (o
    // corpo da tabela, o painel lateral), e não só o da janela.
    window.addEventListener("scroll", medir, { passive: true, capture: true });
    window.addEventListener("resize", medir, { passive: true });
    return () => {
      window.removeEventListener("scroll", medir, { capture: true });
      window.removeEventListener("resize", medir);
    };
  }, [aberto]);

  function teclas(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const ultima = lista.length - 1;

    if (e.key === "Escape") {
      if (!aberto) return;
      e.preventDefault();
      e.stopPropagation();
      fechar();
      return;
    }

    if (e.key === "Tab") {
      // Fecha e segue em frente. Sem `preventDefault`: o Tab é dele, e o foco
      // (que nunca saiu do botão) vai para o campo seguinte como sempre foi.
      // O que estava sob o cursor FICA escolhido — num `<select>` nativo as
      // setas já tinham mudado o valor, e perdê-lo aqui em silêncio seria a
      // diferença que ninguém repara até ter gravado a coisa errada. Quem não
      // quer escolher tem o Escape, e é essa a diferença entre os dois.
      if (aberto) {
        const i = activa;
        setAberto(false);
        setActiva(-1);
        if (i >= 0) {
          const o = lista[i];
          if (o && !o.desactivada) mudar(o.valor);
        }
      }
      return;
    }

    if (!aberto) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " " ||
        e.key === "Spacebar"
      ) {
        e.preventDefault();
        abrir();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        abrir(primeiraUtil(0, 1));
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        abrir(primeiraUtil(ultima, -1));
        return;
      }
      // Escrever com a lista fechada ABRE-A no sítio certo, em vez de mudar o
      // valor por baixo dos pés como o nativo faz. É uma diferença assumida:
      // metade destes campos grava ao mudar (a ordem dos temas, o filtro que
      // fica guardado), e um «e» distraído passaria a ser uma gravação.
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const i = saltarPorTexto(e.key, indiceDoValor);
        if (i !== -1) {
          e.preventDefault();
          abrir(i);
        }
        return;
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        // Sem dar a volta, como o nativo: no fim da lista fica-se no fim. Dar a
        // volta faz uma lista de trinta parecer que saltou para outro sítio.
        const i = primeiraUtil(Math.min(activa + 1, ultima), 1);
        if (i !== -1) setActiva(i);
        return;
      }
      case "ArrowUp": {
        e.preventDefault();
        const i = primeiraUtil(Math.max(activa - 1, 0), -1);
        if (i !== -1) setActiva(i);
        return;
      }
      case "Home": {
        e.preventDefault();
        setActiva(primeiraUtil(0, 1));
        return;
      }
      case "End": {
        e.preventDefault();
        setActiva(primeiraUtil(ultima, -1));
        return;
      }
      case "PageDown": {
        e.preventDefault();
        const i = primeiraUtil(Math.min(activa + 10, ultima), -1);
        if (i !== -1) setActiva(i);
        return;
      }
      case "PageUp": {
        e.preventDefault();
        const i = primeiraUtil(Math.max(activa - 10, 0), 1);
        if (i !== -1) setActiva(i);
        return;
      }
      case "Enter":
      case " ":
      case "Spacebar": {
        e.preventDefault();
        escolher(activa);
        return;
      }
      default: {
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const i = saltarPorTexto(e.key, activa);
          if (i !== -1) {
            e.preventDefault();
            setActiva(i);
          }
        }
      }
    }
  }

  /** A seta vive sempre POR CIMA, em posição absoluta, nos dois caminhos — é
   *  isso que garante que os dois estados fechados coincidem ao pixel. */
  const seta = (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0 opacity-50", ESTADO, aberto && !usarNativo && "-scale-y-100")}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );

  const fechado = cn(FECHADO_BASE, PELE[variante], className);

  /** Uma só referência para os dois caminhos: quem leva o foco ao campo não
   *  tem de saber se hoje ele é um botão ou um `<select>`. */
  const guardarControlo = (el: HTMLElement | null) => {
    if (controloRef) controloRef.current = el;
  };

  /* ── O CAMINHO NATIVO ────────────────────────────────────────────────────
     O dedo, e o primeiro fotograma de toda a gente. A seta é a nossa (o
     `appearance-none` tira a do sistema), e o resto do desenho fechado é a
     mesma cadeia `FECHADO` do outro caminho — é isso que faz a troca não se
     ver. */
  if (usarNativo) {
    return (
      <div className={cn(CAIXA, containerClassName)}>
        <select
          ref={guardarControlo}
          id={idBotao}
          name={name}
          required={required}
          disabled={disabled}
          value={valor}
          onChange={(e) => mudar(e.target.value)}
          className={cn(fechado, "appearance-none")}
          style={style}
          {...aria}
        >
          {/* Um valor que não consta da lista tinha de aparecer na mesma, senão
              o campo mostra a primeira opção e diz uma coisa enquanto o registo
              diz outra. É a mesma rede que o `GuestList` já escrevia à mão. */}
          {indiceDoValor === -1 && valor !== "" && <option value={valor}>{valor}</option>}
          {blocos.map((b, n) =>
            b.grupo ? (
              <optgroup key={`g${n}`} label={b.grupo}>
                {b.itens.map(({ o }) => (
                  <option key={o.valor} value={o.valor} disabled={o.desactivada}>
                    {rotuloLegivel(o)}
                  </option>
                ))}
              </optgroup>
            ) : (
              b.itens.map(({ o }) => (
                <option key={o.valor} value={o.valor} disabled={o.desactivada}>
                  {rotuloLegivel(o)}
                </option>
              ))
            ),
          )}
        </select>
        {seta}
      </div>
    );
  }

  const activaId = activa >= 0 ? `${idLista}-${activa}` : undefined;

  return (
    <div ref={caixaRef} className={cn(CAIXA, containerClassName)}>
      <button
        ref={(el) => {
          botaoRef.current = el;
          guardarControlo(el);
        }}
        type="button"
        id={idBotao}
        role="combobox"
        // A sair, a lista já não é uma lista: o `aria-expanded` volta a falso e
        // o `aria-controls`/`aria-activedescendant` deixam de apontar para ela
        // NO MESMO desenho em que ela é marcada — nunca no fim da animação.
        aria-expanded={aberto}
        aria-haspopup="listbox"
        aria-controls={aberto ? idLista : undefined}
        aria-activedescendant={aberto ? activaId : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={teclas}
        className={cn(fechado, PRESSAO, "block")}
        style={style}
        {...aria}
      >
        {/* O vazio do campo: `--bo-text-muted` e não o `text-foreground/45`
            que aqui estava. Aquele media 3,11:1 sobre branco — e isto não é
            decoração nenhuma: é o texto que diz o que o campo tem quando ele
            ainda não tem nada. Este mede 5,91:1. De caminho aproxima-o do que o
            `<select>` nativo desenha no dedo, que nunca esbateu o rótulo. */}
        <span className={cn("block truncate", !escolhida && "text-[var(--bo-text-muted)]")}>
          {escolhida ? escolhida.rotulo : valor !== "" ? valor : vazio}
        </span>
      </button>
      {seta}

      {/* ── O FORMULÁRIO À VOLTA ──────────────────────────────────────────────
          Só quando alguém pede `name`, e aí é um `<select>` a sério e não um
          `<input type="hidden">`: um campo escondido não faz validação
          nenhuma, e o `required` é metade do pedido.

          Escondido por `opacity`/`position` e NÃO por `display:none`: um campo
          com `display:none` é barrado da validação de restrições e o `required`
          deixava de valer calado. Fica sem tabulação (`tabIndex={-1}`) e fora
          da árvore de acessibilidade (`aria-hidden`), porque quem fala com o
          leitor de ecrã é o `combobox` aqui em cima — dois nomes para o mesmo
          campo é pior do que nenhum. */}
      {name && (
        <select
          name={name}
          required={required}
          disabled={disabled}
          value={valor}
          onChange={(e) => mudar(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-3 h-px w-px opacity-0"
        >
          {indiceDoValor === -1 && <option value={valor} />}
          {lista.map((o) => (
            <option key={o.valor} value={o.valor} />
          ))}
        </select>
      )}

      {(aberto || aSair) && (
        <div
          ref={listaRef}
          id={idLista}
          // Só depois de medida: antes disso vale o tecto da classe, que é o
          // que permite MEDIR a altura que ela queria ter.
          style={encaixe ? { maxHeight: encaixe.alturaMax } : undefined}
          /* A SAIR, ISTO JÁ NÃO É UMA LISTA. Fica montada os 200 ms para ter o
             que animar, mas para quem ouve o ecrã a escolha acabou no instante
             do gesto: sem `role`, sem nome, e fora do fio do teclado. */
          role={aSair ? undefined : "listbox"}
          aria-label={aSair ? undefined : aria["aria-label"]}
          aria-labelledby={aSair ? undefined : aria["aria-labelledby"]}
          aria-hidden={aSair || undefined}
          inert={aSair}
          className={cn(
            "absolute left-0 z-30 max-h-72 min-w-full overflow-y-auto overscroll-contain",
            /* ── O MATERIAL ────────────────────────────────────────────────
               Era `rounded-xl border … bg-[var(--bo-surface)]`, e o
               `rounded-xl` não valia os 12 px que o nome promete: o bloco dos
               raios do `globals.css` colapsa a escala do Tailwind toda em 8 px
               para o CONTEÚDO. Esta lista tinha, medida, os mesmos cantos de um
               campo de texto.

               A `.bo-material` vive fora de camadas de propósito e escapa a
               esse colapso: traz o raio de 12 px, o fio e a superfície
               translúcida. O desfoque vem numa classe à parte, para se poder
               baixar num sítio só — a razão está por extenso no `globals.css`,
               e a conta do contraste também. */
            "bo-material bo-material-desfoque shadow-[var(--bo-sombra-suspensa)]",
            /* A FOLGA QUE FAZ DA PASTILHA UMA PASTILHA. Era `py-1`, ou seja
               folga em cima e em baixo e ZERO aos lados: uma linha realçada só
               podia ser uma faixa de bordo a bordo. Com folga nos quatro lados
               o realce ganha forma própria — que é o que as capturas mostram —
               e o raio dele é o desta moldura menos esta folga, escrito como
               `calc()` no token para os dois não se descolarem. */
            "p-[var(--bo-material-folga)]",
            encaixe?.acima ? "bottom-full mb-1" : "top-full mt-1",
            // 4 px e a curva de quem chega: isto é um item de menu, e é essa a
            // distância que a casa mediu para um. A saída é a mesma palavra ao
            // contrário, e larga os toques dentro da própria classe.
            aSair ? SAIDA : "bo-entrada",
          )}
        >
          {blocos.map((b, n) => {
            const linhas = b.itens.map(({ o, i }) => (
              <div
                key={o.valor}
                id={`${idLista}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.valor === valor}
                aria-disabled={o.desactivada || undefined}
                // O foco NÃO passa para cá: sem isto, carregar numa opção
                // tirava-o do botão e a devolução passava a ser um remendo.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => escolher(i)}
                onPointerMove={() => !o.desactivada && setActiva(i)}
                className={cn(
                  "alvo-toque flex w-full cursor-default items-center gap-2 px-2.5 py-2 text-left text-sm",
                  // O raio da pastilha = o da moldura menos a folga. Ver o token.
                  "rounded-[var(--bo-material-raio-pastilha)]",
                  ESTADO,
                  // O MESMO gesto do botão que abre esta lista. Sem ele, o
                  // comando afundava e a opção — que é onde a escolha acontece
                  // de facto — respondia só com tinta.
                  !o.desactivada && PRESSAO,
                  o.desactivada
                    ? "cursor-not-allowed opacity-40"
                    : i === activa
                      ? /* ── A LINHA ESCOLHIDA É UMA PASTILHA CHEIA ──────────
                           Era `bg-[var(--bo-tinta-10)]`: dez por cento de preto,
                           uma faixa cinzenta de bordo a bordo. Numa lista de
                           doze linhas sobre um material translúcido, dez por
                           cento não é «esta» — é «esta talvez».

                           Passa a ser preenchimento de acento com texto
                           invertido, que é o gesto das capturas. Medido: branco
                           sobre `--bo-accent` dá 6,55:1 (AA pede 4,5:1), e o
                           acento é OPACO de propósito — a 80% sobre o material
                           mais escuro que este ecrã permite caía para 4,65:1,
                           que passa por pouco e não tem margem para o dia em
                           que alguém mexa no verde. */
                        "bg-[var(--bo-accent)] text-white"
                      : "text-[var(--bo-tinta-72)]",
                )}
              >
                {/* ── O VISTO, NUMA COLUNA COM LARGURA FIXA ─────────────────
                    A escolha não se diz só pela tinta: há um visto, como na
                    lista aberta da captura. A largura é o token da coluna e não
                    um `w-3` à mão — é a MESMA coluna dos ícones dos menus, e é
                    o que mantém os rótulos todos a começar no mesmo sítio.

                    Sobre a pastilha cheia o visto passa a branco: um verde
                    sobre verde não se lê, e é o erro mais fácil de cometer ao
                    trocar um realce cinzento por um preenchido.

                    ── E FORA DA PASTILHA É TINTA, E NÃO VERDE ────────────────
                    Era `--bo-accent`. Um verde escuro sobre um material que
                    escurece com o que está por baixo mede muito pior do que um
                    cinzento: no material mais escuro que este ecrã permite
                    (branco a α sobre uma fotografia preta) o acento dava 4,08:1
                    a 0,80 de opacidade e CHUMBAVA os 4,5:1 — era ele, e não a
                    tinta, o que travava o material em 0,84.

                    Passa a `--bo-text` (tinta-82), que mede 8,29:1 no mesmo
                    sítio. E não é uma cedência: nos menus do macOS destas
                    capturas o visto é da cor do RÓTULO — o acento é o que
                    preenche a linha realçada, que é exactamente o que a
                    pastilha aqui em cima faz. A conta está por extenso no
                    `globals.css` e medida no
                    `material-do-que-aparece-por-cima.test.ts`. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-[var(--bo-material-coluna)] shrink-0 text-center",
                    i === activa && !o.desactivada ? "text-white" : "text-[var(--bo-text)]",
                  )}
                >
                  {o.valor === valor ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
              </div>
            ));
            if (!b.grupo) return <Fragment key={`b${n}`}>{linhas}</Fragment>;
            return (
              <div key={`b${n}`} role="group" aria-label={b.grupo}>
                {/* `aria-hidden`: o nome do grupo já é dito pelo `aria-label`
                    do `role="group"`. Sem isto era lido duas vezes.

                    O `text-foreground/45` que aqui estava era tinta MORTA — a
                    `.bo-eyebrow` vive fora de camadas e já lhe ganhava — e era
                    tinta que chumbava: 3,11:1 sobre branco. Sai, e fica o 0,64
                    da `.bo-eyebrow`, que mede 5,32:1 sobre o pior material.
                    O `px` acompanha a folga nova da moldura para o nome do
                    grupo ficar alinhado com o rótulo das opções. */}
                <div aria-hidden="true" className="bo-eyebrow px-2.5 pb-1 pt-2">
                  {b.grupo}
                </div>
                {linhas}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
