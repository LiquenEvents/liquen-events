"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdaptativo } from "./adaptativo";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";
import { semMovimento } from "./saida";

/**
 * A MESMA LISTA EM DUAS FORMAS — tabela densa no computador, cartões no
 * telemóvel.
 *
 * ── Porque é que uma tabela encolhida não serve ─────────────────────────────
 * Uma tabela de seis colunas a 375 px ou ganha scroll horizontal (e metade da
 * informação fica escondida atrás de um gesto que ninguém descobre) ou aperta as
 * colunas até o texto partir em três linhas. Nos dois casos deixa de se poder
 * varrer a lista com os olhos, que é a única coisa que uma tabela faz bem.
 *
 * Um cartão por linha resolve-o, mas só se escolher o que mostrar. Por isso o
 * cartão NÃO é gerado a partir das colunas: é escrito à mão por quem conhece o
 * ecrã, e mostra as quatro coisas que interessam em vez das dez que a tabela
 * mostra. É a diferença entre adaptar e converter.
 *
 * ── O que é partilhado ──────────────────────────────────────────────────────
 * Os DADOS e a ORDEM. A ordenação, a selecção e o que está filtrado vivem aqui,
 * uma vez, e as duas formas leem o mesmo. Nenhuma regra de negócio entra neste
 * ficheiro.
 */

export interface Coluna<T> {
  /** Identificador estável — é por ele que a ordenação se lembra da escolha. */
  chave: string;
  cabecalho: string;
  celula: (item: T) => ReactNode;
  /** Comparador. Sem ele, a coluna não é ordenável (e não finge que é). */
  ordenar?: (a: T, b: T) => number;
  /** Colunas de contexto que só aparecem quando há mesmo espaço (≥1440). É
   *  assim que se ganha densidade no ecrã grande sem apertar o médio. */
  soLargo?: boolean;
  alinharADireita?: boolean;
  /** Largura fixa (classe do Tailwind), para colunas de números ou de ícones. */
  largura?: string;
}

