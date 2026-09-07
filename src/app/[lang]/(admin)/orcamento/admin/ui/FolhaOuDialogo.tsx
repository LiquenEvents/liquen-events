"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useCamadaDeHistoria } from "../useCamadaDeHistoria";
import { useFocusTrap } from "../useFocusTrap";
import { useTrincoDeScroll } from "../useTrincoDeScroll";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";
import { SAIDA, SAIDA_FOLHA, SAIDA_FUNDO, SAIDA_MS, useSaidaAdiada } from "./saida";

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

/**
 * A chave da saída. O `useSaidaAdiada` é indexado por chave porque nasceu numa
 * PILHA (a dos avisos), onde há vários nós a sair ao mesmo tempo e cada um com
 * o seu relógio. Aqui há um nó só, portanto a chave é uma constante e o resto
 * ignora-se — está escrito no contrato do hook.
 */
const CHAVE = "caixa";

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

  /* ══════════════════════════════════════════════════════════════════════════
     E A CAIXA TAMBÉM SAI — a outra metade do gesto
     ══════════════════════════════════════════════════════════════════════════

     Isto entrava com a `.bo-entrada` e fechava A SECO: o pai punha o `aberto` a
     falso, o nó desaparecia no fotograma seguinte e o ecrã voltava. Meio gesto,
     e repetido em seis diálogos — é esta a porta por onde passam a
     `PerguntaDestrutiva`, o `NewQuoteModal`, o `ShortcutsModal`, o
     `PasskeysDialog`, o `ThemeCopyDialog` e o editor de e-mail.

     ── PORQUE É QUE QUEM SEGURA O NÓ É ESTE COMPONENTE, E NÃO QUEM CHAMA ────

     Porque o `onFechar` NÃO se atrasa. Ele continua a ser chamado no instante
     do gesto — o pai fecha o que tem a fechar, a página destranca-se, o foco
     volta ao botão que abriu isto, o trinco de scroll larga e a entrada de
     história é retirada, tudo já. O que fica cá é uma IMAGEM a apagar-se, 200
     ms, sem nome acessível, sem foco e sem apanhar um único toque. Uma saída
     que adiasse o `onFechar` era uma animação a atrasar uma tarefa, que é a
     única coisa que esta casa não deixa fazer a nenhuma.

     Ou seja: o gatilho é a prop `aberto` a passar de verdadeira a falsa, seja
     lá o que a fizer passar — o «×», o Escape, o fundo, o arrasto, o gesto de
     voltar, ou o pai a fechar sozinho quando a operação acaba.

     ── AJUSTADO DURANTE O DESENHO, E NÃO NUM EFEITO ─────────────────────────

     Um `useEffect` corria DEPOIS de o React já ter desenhado o `return null`:
     o nó era arrancado do DOM e o efeito montava um nó NOVO no lugar dele. Um
     nó novo é um remonte — perde a posição do scroll de dentro da caixa, e uma
     caixa a sair com o conteúdo saltado para o topo lê-se como outra caixa.
     Este é o padrão do React para reagir a uma prop: ajusta-se o estado no
     desenho, ele re-desenha sem pintar nada pelo meio, e o nó é o MESMO.

     Com `prefers-reduced-motion` nada disto acontece: o `comecarSaida` chama o
     fim no próprio instante e a caixa desaparece como sempre desapareceu. Quem
     pediu menos movimento não espera 200 ms por uma caixa a apagar-se por cima
     do botão em que quer carregar. */
  /* ── O ARRASTO COM QUE A FOLHA SE FOI EMBORA ────────────────────────────
     A pega põe o arrasto a zero ao largar, SEMPRE — é o que faz a folha voltar
     ao sítio quando o gesto não pega (o `bloqueado` recusa o fecho, e há quem
     passe um `onFechar` que não faz nada enquanto uma operação corre). O que
     interessa guardar é outra coisa: quanto é que ela tinha andado quando o
     dedo largou, para poder sair DE LÁ e não de zero.

     Passa por uma referência e não por estado porque tem de ser lida no MESMO
     lote de renderizações em que a prop `aberto` cai — e é logo a seguir
     copiada para estado, que é o que dura os 200 ms da saída. */
  const arrastoAoLargar = useRef(0);
  const [arrastoDeSaida, setArrastoDeSaida] = useState(0);

  /* E a referência vale para UM commit, o que vem logo a seguir ao dedo. Sem
     esta linha, um gesto que pediu para fechar e não fechou deixava lá 200 px
     à espera — e o fecho seguinte, esse pelo botão, saía a deslizar de uma
     distância que ninguém tinha arrastado. */
  useEffect(() => {
    arrastoAoLargar.current = 0;
  });

  const { aSair, comecarSaida } = useSaidaAdiada(() => {
    // Acabada a saída, esquece-se o arrasto com que ela se foi embora.
    setArrastoDeSaida(0);
  });
  // `!aberto` na conta, e não só a marca: se o pai voltar a abrir isto a meio
  // da saída, quem manda é a prop — a caixa volta a entrar em vez de continuar
  // a apagar-se com o relógio antigo.
  const aSairAgora = !aberto && aSair.includes(CHAVE);

  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (abertoAntes !== aberto) {
    setAbertoAntes(aberto);
    if (!aberto) {
      setArrastoDeSaida(arrastoAoLargar.current);
      comecarSaida(CHAVE);
    }
  }

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

  // Enquanto a saída corre o nó fica montado, e é a única coisa que o segura:
  // o `aberto` já é falso e o `aSairAgora` cai sozinho ao fim dos 200 ms.
  if (!aberto && !aSairAgora) return null;

  // Antes de montar não sabemos a largura real. Desenha-se a FOLHA, que é o
  // formato mais simples e o que menos estranha se aparecer por um instante num
  // ecrã grande — o contrário (um diálogo centrado a saltar para folha) vê-se.
  const comoFolha = telemovel || !montado;

  /* A folha foi-se embora A MEIO DE UM ARRASTO — o dedo largou-a a 90 px do
     sítio e ela sai de lá, e não de zero. É o único caso em que a saída não
     pode ser a animação da casa; a razão está escrita no `style` da caixa. */
  const folhaArrastada = aSairAgora && comoFolha && arrastoDeSaida > 0;

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
      /* ── E É AQUI QUE A CAIXA A SAIR DEIXA DE APANHAR O TOQUE ────────────
         A `.bo-saida` larga os `pointer-events` dentro da própria classe, mas
         quem cobre o ecrã inteiro é ESTA moldura, e ela não leva classe
         nenhuma. Sem esta linha, uma caixa a desvanecer-se continuava a comer
         os toques do que está por baixo durante 200 ms: a pessoa carrega, não
         acontece nada, e não há sinal nenhum de porquê. É o defeito mais caro
         que uma saída pode trazer, e o teste que o guarda não avança um único
         milissegundo depois do gesto. */
      className={cn("fixed inset-0 flex", aSairAgora && "pointer-events-none")}
      style={{ zIndex: nivel }}
      role="presentation"
      // O fundo fecha — mas só quando o toque COMEÇOU nele. Sem esta condição,
      // arrastar de dentro para fora (a seleccionar texto, por exemplo) fechava
      // a caixa e perdia-se o que lá estava escrito.
      onMouseDown={
        aSairAgora
          ? undefined
          : (e) => {
              if (e.target === e.currentTarget) pedirFecho();
            }
      }
    >
      {/* ── O VÉU ACENDE COM A CAIXA E APAGA-SE COM ELA ──────────────────
          Zero de deslocação nos dois sentidos, que é o que um fundo pede: não
          vem de sítio nenhum, logo também não vai para sítio nenhum. E o
          `backdrop-filter` fica FORA das duas animações, como manda o
          `globals.css` — um desfoque em transição repinta o ecrã todo a cada
          fotograma.

          ── E PORQUE É QUE SÃO DOIS RAMOS E NÃO UM `cn()` ──────────────────
          Porque a varredura dos véus (`entrada-dos-fundos.test.ts`) LÊ o
          ficheiro em vez de o correr: procura a lista de classes escrita por
          extenso no atributo, e não sabe ler um `cn(…)` nem um ternário — nem
          sequer salta os comentários, portanto nem isto aqui lhe pode ter a
          forma de um. Um véu embrulhado ficava invisível para ela, e no dia em
          que alguém lhe tirasse a entrada ninguém dava por isso. O véu ABERTO
          fica portanto por extenso, e é o ramo da saída que leva o `cn`.

          São dois ramos, mas não são dois nós: mesmo tipo e mesma posição, o
          React reaproveita o elemento e troca-lhe as classes — a saída parte
          da opacidade em que o véu está, e não de um nó novo. */}
      {aSairAgora ? (
        <div
          className={cn(SAIDA_FUNDO, "absolute inset-0 bg-[#1b2119]/40 backdrop-blur-[2px]")}
          aria-hidden
        />
      ) : (
        <div
          className="bo-entrada bo-entrada-fundo absolute inset-0 bg-[#1b2119]/40 backdrop-blur-[2px]"
          aria-hidden
        />
      )}

      <div
        ref={caixaRef}
        /* ── A CAIXA A SAIR JÁ NÃO É UMA CAIXA ──────────────────────────
           Enquanto se apaga não tem `role`, não tem nome e não está no fio
           do teclado: para quem ouve o ecrã e para quem anda de Tab, isto
           acabou no instante do gesto — e acabou mesmo, porque o `onFechar`
           já correu e o foco já voltou ao botão que a abriu. O que fica é
           uma imagem. Deixá-la anunciada seria pior do que não animar
           nada: um diálogo que ainda se ouve por cima do ecrã a que se
           acabou de voltar. */
        role={aSairAgora ? undefined : "dialog"}
        aria-modal={aSairAgora ? undefined : "true"}
        // O nome vem do que está ESCRITO no cabeçalho, e não de uma cópia
        // paralela numa `aria-label`: com sobretítulo são as duas linhas, que
        // na leitura são uma frase só («Juntar “Itália” a 312 fotos»).
        aria-labelledby={
          aSairAgora ? undefined : sobretitulo ? `${idTitulo}-sobre ${idTitulo}` : idTitulo
        }
        aria-hidden={aSairAgora || undefined}
        inert={aSairAgora}
        style={
          folhaArrastada
            ? {
                /* ── A FOLHA SAI DE ONDE O DEDO A DEIXOU ──────────────────
                   Aqui a `.bo-saida` não serve, e a razão é mecânica: os
                   fotogramas dela partem de `translateY(0)`, e uma animação
                   ganha ao `transform` que o arrasto escreve no `style`. Uma
                   folha puxada 90 px para baixo saltava de volta ao sítio
                   ANTES de sair — o gesto lido ao contrário, no fotograma em
                   que a pessoa levanta o dedo.

                   Uma TRANSIÇÃO não tem esse problema: parte do valor que o
                   elemento tem agora, que é exactamente onde o dedo o
                   deixou. Os números continuam a ser os da casa e não são
                   copiados — a duração é o `SAIDA_MS`, a curva é a
                   `--ease-in` da saída, e a distância é o `--bo-saida-y` que
                   a `.bo-saida-folha` (posta aqui só pela variável) declara
                   em 8 px. É o «`--bo-saida-y` calculado»: o arrasto mais a
                   distância da casa, somados no próprio CSS. */
                transform: `translateY(calc(${arrastoDeSaida}px + var(--bo-saida-y)))`,
                opacity: 0,
                transition: `transform ${SAIDA_MS}ms var(--ease-in), opacity ${SAIDA_MS}ms var(--ease-in)`,
              }
            : comoFolha && arrasto
              ? { transform: `translateY(${arrasto}px)` }
              : undefined
        }
        className={cn(
          /* ── ONDE O MATERIAL PÁRA, E PORQUÊ ──────────────────────────────
             A família do que aparece por cima — menus, listas, notas, painéis —
             passou toda a material translúcido com desfoque. Estas duas não, e
             é uma recusa e não um esquecimento:

              1. **Uma folha ocupa 390×743 no telemóvel dela.** Um
                 `backdrop-filter` é trabalho de composição por fotograma sobre
                 a área que cobre, e esta cobre o ecrã quase todo. É o oposto do
                 que este ficheiro promete no telemóvel, e o véu que já está por
                 baixo tem o seu próprio desfoque — seriam dois, sobrepostos.
              2. **Uma caixa que existe para TAPAR a página não pode deixá-la
                 passar.** Um menu translúcido diz «isto é uma camada por cima
                 do teu trabalho»; um diálogo translúcido diz «não sei bem se
                 estou aqui». São mensagens contrárias, e a segunda está errada.

             O que ELAS levam do material é a geometria: o degrau GRANDE do raio
             (18 px, aqui em baixo) e a sombra modal, que já era larga. A
             superfície continua opaca. */
          "relative z-10 flex flex-col overflow-hidden bg-[var(--bo-surface,#ffffff)] shadow-[var(--bo-sombra-modal)]",
          // ── DE ONDE ELA VEM, E PARA ONDE VAI ───────────────────────────
          // A folha sobe (8 px), o diálogo desce (4 px): cada um vem do lado
          // onde vai ficar — e sai pelo mesmo, que é o que impede que se leia
          // como dois elementos diferentes. A entrada não tem `fill-mode`,
          // portanto larga o elemento ao fim dos 240 ms e NÃO fica a disputar
          // o `transform` que o arrasto da folha escreve em `style`; a saída
          // tem `forwards`, e a rede dela é o nó deixar de existir no
          // fotograma a seguir aos 200 ms (senão ficava um `transform`
          // pendurado a criar bloco de contenção).
          aSairAgora
            ? folhaArrastada
              ? // Só a VARIANTE, sem a `.bo-saida`: aqui quem move é a
                // transição do `style` aqui em cima, e o que se aproveita da
                // classe é os 8 px de `--bo-saida-y`. O largar dos toques
                // vem da moldura, que já os largou.
                "bo-saida-folha pointer-events-none"
              : comoFolha
                ? SAIDA_FOLHA
                : SAIDA
            : cn("bo-entrada", comoFolha && "bo-entrada-folha"),
          comoFolha
            ? cn(
                // `dvh` e não `vh`: com a barra do browser à vista, `100vh` é
                // maior do que o que se vê, e o rodapé com as acções ficava
                // debaixo dela.
                // `rounded-t-2xl` media 8 px: o bloco dos raios do
                // `globals.css` colapsa a escala do Tailwind toda para o
                // conteúdo, e uma folha do tamanho do ecrã com os cantos de um
                // campo de texto é exactamente o que as capturas não têm.
                "mt-auto w-full rounded-t-[var(--bo-material-raio-grande)]",
                folhaAlta ? "h-[92dvh]" : "max-h-[88dvh]",
              )
            : cn(
                // Ver a nota da folha aqui em cima: 8 px medidos, 18 px pedidos.
                "m-auto w-full rounded-[var(--bo-material-raio-grande)]",
                LARGURAS[largura],
                "max-h-[85dvh]",
              ),
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
              // Quanto é que ela tinha andado quando o dedo largou. Se este
              // gesto fechar mesmo a folha, é daqui que ela sai — e se não
              // fechar, a linha de baixo põe-na no sítio como sempre pôs.
              arrastoAoLargar.current = passou ? arrasto : 0;
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
            `alvo-toque absolute right-2 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)] disabled:opacity-40 ${ESTADO} ${PRESSAO}`,
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
