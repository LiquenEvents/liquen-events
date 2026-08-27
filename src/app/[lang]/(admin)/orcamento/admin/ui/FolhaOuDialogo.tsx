"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useCamadaDeHistoria } from "../useCamadaDeHistoria";
import { useFocusTrap } from "../useFocusTrap";
import { useTrincoDeScroll } from "../useTrincoDeScroll";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * UMA CAIXA QUE MUDA DE FORMA — diálogo centrado no computador, folha inferior
 * arrastável no telemóvel.
 *
 * ── Porque é que não é o mesmo modal a encolher ─────────────────────────────
 * Um diálogo centrado num ecrã de 375 px é uma caixa a flutuar com margens
 * inúteis dos dois lados, com o botão de fechar no canto superior direito — o
 * ponto mais longe do polegar de quem segura o telemóvel com uma mão. A folha
 * inferior resolve as duas coisas: usa a largura toda e as acções ficam em
 * baixo, onde o polegar está. E fecha-se com um gesto para baixo, que é o gesto
 * que o sistema já ensinou a toda a gente.
 *
 * ── O que é IGUAL nos dois, e não é por acaso ───────────────────────────────
 * A armadilha de foco, o Escape, o bloqueio do scroll de fundo e o `aria-modal`.
 * A forma muda; o contrato de acessibilidade não. Ter duas implementações a
 * sério significaria duas maneiras de esquecer uma delas.
 */

export interface FolhaOuDialogoProps {
  aberto: boolean;
  onFechar: () => void;
  /** Título — obrigatório. É ele, mais o `sobretitulo` se houver, que dá o
   *  nome acessível da caixa. */
  titulo: string;
  /** A linha pequena POR CIMA do título (`bo-eyebrow`), quando o título sozinho
   *  não diz de que trabalho se trata: «Juntar “Itália” a» + «312 fotos». Entra
   *  no nome acessível junto com o título, porque na leitura é uma frase só. */
  sobretitulo?: string;
  /** Uma linha por baixo do título. */
  descricao?: string;
  children: ReactNode;
  /** Acções principais. No telemóvel ficam coladas em baixo, ao alcance do
   *  polegar; no computador, no rodapé do diálogo. */
  accoes?: ReactNode;
  /** Largura máxima do DIÁLOGO (não afecta a folha, que usa o ecrã todo). */
  largura?: "sm" | "md" | "lg" | "largo";
  /** A folha ocupa quase o ecrã todo — para grelhas de fotos, onde ver muito é
   *  o objectivo. Sem isto ajusta-se ao conteúdo. */
  folhaAlta?: boolean;
  /**
   * O CONTEÚDO TRATA DA SUA PRÓPRIA MOLDURA E DO SEU PRÓPRIO SCROLL.
   *
   * Por omissão os `children` vêm embrulhados num `px-5 py-4` que rola inteiro,
   * e é o que serve a um formulário. Não serve a uma caixa de DUAS COLUNAS com
   * scroll próprio em cada uma — o seletor de fotos: lá, quem rola é a GRELHA,
   * e a coluna dos temas ao lado tem o seu scroll e fica quieta. Com a moldura
   * por omissão eram três defeitos de uma vez: a caixa inteira passava a rolar
   * (a coluna dos temas ia atrás das fotos), as duas colunas deixavam de poder
   * colar-se às arestas, e as fotos perdiam 40 px de cada lado por cima dos 20
   * que a grelha já se dá a si própria.
   *
   * Com isto ligado o invólucro fica só com o que faz falta para o filho poder
   * pedir a altura (`flex min-h-0 flex-1 flex-col`): nem padding, nem scroll.
   * Quem liga isto passa a ser responsável por pôr um `overflow-y-auto` algures
   * lá dentro — senão o conteúdo é cortado em silêncio.
   */
  corpoProprio?: boolean;
  /**
   * O RODAPÉ PARTE EM LINHAS QUANDO NÃO CABE.
   *
   * Por omissão as acções são uma fila só, porque é o que dois ou três botões
   * são. Um rodapé que tenha mais do que botões — uma contagem viva («4 fotos
   * selecionadas»), um aviso de teto — não cabe numa fila a 375 px: MEDIDO,
   * a contagem ficava reduzida a uma palavra cortada a meio porque os botões
   * não encolhem e o texto sim.
   *
   * Isto não decide onde é que a linha parte: quem chama diz qual dos blocos
   * toma a linha toda (`basis-full`). Aqui só se dá licença para partir.
   */
  accoesQuebram?: boolean;
  /**
   * ENQUANTO ISTO FOR VERDADE, ISTO NÃO SE FECHA SEM SE DIZER QUE SIM.
   *
   * A regra da casa é «se falhar, não perder trabalho». Uma fusão de temas ou
   * uma cópia de 300 fotos correm em voltas de rede, e fechar a meio deixa o
   * trabalho pelo meio — por isso o fundo, o Escape, o arrasto para baixo e o
   * gesto de voltar deixam de fechar, e o «×» fica desactivado como já ficava
   * nos diálogos escritos à mão que isto substitui.
   *
   * NÃO é uma prisão, e quem chama responde por isso: ou a operação acaba
   * sempre sozinha (um registo de passkey), ou há uma saída nas `accoes` (o
   * botão «Parar» das duas operações por lotes). Sem uma das duas isto era uma
   * barreira — e barreiras têm outro sítio: o `SessaoExpirada`, que existe
   * precisamente para não ter saída nenhuma.
   */
  bloqueado?: boolean;
  /**
   * Em que nível se empilha (z-index). Omitido, 50 — o mesmo do resto.
   *
   * Existe porque as camadas desta casa já estão ordenadas entre si e a ordem
   * importa: os avisos passageiros estão a 80, a paleta de comandos a 90, a
   * barreira da sessão expirada a 110, e a gaveta do pedido a 50 mas DEPOIS
   * destes diálogos na árvore — com o mesmo nível, é ela que fica por cima e o
   * diálogo desaparece por trás dela. Quem sobe acima de 50 diz porquê no
   * sítio onde o faz.
   */
  nivel?: number;
}

