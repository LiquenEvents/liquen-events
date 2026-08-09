"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA QUE ENTRA NO ECRÃ DEIXA DE SER "PARA DEPOIS"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O defeito, e é meu ────────────────────────────────────────────────────
 * O `fetchpriority="low"` dos mosaicos longe do ecrã foi introduzido com uma
 * medição verdadeira (doze fotografias a repartir o mesmo tubo chegam todas
 * ao mesmo tempo; por ordem, a primeira chegaria a ~250 ms). O que ficou mal
 * foi a REGRA de quem é "longe": `idx >= 12`, o índice no conjunto, calculado
 * uma vez e nunca mais.
 *
 * Consequência: 415 das 427 fotografias ficam `low` para sempre — incluindo
 * aquela para a qual a visitante está a olhar quando chega à fila 40. E a
 * partir do 13.º mosaico o sinal deixa de distinguir seja o que for: 415
 * pedidos todos iguais entre si são exactamente o regime "todos ao mesmo
 * nível" que este mecanismo existia para acabar. O ganho de ordem que o
 * commit prometia é real, mas só no primeiro ecrã.
 *
 * Pior do que não ganhar: `fetchpriority="low"` é um sinal do AUTOR, e nos
 * browsers que o respeitam ele ganha ao reforço automático que o motor dá a
 * uma imagem quando ela entra no viewport. Ou seja, o atributo podia estar a
 * atrasar activamente a fotografia que se está a ver.
 *
 * ── A correcção ───────────────────────────────────────────────────────────
 * "Longe" passa a ser uma coisa que muda: nasce `low` e sobe a `auto` no
 * instante em que o mosaico entra no ecrã. Uma prioridade não é conteúdo — é
 * uma dica ao carregador — por isso é escrita DIRECTAMENTE no elemento, sem
 * passar por estado do React. É a mesma decisão, e pela mesma razão, que o
 * `useBlurTardio` já tomou para o desfocado: mudar de prioridade não pode
 * custar uma reconciliação de centenas de mosaicos no meio do scroll.
 *
 * ── Porquê UM observador para todos ───────────────────────────────────────
 * Um `IntersectionObserver` por mosaico seriam 427 observadores vivos. Um só,
 * ao nível do módulo, faz o mesmo trabalho: os alvos entram e saem, e cada um
 * é largado assim que é promovido — isto acontece uma vez por fotografia e
 * nunca mais.
 *
 * ── Porquê observar o BOTÃO e não a imagem ────────────────────────────────
 * O botão do mosaico leva `content-visibility: auto`: enquanto está fora do
 * ecrã os descendentes dele não têm caixa nenhuma, e um observador sobre a
 * `<img>` nunca dispararia. É a mesma armadilha que o `anchorRef` do
 * `GalleryImage` já documenta.
 */

/** Botão observado → a fotografia que ele contém. */
const aEsperar = new WeakMap<Element, HTMLImageElement>();
let observador: IntersectionObserver | null = null;

function obterObservador(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (observador) return observador;
  observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const img = aEsperar.get(entrada.target);
      observador?.unobserve(entrada.target);
      aEsperar.delete(entrada.target);
      // `auto` e não `high`: o que se quer é devolver a decisão ao browser,
      // que sabe da ligação e da direcção do scroll o que nós não sabemos. Pôr
      // `high` em tudo o que está à vista seria o mesmo erro ao contrário.
      if (img) img.fetchPriority = "auto";
    }
  });
  return observador;
}

/**
 * Marca uma fotografia para ser promovida quando o mosaico dela chegar ao ecrã.
 * Sem `IntersectionObserver` (ou sem elementos) promove já: mais vale perder a
 * ordem do que deixar uma fotografia presa em `low` para sempre.
 */
export function promoverQuandoAVista(ancora: Element | null, img: HTMLImageElement | null): void {
  if (!img) return;
  const io = obterObservador();
  if (!io || !ancora) {
    img.fetchPriority = "auto";
    return;
  }
  aEsperar.set(ancora, img);
  io.observe(ancora);
}

/** Larga um mosaico que saiu do DOM antes de chegar a ver-se. */
export function esquecer(ancora: Element | null): void {
  if (!ancora) return;
  aEsperar.delete(ancora);
  observador?.unobserve(ancora);
}
