"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="min-h-[80vh] flex items-center justify-center px-6 bg-surface">
      <div className="max-w-lg text-center">
        <p className="text-foreground/28 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center justify-center gap-3">
          <span className="w-5 h-px bg-moss/50" />
          Algo correu mal
        </p>
        <h1
          className="text-foreground font-bold leading-tight mb-6"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 48px)" }}
        >
          Ocorreu um erro inesperado.
        </h1>
        <p className="text-foreground/40 text-sm leading-[1.8] max-w-md mx-auto mb-12">
          Pedimos desculpa pelo incómodo. Tente novamente — se o problema
          persistir, contacte-nos diretamente e teremos todo o gosto em ajudar.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase"
          >
            Tentar novamente →
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-8 py-4 border border-foreground/12 text-foreground/45 font-medium rounded-sm hover:border-foreground/25 hover:text-foreground/75 transition-all duration-300 text-sm tracking-widest uppercase"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </section>
  );
}