/**
 * As larguras do DIÁLOGO. Os três primeiros degraus são um valor só; o quarto
 * são dois, e a razão é geométrica.
 *
 * `largo` é para uma caixa com COLUNA LATERAL. A partir de `lg` a lista de
 * temas ocupa 14 rem fixas — num diálogo de `lg` (56 rem) sobravam 42 rem para
 * a grelha de fotos, ou seja a coluna comia um quarto da caixa. Às 70 rem a
 * coluna leva 20% e a grelha fica com 80%, que é a proporção pedida. Abaixo de
 * `lg` não há coluna nenhuma (os temas são uma fila por cima) e a caixa volta
 * às 48 rem, que é o que cabe num iPad ao alto sem margens absurdas.
 */
const LARGURAS = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  largo: "max-w-3xl lg:max-w-[70rem]",
} as const;

/** Distância, em píxeis, a partir da qual o arrasto para baixo fecha a folha.
 *  Curto de mais fecha sozinho ao rolar; longo de mais parece que não responde. */
const FECHAR_A_PARTIR_DE = 80;

export function FolhaOuDialogo({
  aberto,
  onFechar,
  titulo,
  sobretitulo,
  descricao,
  children,
  accoes,
  largura = "md",
  folhaAlta = false,
  corpoProprio = false,
  accoesQuebram = false,
  bloqueado = false,
  nivel = 50,
}: FolhaOuDialogoProps) {
  const { telemovel, montado } = useAdaptativo();
  // Trava o scroll do fundo enquanto está aberto. Sem isto, arrastar dentro da
  // folha faz a página lá atrás andar — e ao fechar já não se está onde se
  // estava. O trinco é partilhado com os outros diálogos (e conta-se, para uma
  // folha aberta por cima de um diálogo não destrancar o de baixo ao fechar);
  // vem ANTES da armadilha de foco para o foco a entrar não rolar a página.
  useTrincoDeScroll(aberto);
  /* AS QUATRO SAÍDAS DE ATALHO PASSAM TODAS POR AQUI — fundo, Escape, arrasto
     e o gesto de voltar. Um sítio só de propósito: com o `bloqueado` espalhado
     por quatro `if`, esquecer um deles não dá erro nenhum — dá uma fusão de
     temas interrompida a meio, uma vez em cada dez. */
  const pedirFecho = () => {
    if (!bloqueado) onFechar();
  };
  /* ── O GESTO DE VOLTAR FECHA ISTO, E NÃO O BACK OFFICE ─────────────────────
     Num iPhone, deslizar da esquerda É o botão de voltar, e faz-se sem pensar —
     numa quinta, com o telemóvel numa mão e uma caixa de flores na outra,
     faz-se por acidente. Sem uma entrada na história, o Safari saía da
     aplicação e levava com ele o que estivesse escrito aqui dentro.

     Ao pé do Escape de propósito: é a mesma promessa, no gesto que o telemóvel
     tem em vez do teclado que não tem. Ver `useCamadaDeHistoria`. */
  useCamadaDeHistoria(aberto, pedirFecho);
  const caixaRef = useFocusTrap<HTMLDivElement>(aberto);
  const [arrasto, setArrasto] = useState(0);
  const inicioY = useRef<number | null>(null);
  const idTitulo = useId();

  // Escape fecha, nos dois formatos. Um `keydown` no documento e não no
  // elemento: o foco pode estar num campo lá dentro.
  useEffect(() => {
    if (!aberto || bloqueado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, bloqueado, onFechar]);

  // Cada abertura começa sem arrasto acumulado: sem isto, uma folha fechada a
  // meio de um gesto reabria já puxada para baixo.
  useEffect(() => {
    if (aberto) setArrasto(0);
  }, [aberto]);

  if (!aberto) return null;

  // Antes de montar não sabemos a largura real. Desenha-se a FOLHA, que é o
  // formato mais simples e o que menos estranha se aparecer por um instante num
  // ecrã grande — o contrário (um diálogo centrado a saltar para folha) vê-se.
  const comoFolha = telemovel || !montado;

  const cabecalho = (
    // `pr-14` e não `pr-5`: o «×» é um alvo de 44 px encostado à direita, e sem
    // esta folga um título longo passava-lhe por baixo.
    <div className="px-5 pt-4 pr-14">
      {sobretitulo && (
        <p id={`${idTitulo}-sobre`} className="bo-eyebrow">
          {sobretitulo}
        </p>
      )}
      <h2 id={idTitulo} className="font-display text-lg text-[var(--bo-text)]">
        {titulo}
      </h2>
      {descricao && <p className="bo-text-muted mt-1 text-sm">{descricao}</p>}
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex"
      style={{ zIndex: nivel }}
      role="presentation"
      // O fundo fecha — mas só quando o toque COMEÇOU nele. Sem esta condição,
      // arrastar de dentro para fora (a seleccionar texto, por exemplo) fechava
      // a caixa e perdia-se o que lá estava escrito.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) pedirFecho();
      }}
    >
      <div className="absolute inset-0 bg-[#1b2119]/40 backdrop-blur-[2px]" aria-hidden />

      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        // O nome vem do que está ESCRITO no cabeçalho, e não de uma cópia
        // paralela numa `aria-label`: com sobretítulo são as duas linhas, que
        // na leitura são uma frase só («Juntar “Itália” a 312 fotos»).
        aria-labelledby={sobretitulo ? `${idTitulo}-sobre ${idTitulo}` : idTitulo}
        style={comoFolha && arrasto ? { transform: `translateY(${arrasto}px)` } : undefined}
        className={cn(
          "relative z-10 flex flex-col overflow-hidden bg-[var(--bo-surface,#ffffff)] shadow-[var(--bo-sombra-modal)]",
          // ── DE ONDE ELA VEM ────────────────────────────────────────────
          // A folha sobe (8 px), o diálogo desce (4 px): cada um vem do lado
          // onde vai ficar. A animação não tem `fill-mode`, portanto larga o
          // elemento ao fim dos 240 ms e NÃO fica a disputar o `transform`
          // que o arrasto da folha escreve em `style` — e o arrasto só começa
          // depois de a folha estar parada.
          "bo-entrada",
          comoFolha
            ? cn(
                "bo-entrada-folha",
                // `dvh` e não `vh`: com a barra do browser à vista, `100vh` é
                // maior do que o que se vê, e o rodapé com as acções ficava
                // debaixo dela.
                "mt-auto w-full rounded-t-2xl",
                folhaAlta ? "h-[92dvh]" : "max-h-[88dvh]",
              )
            : cn("m-auto w-full rounded-2xl", LARGURAS[largura], "max-h-[85dvh]"),
        )}
      >
        {comoFolha && (
          // A pega. É ela que diz, sem palavras, que isto se arrasta — e é
          // deliberadamente um alvo grande: o gesto começa aqui, não no
          // conteúdo, senão competia com o scroll da lista lá dentro.
          <div
            className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center"
            onPointerDown={(e) => {
              inicioY.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (inicioY.current === null) return;
              // Só para BAIXO: puxar para cima não faz nada, em vez de
              // descolar a folha do fundo do ecrã.
              setArrasto(Math.max(0, e.clientY - inicioY.current));
            }}
            onPointerUp={() => {
              const passou = arrasto > FECHAR_A_PARTIR_DE;
              inicioY.current = null;
              setArrasto(0);
              if (passou) pedirFecho();
            }}
            onPointerCancel={() => {
              inicioY.current = null;
              setArrasto(0);
            }}
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-foreground/20" />
          </div>
        )}

        {cabecalho}

        <div
          className={cn(
            "min-h-0 flex-1",
            corpoProprio
              ? // Só o que faz falta para o filho poder pedir a altura. Ver
                // `corpoProprio`: o scroll e a margem passam a ser dele.
                "flex flex-col"
              : "overflow-y-auto overscroll-contain px-5 py-4",
          )}
        >
          {children}
        </div>

        {accoes && (
          <div
            className={cn(
              "flex shrink-0 gap-2 border-t border-[var(--bo-hairline)] px-5 py-3",
              // Ver `accoesQuebram`: a fila parte, e o que estiver marcado com
              // `basis-full` toma a linha toda. `items-center` porque uma
              // contagem de duas linhas ao lado de um botão fica torta sem ele.
              accoesQuebram && "flex-wrap items-center",
              // No telemóvel as acções encostam ao fundo e respeitam a área
              // segura do iPhone; no computador vão para a direita, como num
              // diálogo de sempre.
              comoFolha ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "justify-end",
            )}
          >
            {accoes}
          </div>
        )}

        {/* Fechar por botão existe SEMPRE. O gesto é um atalho, não a única
            saída: quem usa leitor de ecrã ou teclado não arrasta nada. A
            excepção é `bloqueado`, e aí a saída é o «Parar» das acções. */}
        <button
          type="button"
          onClick={onFechar}
          disabled={bloqueado}
          aria-label="Fechar"
          className={cn(
            // Este fechar não tinha transição NENHUMA — o hover entrava e saía
            // a zero, um corte seco. É o mesmo defeito que os 20 ms tratam no
            // carregar, só que no passar do rato.
            `alvo-toque absolute right-2 flex h-11 w-11 items-center justify-center rounded-lg text-foreground/45 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)] disabled:opacity-40 ${ESTADO} ${PRESSAO}`,
            comoFolha ? "top-8" : "top-2",
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
