"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O QUE SE SABE E NÃO SE ESCREVE AO CLIENTE.
 *
 * "Cliente da AMARA, cuidado com o prazo." "Recusaram em 2025 por preço."
 * "Margem apertada, não descer mais." São as frases que hoje vivem na cabeça de
 * quem escreveu a proposta, e que se perdem quando é outra pessoa a pegar nela
 * — ou quando são seis meses depois.
 *
 * ── PORQUE É QUE ISTO PARECE UM PAPEL AMARELO ──────────────────────────────
 * O aspecto é a garantia. Um campo com o mesmo desenho dos outros seria, mais
 * cedo ou mais tarde, confundido com um campo que sai na proposta — e a única
 * defesa contra isso não é um teste, é não se parecer com os outros. O teste
 * (em `proposal-doc-pdf.test.ts`) garante o resto: com e sem notas, o PDF
 * desenha exactamente as mesmas instruções.
 */

interface Props {
  valor: string;
  onChange: (v: string) => void;
  /** Rótulo alternativo, para as notas presas a uma secção. */
  titulo?: string;
  placeholder?: string;
  /** Compacta, para viver dentro de uma secção em vez de a encimar. */
  compacta?: boolean;
}

export default function NotasInternas({
  valor,
  onChange,
  titulo = "Notas internas",
  placeholder = "O que precisa de lembrar sobre este negócio e nunca vai na proposta.",
  compacta = false,
}: Props) {
  // O textarea cresce com o texto: uma nota de três linhas dentro de uma caixa
  // de uma linha lê-se por uma frincha, e o que não se relê não serve.
  const ref = useRef<HTMLTextAreaElement>(null);
  const [id] = useState(() => `notas-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [valor]);

  return (
    <div
      className={`rounded-xl border border-[#c9a227]/30 bg-[#f6efd8]/60 ${
        compacta ? "mt-3 p-3" : "mt-4 p-4"
      }`}
    >
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] uppercase text-[#7a6420]"
      >
        <span aria-hidden="true">✎</span>
        {titulo}
        <span className="font-normal normal-case tracking-normal text-[#7a6420]/70">
          — só para si, nunca sai na proposta
        </span>
      </label>
      <textarea
        id={id}
        ref={ref}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={compacta ? 1 : 2}
        maxLength={4000}
        placeholder={placeholder}
        className="mt-2 w-full resize-none rounded-lg border border-[#c9a227]/25 bg-white/70 px-2.5 py-2 text-xs leading-relaxed text-foreground/80 placeholder:text-foreground/30 focus:border-[#c9a227]/60 focus:outline-none"
      />
    </div>
  );
}
