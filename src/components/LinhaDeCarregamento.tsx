"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO UMA PÁGINA DEMORA, UMA LINHA FINA NO TOPO — E MAIS NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «quero também retirar aquela página branca com o
 * símbolo da Líquen no meio quando carregamos em alguma coisa e o site fica a
 * pensar antes de abrir». Posta perante a escolha, respondeu «Linha fina no
 * topo».
 *
 * ── O QUE ESTAVA AQUI ANTES, E PORQUE SAIU ───────────────────────────────
 *
 * Em setembro ela tinha pedido o contrário: «caso demore tempo, quero que
 * coloques aquela animação de está a carregar e metemos o logo». Era um ecrã
 * creme inteiro com o logótipo a respirar ao centro, a aparecer aos 400 ms.
 * Visto em uso, tapava a página onde ela estava e lia-se como uma página em
 * branco — e com movimento reduzido aparecia SEMPRE, sem atraso, porque o
 * atraso estava num `transition-delay` sem nenhuma `transition` onde actuar.
 *
 * Agora a página onde se está fica à vista, e uma linha de 2 px corre no topo
 * até a próxima chegar — o que fazem o Safari e o Instagram.
 *
 * ── O QUE FICOU, PORQUE ESTAVA CERTO ─────────────────────────────────────
 *
 * Tudo o que decide QUANDO: ouvir os cliques uma vez no documento (o
 * `useLinkStatus` do Next só funciona dentro de um `<Link>`, e os links estão
 * espalhados por vinte e dois ficheiros), ignorar o que não é uma navegação
 * desta aplicação, e as três saídas — o caminho muda, o separador vai-se, ou o
 * tecto de oito segundos. Um indicador de espera que não sabe acabar é a
 * própria avaria que ele existe para evitar.
 *
 * Nasce invisível e só aparece aos 150 ms (`.linha-a-caminho` no globals.css):
 * uma navegação rápida monta isto, não pinta um pixel, e desmonta.
 */

/** Acima disto desiste e desaparece. */
const TECTO_MS = 8_000;
/** O atraso do CSS: antes disto a linha ainda não se via. Ver globals.css. */
const ATRASO_MS = 150;
/** Quanto tempo a linha, já cheia, fica à vista antes de se apagar. */
const FECHO_MS = 250;

type Fase = "a-caminho" | "chegou" | null;

/** Um clique que NÃO vai dar numa navegação desta aplicação. */
function naoNavega(e: MouseEvent): boolean {
  // Botão do meio, direito, ou com uma tecla premida: abre noutro sítio.
  if (e.defaultPrevented || e.button !== 0) return true;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;

  const alvo = (e.target as Element | null)?.closest?.("a");
  if (!alvo) return true;

  const href = alvo.getAttribute("href");
  if (!href) return true;
  // Descarregar, abrir noutro separador, ou um destino que não é uma página.
  if (alvo.hasAttribute("download")) return true;
  if (alvo.getAttribute("target") && alvo.getAttribute("target") !== "_self") return true;

  let destino: URL;
  try {
    destino = new URL(href, window.location.href);
  } catch {
    return true;
  }
  // `mailto:`, `tel:`, e outro domínio qualquer: sai desta aplicação.
  if (destino.origin !== window.location.origin) return true;
  if (destino.protocol !== "http:" && destino.protocol !== "https:") return true;
  /**
   * O MESMO caminho não é uma navegação. Uma âncora (`#contactos`) ou o link
   * da página onde já se está não mudam o caminho; sem isto, a linha ficava à
   * espera de uma chegada que nunca acontecia, até ao tecto dos oito segundos.
   */
  if (destino.pathname === window.location.pathname) return true;

  return false;
}

/**
 * `rotulo` chega já traduzido do `CromadoDoSitio` (servidor), em vez de esta
 * peça chamar `getDictionary` — auditoria externa, P1: essa chamada punha os
 * DOIS dicionários inteiros no JavaScript de todas as páginas do sítio.
 */
export function LinhaDeCarregamento({ rotulo }: { rotulo: string }) {
  const caminho = usePathname();
  const [fase, setFase] = useState<Fase>(null);
  /** Quando foi o clique — para saber se a linha chegou a ver-se. */
  const desde = useRef(0);

  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (naoNavega(e)) return;
      desde.current = Date.now();
      setFase("a-caminho");
    };
    // Na fase de captura: um `onClick` de um componente pode parar a
    // propagação antes de isto chegar a saber que houve um clique.
    document.addEventListener("click", aoClicar, true);
    /**
     * Carregar em Voltar quer dizer que a navegação anunciada foi abandonada:
     * o caminho nunca chega a mudar, e a linha ficava a correr até ao tecto.
     * Apaga-se, sem condições.
     */
    const aoSair = () => setFase(null);
    window.addEventListener("pagehide", aoSair);
    window.addEventListener("popstate", aoSair);
    window.addEventListener("pageshow", aoSair);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      window.removeEventListener("pagehide", aoSair);
      window.removeEventListener("popstate", aoSair);
      window.removeEventListener("pageshow", aoSair);
    };
  }, []);

  /**
   * Chegou: o caminho é outro. Se a linha já se via, enche-se até ao fim e só
   * depois se apaga — uma linha que pára a 80 % e some parece que falhou. Se
   * ainda não se via (o caso normal, com as rotas pré-carregadas), sai já,
   * sem pintar nada.
   */
  useEffect(() => {
    setFase((f) => {
      if (f !== "a-caminho") return f === "chegou" ? f : null;
      return Date.now() - desde.current >= ATRASO_MS ? "chegou" : null;
    });
  }, [caminho]);

  useEffect(() => {
    if (fase === null) return;
    const t = setTimeout(() => setFase(null), fase === "chegou" ? FECHO_MS : TECTO_MS);
    return () => clearTimeout(t);
  }, [fase]);

  if (fase === null) return null;

  return (
    <div
      className="linha-a-caminho"
      data-fase={fase}
      /**
       * `status` e não `alert`: isto não interrompe ninguém, informa. A linha
       * não é um nome — a regra dela é «nunca um estado de espera sem nome» —,
       * por isso o texto está lá, escondido aos olhos, para quem ouve o ecrã.
       */
      role="status"
      aria-live="polite"
    >
      <span className="linha-a-caminho__traco" aria-hidden="true" />
      <span className="sr-only">{rotulo}</span>
    </div>
  );
}
