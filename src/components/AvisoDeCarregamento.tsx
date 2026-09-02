"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getDictionary, type Locale } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO UMA PÁGINA DEMORA, O LOGÓTIPO DIZ QUE ALGO ESTÁ A ACONTECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «se algo demora mais tempo no site online (…) quando não
 * demora, aquilo abre logo. Mas caso demore tempo, eu quero que coloques
 * aquela animação de está a carregar e metemos o logo».
 *
 * É a segunda metade do exemplo que ela mandou — o `pm-preloader__logo`, com o
 * `logo-pulse` —, e no exemplo dela está anotada exactamente para isto: «ou,
 * na navegação entre páginas».
 *
 * ── A REGRA É A OPOSTA DA CORTINA, E DE PROPÓSITO ────────────────────────
 *
 * A cortina da proposta tem um MÍNIMO: vê-se sempre, mesmo quando a página é
 * rápida, porque é marca. Esta peça é o contrário — é INFORMAÇÃO, e informação
 * que não é precisa é ruído. Uma navegação instantânea com um flash de
 * logótipo pelo meio parece uma avaria, não um cuidado.
 *
 * Portanto: nasce invisível e só começa a aparecer aos 400 ms. Se a página
 * chegar antes disso — que é o caso normal, com as rotas pré-carregadas — este
 * componente monta, não pinta um único pixel, e desmonta.
 *
 * A receita é a que os próprios documentos do Next recomendam para isto, à
 * letra: «add an initial animation delay (e.g. 100ms) and start the animation
 * as invisible (e.g. opacity: 0). This means the loading indicator will only
 * be shown if the navigation takes longer than the specified delay».
 *
 * ── PORQUE É QUE NÃO USA O `useLinkStatus` ───────────────────────────────
 *
 * Porque ele só funciona DENTRO de um `<Link>` — está nos documentos: «must be
 * used within a descendant component of a Link component». Os links deste
 * sítio estão espalhados por vinte e dois ficheiros, e pôr um indicador dentro
 * de cada um seria mexer nos vinte e dois para resolver uma coisa que é do
 * sítio inteiro, com vinte e duas hipóteses de ficar esquecido no próximo que
 * alguém escrever.
 *
 * Isto ouve os cliques uma vez, no documento, e vive num sítio só: o cromado.
 *
 * ── E NUNCA FICA PRESO ───────────────────────────────────────────────────
 *
 * Três saídas: o caminho muda (o caso normal), o separador vai-se embora, ou o
 * tecto de oito segundos. Um indicador de espera que não sabe acabar é a
 * própria avaria que ele existe para evitar.
 */

/** Acima disto desiste e desaparece. Ninguém fica preso a olhar para o logótipo. */
const TECTO_MS = 8_000;

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
   * O MESMO caminho não é uma navegação — e é a armadilha desta peça.
   *
   * Uma âncora para a mesma página (`#contactos`) ou o link da página onde já
   * se está não mudam o caminho; sem isto, o aviso ficava à espera de uma
   * chegada que nunca acontecia, até ao tecto dos oito segundos.
   */
  if (destino.pathname === window.location.pathname) return true;

  return false;
}

export function AvisoDeCarregamento({ locale }: { locale: Locale }) {
  const caminho = usePathname();
  const [aCaminho, setACaminho] = useState(false);

  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (naoNavega(e)) return;
      setACaminho(true);
    };
    // Na fase de captura: um `onClick` de um componente pode parar a
    // propagação antes de isto chegar a saber que houve um clique.
    document.addEventListener("click", aoClicar, true);
    const aoSair = () => setACaminho(false);
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      window.removeEventListener("pagehide", aoSair);
    };
  }, []);

  /** Chegou: o caminho é outro. É esta a saída de todos os dias. */
  useEffect(() => {
    setACaminho(false);
  }, [caminho]);

  /** E o tecto, para o caso de a chegada nunca acontecer. */
  useEffect(() => {
    if (!aCaminho) return;
    const t = setTimeout(() => setACaminho(false), TECTO_MS);
    return () => clearTimeout(t);
  }, [aCaminho]);

  if (!aCaminho) return null;

  const t = getDictionary(locale).common;

  return (
    <div
      className="a-caminho"
      /**
       * `status` e não `alert`: isto não interrompe ninguém, informa.
       *
       * O texto existe e está escondido aos olhos — a regra dela é «nunca um
       * estado de espera sem nome», e um logótipo a respirar é bonito e não é
       * um nome. Quem ouve o ecrã recebe a palavra; quem o vê recebe o
       * logótipo, que é o que ela pediu.
       */
      role="status"
      aria-live="polite"
    >
      <Image
        src="/logo-liquen.png"
        alt=""
        width={150}
        height={90}
        className="a-caminho__logo"
        priority
      />
      <span className="sr-only">{t.aAbrir}</span>
    </div>
  );
}
