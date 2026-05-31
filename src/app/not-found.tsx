import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section className="min-h-[80vh] flex items-center justify-center px-6 bg-surface">
      <div className="max-w-xl text-center">
        <p
          className="text-moss/30 font-bold leading-none mb-6 select-none"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(80px, 16vw, 200px)" }}
        >
          404
        </p>
        <p className="text-foreground/28 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center justify-center gap-3">
          <span className="w-5 h-px bg-moss/50" />
          Página não encontrada
        </p>
        <h1
          className="text-foreground font-bold leading-tight mb-6"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 48px)" }}
        >
          Este caminho não existe.
        </h1>
        <p className="text-foreground/40 text-sm leading-[1.8] max-w-md mx-auto mb-12">
          A página que procura pode ter sido movida ou já não está disponível.
          Mas o seu próximo evento ainda está à espera de ser criado.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase"
          >
            Voltar ao início →
          </Link>
          <Link
            href="/contacto"
            className="inline-flex items-center gap-3 px-8 py-4 border border-foreground/12 text-foreground/45 font-medium rounded-sm hover:border-foreground/25 hover:text-foreground/75 transition-all duration-300 text-sm tracking-widest uppercase"
          >
            Falar connosco
          </Link>
        </div>

        {/* Quick links — keep the crawler & visitor moving */}
        <nav className="mt-14 pt-8 border-t border-foreground/8 flex flex-wrap gap-x-7 gap-y-2 justify-center">
          {[
            ["Serviços", "/servicos"],
            ["Galeria", "/galeria"],
            ["Sobre", "/sobre"],
            ["Clientes", "/clientes"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-foreground/30 hover:text-moss text-xs tracking-[0.2em] uppercase transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
