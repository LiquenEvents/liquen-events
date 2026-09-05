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
 * ── E A BARRA LATERAL, PORQUE É QUE NÃO USA ISTO? ─────────────────────────
 *
 * Porque o filete do `AdminClient` está feito e fechado, e a instrução de quem
 * manda foi lê-lo e não lhe tocar. A sua medida é este gancho menos o eixo `x`
 * — trocá-la por uma chamada daqui é um diff de duas linhas, e é para isso que
 * este ficheiro está escrito genérico. Fica dito para que o terceiro sítio que
 * precisar de uma marca a andar venha cá, em vez de fazer a terceira cópia.
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

  useEffect(() => {
    const lista = zona.current;
    if (!lista) return;
    const medir = () => {
      const activo = lista.querySelector<HTMLElement>(seletor);
      // `offsetParent` nulo quer dizer escondido (um grupo dobrado, um ramo com
      // `display:none` do outro lado de um corte). Sem elemento à vista não há
      // marca — melhor nenhuma do que uma pousada no sítio errado.
      if (!activo || activo.offsetParent === null) {
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
  }, [zona, seletor, chave]);

  useEffect(() => {
    if (!marca || podeAndar) return;
    const id = requestAnimationFrame(() => setPodeAndar(true));
    return () => cancelAnimationFrame(id);
  }, [marca, podeAndar]);

  return { marca, podeAndar };
}
