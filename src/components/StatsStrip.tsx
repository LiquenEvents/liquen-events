"use client";

import CountUp from "./CountUp";

const stats = [
  { value: 8, suffix: "+", label: "Anos de experiência", sub: "Desde 2018" },
  { value: 120, suffix: "+", label: "Eventos realizados", sub: "Em todo o Portugal" },
  { value: 19, suffix: "+", label: "Clientes corporativos", sub: "Empresas & instituições" },
  { value: 100, suffix: "%", label: "Satisfação garantida", sub: "Proposta sem compromisso" },
];

export default function StatsStrip() {
  return (
    <section className="bg-surface border-b border-foreground/8">
      <div className="max-w-7xl mx-auto">
        {/* gap-px with bg-foreground/[0.06] creates hairline dividers between cells */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06]">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface py-10 lg:py-14 px-6 lg:px-12 flex flex-col">
              <p
                className="text-foreground font-bold leading-none tabular-nums"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(40px, 4.5vw, 68px)",
                }}
              >
                <CountUp to={s.value} suffix={s.suffix} duration={1800} />
              </p>
              <p className="text-foreground/72 text-sm font-medium mt-3">{s.label}</p>
              <p className="text-foreground/35 text-[10px] tracking-[0.22em] uppercase mt-1.5">
                {s.sub}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
