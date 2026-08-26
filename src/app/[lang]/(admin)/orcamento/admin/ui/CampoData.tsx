"use client";

import { useId } from "react";
import { cn } from "./cn";

/**
 * UM CAMPO DE DATA QUE NÃO INVENTA UM CALENDÁRIO.
 *
 * ── A decisão, e é a que menos código dá ────────────────────────────────────
 * `<input type="date">` é NATIVO. No telemóvel abre o selector do sistema — o
 * mesmo em que se marcam consultas e voos, com o polegar, sem aprender nada. No
 * computador abre o calendário do browser, com teclado a funcionar. Escrever um
 * calendário à mão seria pior nos dois: pior no telemóvel (nunca fica tão bom
 * como o do sistema) e pior no computador (perde a escrita directa "15/09").
 *
 * O que aqui se acrescenta é o que o nativo NÃO dá:
 *
 *  1. **A data por extenso**, por baixo, em português. `2027-09-18` não se lê;
 *     "sábado, 18 de setembro de 2027" lê-se — e é assim que se apanha o engano
 *     de ter escrito o ano errado.
 *  2. **O aviso de dia da semana**, quando um casamento cai fora de sábado. Não
 *     impede nada: assinala. Foi exactamente o engano que quase passou na
 *     importação dos casamentos de 2027 (uma quinta-feira no meio de sábados).
 *  3. **Letra de 16 px**, que é o que impede o Safari do iOS de ampliar a
 *     página ao focar — e de não voltar a desampliar.
 */

export interface CampoDataProps {
  label: string;
  /** yyyy-mm-dd, como o `input` nativo fala. */
  value: string;
  onChange: (valor: string) => void;
  /** Avisa quando a data não cai neste dia da semana (0 = domingo, 6 = sábado).
   *  Nos casamentos usa-se 6. */
  diaEsperado?: number;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * "sábado, 18 de setembro de 2027" a partir de "2027-09-18".
 *
 * A data é construída com `T00:00:00` e lida com `getUTC*`? Não: é construída
 * com os três números soltos, em hora LOCAL. Fazer `new Date("2027-09-18")`
 * interpreta a cadeia como UTC, e em Portugal no Verão isso dá o dia anterior
 * às 23h — ou seja, o campo mostrava um dia diferente do que lá está escrito.
 */
export function porExtenso(iso: string): { texto: string; diaDaSemana: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, a, mes, d] = m;
  const data = new Date(Number(a), Number(mes) - 1, Number(d));
  if (Number.isNaN(data.getTime())) return null;
  return {
    texto: data.toLocaleDateString("pt-PT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    diaDaSemana: data.getDay(),
  };
}

export function CampoData({
  label,
  value,
  onChange,
  diaEsperado,
  min,
  max,
  disabled,
  required,
  className,
}: CampoDataProps) {
  const id = useId();
  const lida = porExtenso(value);
  const foraDoEsperado =
    lida && diaEsperado !== undefined && lida.diaDaSemana !== diaEsperado ? lida.diaDaSemana : null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="bo-eyebrow">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        // 16 px não é estética: abaixo disto o iOS amplia ao focar.
        className="bo-input py-2.5 text-base"
      />
      {lida && (
        <p className={cn("text-xs", foraDoEsperado !== null ? "text-[#8a6d2f]" : "bo-text-muted")}>
          {lida.texto}
          {foraDoEsperado !== null && ` — é uma ${DIAS[foraDoEsperado]}, confirma`}
        </p>
      )}
    </div>
  );
}
