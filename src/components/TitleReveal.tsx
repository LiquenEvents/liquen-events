"use client";

import { Fragment, useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  className?: string;
  /** Element rendered around the words (defaults to span, so it can live inside any heading). */
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** ms between consecutive words. */
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
  step = 60,
  delay = 0,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
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
          <span aria-hidden className="inline-block overflow-hidden align-bottom">
            <span
              className={`inline-block ${visible ? "word-rise" : "opacity-0"}`}
              style={{ "--word-delay": `${delay + i * step}ms` } as React.CSSProperties}
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