export interface TabelaOuCartoesProps<T> {
  itens: readonly T[];
  chaveDe: (item: T) => string;
  colunas: readonly Coluna<T>[];
  /** O cartão do telemóvel. Escrito à mão de propósito — ver acima. */
  cartao: (item: T) => ReactNode;
  /** Abrir a linha/cartão. Quando existe, a linha inteira é tocável. */
  aoAbrir?: (item: T) => void;
  /** O que mostrar quando não há nada. */
  vazio?: ReactNode;
  /** Ordenação inicial. */
  ordemInicial?: { chave: string; ascendente: boolean };
  /** Rótulo acessível da tabela. */
  legenda: string;
  /**
   * O cartão já traz a sua própria moldura e o seu próprio botão.
   *
   * Existe para os ecrãs cujo cartão de telemóvel já foi desenhado e auditado —
   * envolvê-lo noutra caixa daria duas bordas e, pior, um botão dentro de outro
   * botão. Nesses casos o `aoAbrir` é ignorado no telemóvel: quem abre é o
   * próprio cartão.
   */
  semMoldura?: boolean;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ENTRADA DO BLOCO — o que se move quando a LISTA passa a ser outra
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta primitiva serve cinco vistas (Pedidos, Propostas, Contratos, Clientes,
 * Inventário). Tudo o que aqui se escreve acontece cinco vezes, e é por isso
 * que o que NÃO se anima está tão contado como o que se anima.
 *
 * ── O DEFEITO ──────────────────────────────────────────────────────────────
 *
 * Carregar num cabeçalho reordena a tabela (`setOrdem`, aqui em baixo). As
 * linhas saltam para a posição nova ENTRE DOIS FOTOGRAMAS: as mesmas dez
 * pessoas, noutra ordem, sem um único sinal de que foi a lista que se
 * reordenou e não o conteúdo que foi substituído. É o caso em que o olho não
 * tem por onde se guiar — e é exactamente para isso que o movimento serve
 * («indica direcção e origem»).
 *
 * ── A PALAVRA É A DA CASA, E NÃO UMA NOVA ─────────────────────────────────
 *
 * `.view-in` — 240 ms, 8 px, `cubic-bezier(0, 0, 0.2, 1)`, e acaba em
 * `transform: none` (o `backwards` do `globals.css` é load-bearing: sem ele
 * ficava um `transform` pendurado a criar containing block, que é como o
 * `.view-in` já partiu uma gaveta `position: fixed` uma vez). A prosa toda
 * está lá; aqui não se declara duração, curva nem distância nenhuma.
 *
 * É a palavra certa porque é literalmente o que se passa: a moldura fica, o
 * conteúdo dentro dela passa a ser outro. `.bo-cena` (600 ms) é a apresentação
 * de um ecrã que chega — e quem apresenta o ecrã já é o ecrã, com o seu
 * `--cena` próprio (ver `Contratos.tsx:366` e `AdminClient.tsx:5432`).
 * Reordenar não é chegar.
 *
 * ── POR BLOCO, NUNCA POR LINHA ─────────────────────────────────────────────
 *
 * A classe entra no `<tbody>` (ou no `<ul>` do telemóvel), UMA vez. Nunca na
 * linha: cinquenta linhas a chegar uma a uma é a lentidão que o tecto do sexto
 * degrau existe para evitar, e está escrito em `EventTasks.tsx:400-402`. Como
 * o `<thead>` fica de fora, o cabeçalho onde se acabou de carregar não se mexe
 * — o que se move é a resposta, não o botão.
 *
 * ── E PORQUE É QUE O FILTRO NÃO ENTRA AQUI ────────────────────────────────
 *
 * O levantamento pedia entrada também «a cada novo filtro». Testei a ideia
 * contra o teclado e não passa: a procura destas cinco vistas é um `<input>`
 * que filtra a cada letra (com `useDeferredValue`, mas à mesma uma vez por
 * tecla assente). A 5 teclas por segundo há uma entrada nova de 240 ms a cada
 * 200 ms — a lista nunca chega à opacidade 1, fica permanentemente a meio e a
 * saltar 8 px enquanto se escreve. Ou seja: a animação torna ilegível
 * exactamente o ecrã que a pessoa está a tentar ler. Isso é movimento a chamar
 * atenção, e é a regra da casa ao contrário.
 *
 * A regra que ficou distingue as duas coisas pelo CONTEÚDO, que é o que esta
 * primitiva consegue ver de dentro:
 *
 *   · **a mesma gente noutra ordem** → animar. Ninguém saiu nem entrou, e sem
 *     movimento não há como saber que foi a ORDEM que mudou.
 *   · **outra gente** (filtrar, procurar) → não animar. A causa está à vista e
 *     é a própria pessoa a escrevê-la; quem fica, fica no sítio.
 *
 * A troca com o ecrã vazio é o terceiro caso e tem regra própria, mais abaixo.
 */
const ENTRADA_DO_BLOCO = "view-in";

/**
 * Volta a correr a entrada do bloco NO MESMO NÓ.
 *
 * A tentação é o `key` — e o `key` REMONTA. Numa lista o `key` é identidade:
 * mexer-lhe para animar deita fora o rolo, a selecção e o foco de quem estava
 * a meio de uma leitura. Aqui não se toca em `key` nenhum; o que se faz é
 * mandar o browser correr outra vez a animação que a classe já descreve.
 *
 * A leitura de `offsetWidth` no meio não é superstição: sem ela, as duas
 * escritas caem no mesmo fotograma, o browser nunca vê o elemento sem a classe
 * e a animação não reinicia. É o único sítio deste ficheiro que força layout, e
 * corre num `useEffect` (depois de pintar) e só quando a ordem mudou mesmo —
 * nunca no caminho de uma tecla.
 *
 * A classe fica no nó depois de acabar, de propósito: o `.view-in` não tem
 * `forwards`, portanto uma animação terminada não pesa sobre nada — e assim o
 * `className` que o JSX escreve continua a ser constante, que é o que garante
 * que o React nunca o reescreve por cima disto.
 */
function reanimarBloco(bloco: HTMLElement | null): void {
  // Quem pediu para não animar não leva reinício nenhum. O `globals.css`
  // também desliga a `.view-in` no `prefers-reduced-motion`, mas a classe
  // ficaria pendurada à mesma — mais vale nem lá chegar.
  if (!bloco || semMovimento()) return;
  bloco.classList.remove(ENTRADA_DO_BLOCO);
  void bloco.offsetWidth;
  bloco.classList.add(ENTRADA_DO_BLOCO);
}

/**
 * As MESMAS chaves noutra ordem — e não outras chaves.
 *
 * Comprimentos iguais, pelo menos uma posição trocada, e nenhuma chave nova. É
 * esta pergunta que separa «reordenei» de «filtrei», e é por isso que a
 * comparação é sobre as chaves e não sobre os itens: `chaveDe` é o contrato de
 * identidade desta lista (o mesmo que alimenta o `key`), e são únicas — se não
 * fossem, o React já se estaria a queixar muito antes de isto importar.
 */
function mesmaGenteNoutraOrdem(antes: readonly string[], agora: readonly string[]): boolean {
  if (antes.length === 0 || antes.length !== agora.length) return false;
  let trocou = false;
  for (let i = 0; i < agora.length; i++) {
    if (agora[i] !== antes[i]) {
      trocou = true;
      break;
    }
  }
  if (!trocou) return false;
  const conjunto = new Set(antes);
  return agora.every((chave) => conjunto.has(chave));
}

export function TabelaOuCartoes<T>({
  itens,
  chaveDe,
  colunas,
  cartao,
  aoAbrir,
  vazio,
  ordemInicial,
  legenda,
  semMoldura = false,
}: TabelaOuCartoesProps<T>) {
  const { desktop, largo, montado } = useAdaptativo();
  const [ordem, setOrdem] = useState(ordemInicial ?? null);
  const caixa = useRef<HTMLDivElement>(null);
  const [rolavel, setRolavel] = useState(false);

  /**
   * A CAIXA RECEBE FOCO SÓ QUANDO HÁ MESMO PARA ONDE ROLAR.
   *
   * Uma zona que rola tem de ser operável sem rato (WCAG 2.1.1) — mas pôr um
   * `tabindex` permanente em TODAS as tabelas dava uma paragem de Tab antes de
   * cada uma, mesmo nas que cabem. Por isso mede-se: só quando o conteúdo pede
   * mais largura do que a caixa tem é que ela entra na ordem de tabulação e se
   * anuncia como região.
   *
   * Observa-se a caixa E a tabela lá dentro: a caixa muda de largura quando a
   * janela muda, e a tabela muda quando chega uma linha com um nome comprido —
   * é por isso que as dependências NÃO incluem `itens` nem `colunas`. O
   * `colunas` das listas é construído em cada desenho (`COLUNAS_DE_PEDIDOS(…)`
   * em `AdminClient`), portanto pô-lo aqui montava e desmontava um
   * `ResizeObserver` a cada tecla escrita no painel do pedido. Quem avisa que o
   * conteúdo mudou é o observador, não a lista de dependências.
   */
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ver = () => setRolavel(el.scrollWidth > el.clientWidth + 1);
    ver();
    const observador = new ResizeObserver(ver);
    observador.observe(el);
    const tabela = el.firstElementChild;
    if (tabela) observador.observe(tabela);
    return () => observador.disconnect();
  }, [montado, desktop, largo]);

  const ordenados = useMemo(() => {
    if (!ordem) return [...itens];
    const col = colunas.find((c) => c.chave === ordem.chave);
    if (!col?.ordenar) return [...itens];
    const cmp = col.ordenar;
    return [...itens].sort((a, b) => (ordem.ascendente ? cmp(a, b) : cmp(b, a)));
  }, [itens, colunas, ordem]);

  /**
   * ── A TROCA COM O ECRÃ VAZIO É OUTRO ECRÃ, NÃO É UMA LISTA MAIS CURTA ────
   *
   * Escrever na procura até não sobrar nada troca a lista INTEIRA pelo estado
   * vazio: uma árvore desmonta e a outra monta no lugar dela. Não é «menos
   * linhas» — é outro ecrã dentro da mesma moldura, que é a definição da
   * `.view-in`.
   *
   * E acontece nos dois sentidos, portanto a entrada também: apagar uma letra
   * e a lista voltar é a mesma troca ao contrário.
   *
   * ── O FOCO NÃO SE PERDE, E ISSO FOI VERIFICADO ──────────────────────────
   *
   * Uma troca de árvore a meio de escrever seria inaceitável se o campo de
   * procura vivesse cá dentro — perdia o foco a cada palavra que não desse
   * resultados. Não vive: nas cinco vistas o campo está na barra de cima, IRMÃO
   * desta primitiva e fora dela (`Clientes.tsx:275`, `Contratos.tsx:298`,
   * `Inventario.tsx:593`, `AdminClient.tsx:5024`). E `vazio` só é passado por
   * uma delas hoje (`Clientes.tsx:393`) — as outras tratam o caso vazio antes
   * de chegar aqui.
   *
   * O `<div>` que embrulha existe só para haver um nó onde pousar a classe: um
   * fragmento não tem caixa, e sem caixa não há `transform` nem `opacity`.
   */
  const estaVazio = itens.length === 0 && !!vazio;

  /**
   * O bloco que leva a entrada — a `<ul>`, o `<tbody>` ou o embrulho do vazio.
   * É um ref só porque só um deles está montado de cada vez, e o React já
   * desliga o antigo antes de ligar o novo (os dois antes de os efeitos
   * correrem), portanto quando isto se lê já aponta para o que ficou.
   */
  const bloco = useRef<HTMLElement | null>(null);
  /** As chaves do desenho anterior. `undefined` = ainda não houve nenhum. */
  const chavesAntes = useRef<readonly string[] | null | undefined>(undefined);

  /**
   * SEM LISTA DE DEPENDÊNCIAS, de propósito. O `colunas` das listas é
   * construído em cada desenho (ver a nota do `ResizeObserver` lá em cima),
   * portanto `ordenados` é um array novo a cada renderização e uma lista de
   * dependências não pouparia nada — só daria a impressão de que poupava. O que
   * decide é a comparação de chaves aqui dentro, e ela é O(n) contra o
   * O(n log n) da ordenação que já corre por cima dela.
   *
   * E não corre na PRIMEIRA montagem: aí quem apresenta o bloco é o ecrã que o
   * traz, com a `.bo-cena` e o seu degrau. Duas entradas encaixadas seriam
   * 20 px de percurso e dois desvanecimentos — duas linguagens de movimento na
   * mesma página, que é o defeito que o vocabulário da casa existe para não ter.
   *
   * É também o que deixa a troca de hidratação (telemóvel → computador, aqui em
   * baixo) sem animação nenhuma sem precisar de a excepcionar: essa troca muda a
   * ÁRVORE e não muda uma única chave, e esta regra só olha para as chaves.
   */
  useEffect(() => {
    const chaves = estaVazio ? null : ordenados.map(chaveDe);
    const antes = chavesAntes.current;
    chavesAntes.current = chaves;
    if (antes === undefined) return;
    const trocouDeEcra = (antes === null) !== (chaves === null);
    const reordenou = antes !== null && chaves !== null && mesmaGenteNoutraOrdem(antes, chaves);
    if (trocouDeEcra || reordenou) reanimarBloco(bloco.current);
  });

  if (estaVazio) {
    return (
      <div
        ref={(n) => {
          bloco.current = n;
        }}
      >
        {vazio}
      </div>
    );
  }

  /**
   * ── ISTO NÃO SE ANIMA, E A RAZÃO FICA ESCRITA ─────────────────────────────
   *
   * `!montado` desenha a forma de TELEMÓVEL antes de o browser saber a largura
   * (é o que impede o desencontro de hidratação — ver `adaptativo.ts`), e no
   * computador troca-a pela tabela no fotograma a seguir. Há ali um salto, e é
   * real.
   *
   * Mas é ARTEFACTO DE HIDRATAÇÃO, não navegação: ninguém pediu nada, ninguém
   * está à espera de resposta nenhuma, e acontece uma vez por CARREGAMENTO de
   * página. Animá-lo trocava um salto que se vê uma vez por carregamento por
   * uma animação que se vê uma vez por carregamento — e uma animação vê-se
   * durante 240 ms, o salto vê-se durante um fotograma. Ficava mais lento e
   * mais notado, que é o contrário do que se quer.
   *
   * A regra de entrada aqui em cima já o deixa de fora sem o excepcionar: ela
   * olha para as chaves, e nesta troca as chaves são exactamente as mesmas.
   * Quem quiser «corrigir» isto tem de mexer nessa regra de propósito.
   *
   * Antes de montar desenha-se a forma de TELEMÓVEL: os cartões são um único
   * elemento por linha e cabem em qualquer largura, enquanto uma tabela a
   * aparecer e desaparecer num ecrã pequeno salta à vista.
   */
  if (!montado || !desktop) {
    return (
      /**
       * ── UMA LISTA, E NÃO UMA PILHA DE CAIXAS ────────────────────────────
       *
       * Cada linha era um cartão com moldura própria, canto próprio e fundo
       * próprio, com 8 px de ar entre eles. Vinte pedidos eram vinte molduras
       * — e vinte molduras não são uma lista, são vinte coisas separadas que
       * por acaso estão em cima umas das outras.
       *
       * A moldura sobe para o GRUPO e sai de cada linha; o que separa passa a
       * ser um fio. É exactamente o mesmo movimento que os três números do
       * dinheiro da Visão Geral já tinham feito, com a razão escrita lá: «três
       * caixas com ar entre elas gastam três vezes a mesma margem».
       *
       * ── O QUE NÃO SE PERDE ──────────────────────────────────────────────
       *
       * A linha inteira continua a ser um alvo de toque, e continua a
       * responder: o `hover` e o `:active` passam a pintar a FAIXA em vez de
       * acender uma moldura. Num telemóvel isso lê-se melhor do que um
       * contorno de 1 px — a mão tapa metade do que está a tocar.
       *
       * O `p-3.5` em vez de `p-3`: sem moldura à volta, o respiro tem de vir
       * do interior. E a densidade não piora, porque desaparecem os 8 px de ar
       * entre cada duas linhas.
       */
      <ul
        ref={(n) => {
          bloco.current = n;
        }}
        className="flex flex-col divide-y divide-[var(--bo-hairline)] overflow-hidden rounded-xl border border-[var(--bo-hairline)] bg-white"
        aria-label={legenda}
      >
        {ordenados.map((item) => (
          <li key={chaveDe(item)}>
            {semMoldura ? (
              cartao(item)
            ) : aoAbrir ? (
              <button
                type="button"
                onClick={() => aoAbrir(item)}
                // Sem `motion-safe:` até aqui, e nos 150 ms por omissão. A linha
                // inteira é um alvo de toque no telemóvel — é dos sítios desta
                // pasta onde o carregar mais precisava de resposta.
                /* `foco-largo`: esta linha é uma CAIXA de 80 px, não um botão. O anel
                   de base, colado a ela, lê-se como moldura da linha; com quatro
                   píxeis de folga lê-se como foco. Ver a nota no `globals.css`. */
                className={`alvo-toque foco-largo group block w-full p-3.5 text-left hover:bg-[#4d6350]/[0.04] active:bg-[#4d6350]/[0.08] ${ESTADO} ${PRESSAO}`}
              >
                {cartao(item)}
              </button>
            ) : (
              <div className="group p-3.5">{cartao(item)}</div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const visiveis = colunas.filter((c) => !c.soLargo || largo);

  return (
    /**
     * ── A CAIXA ROLA; ANTES CORTAVA ───────────────────────────────────────
     *
     * Aqui estava `overflow-hidden` (posto para arredondar os cantos) e a
     * tabela é `w-full`: quando o conteúdo pede mais largura do que a caixa
     * tem, `w-full` não a impede de crescer — cresce, e o que passa do corte
     * fica desenhado do lado de lá, sem barra, sem gesto e sem sinal nenhum de
     * que existe. Num portátil de 1440×900 a tabela de Pedidos pedia 1537 px
     * numa caixa de 1104: «Pax» e «À espera» simplesmente não existiam para
     * quem trabalha nesse ecrã, e o `body` tem `overflow-x: clip`, portanto
     * nem a página rolava até lá.
     *
     * ── Porquê rolar, e não esconder colunas ──────────────────────────────
     * Esconder era esconder INFORMAÇÃO, e a largura de uma tabela é a do seu
     * conteúdo: um nome de casal por extenso ou uma quinta com morada completa
     * mudam a conta, portanto não há conjunto de colunas que caiba sempre. E
     * quem decide o que já não cabe é a CAIXA, não a janela — o `soLargo`
     * pergunta à janela (≥1440) e a coluna da navegação come 336 px dela, que
     * é exactamente como duas colunas foram parar ao lado de lá do corte. Uma
     * caixa que rola resolve os dois casos de uma vez, e resolve-os para todas
     * as tabelas do back office, que passam todas por aqui.
     *
     * `overflow-x-auto` e não `overflow-auto`: só a horizontal é que precisa
     * de sair do `hidden`; a vertical continua a crescer com a página, que é
     * como uma lista longa se lê.
     */
    <div
      ref={caixa}
      // Sem isto, chegar às colunas da direita exigia rato ou dedo (ver acima).
      tabIndex={rolavel ? 0 : undefined}
      role={rolavel ? "region" : undefined}
      aria-label={rolavel ? legenda : undefined}
      className="overflow-x-auto rounded-xl border border-[var(--bo-hairline)] bg-white"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-[var(--bo-hairline)]">
            {visiveis.map((c) => (
              <th
                key={c.chave}
                scope="col"
                className={cn(
                  "bo-eyebrow px-3 py-2.5 text-left font-medium",
                  c.alinharADireita && "text-right",
                  c.largura,
                )}
                // `aria-sort` é o que diz a um leitor de ecrã por onde a tabela
                // está ordenada. Sem isto, a seta é decoração.
                aria-sort={
                  ordem?.chave === c.chave
                    ? ordem.ascendente
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {c.ordenar ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOrdem((prev) =>
                        prev?.chave === c.chave
                          ? { chave: c.chave, ascendente: !prev.ascendente }
                          : { chave: c.chave, ascendente: true },
                      )
                    }
                    className={`inline-flex items-center gap-1 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
                  >
                    {c.cabecalho}
                    <span aria-hidden className="text-[9px]">
                      {ordem?.chave === c.chave ? (ordem.ascendente ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                ) : (
                  c.cabecalho
                )}
              </th>
            ))}
          </tr>
        </thead>
        {/* O `<tbody>` e não a `<table>`: assim o `<thead>` fica quieto e o
            cabeçalho onde se acabou de carregar não se mexe. O que entra é a
            resposta, não o botão. */}
        <tbody
          ref={(n) => {
            bloco.current = n;
          }}
        >
          {ordenados.map((item) => (
            <tr
              key={chaveDe(item)}
              onClick={aoAbrir ? () => aoAbrir(item) : undefined}
              className={cn(
                // `group` para o `MenuDeAccoes` se poder revelar ao passar o
                // rato pela LINHA inteira — e não só por cima do próprio botão,
                // que obrigava a adivinhar onde ele está.
                "group border-b border-[var(--bo-hairline)] last:border-0",
                aoAbrir && "cursor-pointer hover:bg-[var(--bo-tinta-3)]",
              )}
            >
              {visiveis.map((c, i) => (
                <td
                  key={c.chave}
                  className={cn("px-3 py-2.5 align-middle", c.alinharADireita && "text-right")}
                >
                  {/* Clicar na LINHA é uma comodidade do rato. Quem navega por
                      teclado precisa de um controlo a sério, com nome — e ele
                      vai na PRIMEIRA célula, que é onde está a identificação da
                      linha (o nome do casal, o número da factura). Sem isto a
                      tabela era inutilizável sem rato, que é o defeito mais
                      fácil de introduzir aqui e o mais difícil de notar. */}
                  {aoAbrir && i === 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        aoAbrir(item);
                      }}
                      className={`text-left hover:underline focus-visible:underline ${ESTADO} ${PRESSAO}`}
                    >
                      {c.celula(item)}
                    </button>
                  ) : (
                    c.celula(item)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
