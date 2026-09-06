"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MARCA QUE ANDA — a medida, sem o desenho
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra, quando se carrega numa coisa e vai-se para outra coisa».
 *
 * O gesto é o do `Segmented` e o da barra lateral do back office: o destino
 * activo não acende de repente noutro sítio — há um filete que DESLIZA de um
 * para o outro. O que este gancho faz é a metade chata desse gesto: perguntar
 * ao elemento marcado onde ele está e quanto mede, e voltar a perguntar sempre
 * que a lista muda de forma. O desenho — a espessura, a cor, o lado — fica de
 * quem chama, porque é aí que ele difere.
 *
 * ── PORQUE É QUE MEDE, EM VEZ DE CALCULAR ─────────────────────────────────
 *
 * Nenhuma destas listas tem altura fixa. Na barra lateral o grupo «Mais» abre e
 * fecha e quatro destinos escondem-se no computador; no índice do estúdio a
 * mesma lista é uma TIRA horizontal abaixo de 40rem e uma COLUNA acima, e os
 * chips não medem todos o mesmo («Evento» e «Detalhes finais»). Um número
 * tirado do índice ficava errado em todas essas situações. O `ResizeObserver` é
 * o mesmo instrumento que o `Segmented` usa, e pela mesma razão.
 *
 * ── DEVOLVE OS DOIS EIXOS, E ISSO É DE PROPÓSITO ──────────────────────────
 *
 * A barra lateral só precisa do `y` (é vertical); o índice do estúdio precisa
 * do `x` TAMBÉM, porque na tira os chips estão lado a lado. Um filete que leve
 * `translate: ${x}px ${y}px` serve as duas formas com um elemento só e sem uma
 * única classe a perguntar em que largura está — na coluna o `x` é sempre 0, na
 * tira o `y` é sempre 0. Foi o que evitou ter aqui uma segunda maneira de
 * marcar «onde estou» só por a lista mudar de eixo.
 *
 * ── E PORQUE É QUE NÃO ANDA NO PRIMEIRO DESENHO ───────────────────────────
 *
 * `podeAndar` só passa a verdadeiro no fotograma seguinte ao da primeira
 * medida. Sem isso, ao abrir o ecrã o filete deslizava do canto até ao destino
 * activo — um movimento que ninguém provocou, a dizer uma transição que não
 * houve. Também é o que o `Segmented` faz.
 *
 * ── O QUE ISTO NÃO SE PODE PROVAR EM jsdom ────────────────────────────────
 *
 * `offsetParent` é sempre nulo em jsdom e as medidas são todas zero: sem
 * disposição não há nada para medir. O filete da barra lateral já teve um teste
 * de unidade que falhou exactamente por isto e teve de virar passeio de
 * Playwright (`e2e/admin-views.spec.ts`) — a geometria mede-se num browser. O
 * que se prova aqui em baixo, com as medidas fingidas, é a CANALIZAÇÃO: que se
 * mede o elemento certo, que se apaga a marca quando ele está escondido, e que
 * o primeiro fotograma não anda.
 *
 * ── E A BARRA LATERAL JÁ USA ISTO ─────────────────────────────────────────
 *
 * Usava uma cópia desta lógica, e a nota que aqui estava dizia porquê: quando
 * este ficheiro nasceu, o `AdminClient` estava debaixo de outras mãos e a
 * instrução era lê-lo e não lhe tocar. A cópia saiu. A medida da barra lateral
 * é este gancho menos o eixo `x`, e é hoje uma chamada daqui. São CINCO as
 * barras que medem por este código — a coluna do back office, o índice do
 * estúdio, o painel «O que vai sair» e as duas dos modelos de email
 * («Modelos / Editor clássico» e «Português / English») —, que é o que faz uma
 * correcção como a do «tamanho zero», lá em baixo, valer nas cinco de uma vez.
 */
export interface Marca {
  /** Canto esquerdo do elemento marcado, relativo à zona. */
  x: number;
  /** Canto superior do elemento marcado, relativo à zona. */
  y: number;
  largura: number;
  altura: number;
}

function igual(a: Marca | null, b: Marca | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.largura === b.largura && a.altura === b.altura;
}

/**
 * @param zona     A lista. **Tem de ser `position: relative`** — é ela o
 *                 `offsetParent` das medidas devolvidas, e é dentro dela que o
 *                 filete se posiciona em absoluto.
 * @param seletor  Como se reconhece o elemento marcado (`[aria-current="page"]`
 *                 na barra lateral, `[aria-current="true"]` no índice).
 * @param chave    Muda quando a lista pode ter mudado de forma — o destino
 *                 activo, uma dobra que abriu. É o que manda medir de novo.
 */
