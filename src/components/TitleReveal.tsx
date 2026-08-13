"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { observeOnceInView } from "@/lib/motion/observeInView";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { WORD_STAGGER_MS, wordStaggerMs } from "@/lib/motion/tokens";

interface Props {
  text: string;
  className?: string;
  /** Element rendered around the words (defaults to span, so it can live inside any heading). */
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** ms between consecutive words. Por omissão, o passo de palavra do sítio. */
  step?: number;
  /** ms before the first word starts. */
  delay?: number;
}

/**
 * Scroll-triggered word-by-word title reveal: each word rises out of an
 * overflow mask (the hero's `word-rise` animation, now available to every
 * heading on the site). Screen readers get the plain sentence via a visually
 * hidden copy (aria-label is prohibited on generic spans); the animated words
 * are presentation-only. Under prefers-reduced-motion the text simply appears.
 */
export default function TitleReveal({
  text,
  className = "",
  as = "span",
  // Era 60 — um valor por omissão que nunca chegou a correr, porque os dois
  // únicos usos (ambos no /sobre) passavam 50. O sítio tinha três omissões
  // diferentes para o mesmo gesto de palavra; fica a que está em produção.
  step = WORD_STAGGER_MS,
  delay = 0,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    return observeOnceInView(el, { threshold: 0.2, rootMargin: "0px 0px -60px 0px" }, () =>
      setVisible(true),
    );
  }, []);

  const words = text.split(/\s+/).filter(Boolean);
  // Polymorphic tag (`as`) rendered as JSX so the ref forwards cleanly — passing
  // a ref through createElement's props trips the react-hooks/refs rule.
  const Tag = as as React.ElementType;

  return (
    <Tag ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      {words.map((word, i) => (
        // The inter-word space lives BETWEEN the clip boxes (a plain text node),
        // never inside the `overflow-hidden` mask — otherwise it gets clipped and
        // the words render run-together.
        <Fragment key={i}>
          {/* pb/-mb pair: the overflow-hidden mask that hides the word-rise
              would otherwise clip glyph DESCENDERS that sit below the baseline —
              most visibly Playfair's capital "J" (so "Junte" read as "Iunte"),
              plus lowercase g/j/p/q/y. The bottom padding extends the clip box
              down to fit them; the equal negative margin keeps the line's
              layout height unchanged. */}
          <span
            aria-hidden
            className="inline-block overflow-hidden align-bottom pb-[0.16em] -mb-[0.16em]"
          >
            <span
              className={`inline-block ${visible ? "word-rise" : "opacity-0"}`}
              // Com tecto (ver `wordStaggerMs`): num título longo as últimas
              // palavras deixam de acumular atraso, para quem lê não ficar à
              // espera do fim de uma frase que já começou a levantar-se.
              style={
                { "--word-delay": `${delay + wordStaggerMs(i, step)}ms` } as React.CSSProperties
              }
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </Tag>
  );
}