export function useMarcaQueAnda(
  zona: RefObject<HTMLElement | null>,
  seletor: string,
  chave: unknown,
): { marca: Marca | null; podeAndar: boolean } {
  const [marca, setMarca] = useState<Marca | null>(null);
  const [podeAndar, setPodeAndar] = useState(false);

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A ZONA PODE NASCER DEPOIS DO PRIMEIRO EFEITO — E NASCE MESMO
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Isto era `const lista = zona.current` lido dentro do efeito da medida, com
   * `[zona, seletor, chave]` na lista de dependências. Um `RefObject` é sempre
   * o MESMO objecto, portanto essa lista não muda quando o elemento aparece: se
   * a zona ainda não existia quando o efeito correu, ele saía pelo `return` e
   * NUNCA MAIS voltava a correr. Sem observador, sem medida, sem marca — para
   * sempre, e sem um erro em lado nenhum.
   *
   * Não é hipótese: foi MEDIDO num Chromium, na barra «Esta página / Todas» do
   * `PainelDoEstudio` (ver `e2e/painel-estudio-marca.spec.ts`). Aquele painel
   * só se MONTA depois de a fila das colunas se medir a si própria, e no
   * primeiro desenho a largura ainda é zero — ou seja, o `<div role="tablist">`
   * nasce um desenho DEPOIS do gancho. Ao abrir o estúdio a barra ficava com
   * zero marcas; a primeira mudava a `chave`, o efeito corria pela primeira vez
   * e a marca aparecia já no destino, sem percurso nenhum. O gesto que isto
   * existe para fazer — ANDAR de um separador para o outro — não acontecia
   * nunca na primeira troca, e ninguém dava por isso porque o separador activo
   * mantinha o seu próprio fundo enquanto não houvesse marca.
   *
   * Guardar o elemento em ESTADO é o que dá ao efeito da medida uma dependência
   * que muda quando ele aparece. O efeito abaixo não tem lista de dependências
   * de propósito — corre a seguir a cada desenho, que é a única altura em que se
   * pode dar por um `ref` que mudou —, e não faz nada quando o elemento é o
   * mesmo: o React ignora um `setState` com o valor anterior, portanto isto
   * assenta num desenho e não anda a redesenhar-se sozinho.
   */
  const [zonaViva, setZonaViva] = useState<HTMLElement | null>(null);
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect --
     As duas regras avisam do que aqui é deliberado, e a razão está por extenso
     em cima: sem lista de dependências porque é a seguir a CADA desenho que se
     pode dar por um `ref` que passou a apontar para alguma coisa, e com
     `setState` porque é isso que dá ao efeito da medida uma dependência que
     muda quando o elemento aparece. Não encadeia desenhos: o React ignora um
     `setState` que devolve o valor anterior, portanto isto escreve UMA vez —
     quando a zona nasce — e nunca mais. */
  useEffect(() => {
    setZonaViva((antes) => (antes === zona.current ? antes : zona.current));
  });
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  useEffect(() => {
    const lista = zonaViva;
    if (!lista) return;
    const medir = () => {
      const activo = lista.querySelector<HTMLElement>(seletor);
      // `offsetParent` nulo quer dizer escondido (um grupo dobrado, um ramo com
      // `display:none` do outro lado de um corte). Sem elemento à vista não há
      // marca — melhor nenhuma do que uma pousada no sítio errado.
      //
      // ── E UMA CAIXA DE TAMANHO ZERO TAMBÉM NÃO É UMA MARCA ───────────────
      //
      // Este era o único ponto em que a medida daqui DIVERGIA do `Segmented`,
      // que testa `!activo.offsetWidth`. A divergência foi apontada quando o
      // gancho servia UM sítio e não se corrigiu; hoje serve cinco barras, e o
      // que ela deixa passar é pior do que uma marca invisível: nas três com
      // fundo próprio (a do `PainelDoEstudio` e as duas dos modelos de email,
      // pela regra que o `Segmented` explica), o separador activo LARGA o seu
      // fundo no instante em que há marca — «nunca há dois fundos, e nunca há
      // nenhum». Uma marca de 0×0 é uma marca que conta como existente e não
      // pinta nada: o resultado é um separador activo que deixa de se
      // distinguir dos outros.
      //
      // Um elemento com uma das medidas a zero não pinta coisa nenhuma, logo
      // não há caso em que rejeitá-lo perca uma marca legítima. Os dois eixos e
      // não só a largura (que é o que o `Segmented` testa): na barra lateral a
      // marca É a altura, e uma altura zero deixava lá um filete de 3 px por
      // 0 px, que é exactamente o mesmo nada.
      if (!activo || activo.offsetParent === null || !activo.offsetWidth || !activo.offsetHeight) {
        setMarca(null);
        return;
      }
      const nova: Marca = {
        x: activo.offsetLeft,
        y: activo.offsetTop,
        largura: activo.offsetWidth,
        altura: activo.offsetHeight,
      };
      // Só escreve quando MUDA. O observador dispara a cada remedição da lista
      // e um objecto novo de cada vez punha a árvore a redesenhar-se por nada.
      setMarca((antes) => (igual(antes, nova) ? antes : nova));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(lista);
    for (const b of lista.querySelectorAll("button")) observador.observe(b);
    return () => observador.disconnect();
  }, [zonaViva, seletor, chave]);

  useEffect(() => {
    if (!marca || podeAndar) return;
    const id = requestAnimationFrame(() => setPodeAndar(true));
    return () => cancelAnimationFrame(id);
  }, [marca, podeAndar]);

  return { marca, podeAndar };
}
