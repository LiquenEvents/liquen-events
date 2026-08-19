"use client";

import { useLayoutEffect, useRef } from "react";
import { chaveDoCampo, type CampoDeTexto } from "@/lib/proposal-ortografia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SEGUNDA CAIXA — A MESMA COISA, OUTRA VEZ, EM INGLÊS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vive POR BAIXO da caixa portuguesa, nunca ao lado. Três razões:
 *
 *  1. As linhas do `ServicesEditor` já vivem apertadas, com o arrasto, o mover e
 *     o apagar à direita. Não há largura.
 *  2. Por baixo, a leitura é «o mesmo campo, outra vez, em inglês» — que é o
 *     que é.
 *  3. Em tablet e telemóvel o lado-a-lado colapsava para baixo de qualquer
 *     maneira, e seria uma segunda maquetização a manter.
 *
 * ── O «EN» É UM RÓTULO E NÃO UM PLACEHOLDER ───────────────────────────────
 *
 * O placeholder desaparece quando se escreve, e é exactamente quando se escreve
 * que é preciso saber em que caixa se está. O perigo desta funcionalidade não é
 * a caixa vazia — é escrever português na caixa inglesa sem dar por isso, e
 * enviar. O `EN` fica lá sempre.
 *
 * ── A MARCA DE «POR TRADUZIR» ─────────────────────────────────────────────
 *
 * Uma caixa vazia com português escrito ao lado é uma falta; uma caixa vazia
 * com o português também vazio não é nada. A marca distingue-as ao olhar, para
 * a contagem que ela lê no passo seguinte não ser a primeira vez que ouve falar
 * do assunto.
 */
/**
 * Um `<textarea>` de uma linha que cresce com o que lá está.
 *
 * A altura mede-se no `useLayoutEffect` e não no `useEffect`: com o segundo, a
 * caixa aparecia com uma linha e saltava para duas à frente de quem escreve.
 * É o mesmo remédio que o `CampoQueCresce` do `ServicesEditor` usa — aqui não
 * se importa de lá porque estes dois ficheiros não se conhecem, e um import só
 * para quatro linhas ataria a caixa inglesa ao editor de serviços.
 */
function TextareaQueCresce(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // As bordas somam-se ao `scrollHeight` — ver a mesma conta, e a medição que
    // a obrigou, no `CampoQueCresce` do `ServicesEditor`.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={1} />;
}

export default function CaixaInglesa({
  campo,
  rotulo,
  valor,
  onChange,
  className,
  as = "input",
  rows,
  cresce = false,
  readOnly,
  porTraduzir,
  placeholder,
}: {
  /** O campo que esta caixa traduz — dá a pega do salto e a chave. */
  campo: CampoDeTexto;
  /** Como o campo se chama no ecrã, em pt-PT. Vira «… (inglês)» na voz. */
  rotulo: string;
  valor: string;
  onChange: (texto: string) => void;
  /** A classe da caixa portuguesa — a inglesa herda-a, para as duas serem a
   *  mesma caixa e não duas maquetizações. */
  className?: string;
  as?: "input" | "textarea";
  rows?: number;
  /**
   * A caixa cresce com o texto, a partir de UMA linha.
   *
   * Para as caixas que acompanham um campo que também cresce — o nome de um
   * serviço, por exemplo. Sem isto, a portuguesa abria a segunda linha e a
   * inglesa ao lado continuava a esconder o texto: as duas deixavam de ser «a
   * mesma caixa em duas línguas», que é a única razão de a inglesa herdar a
   * classe da outra.
   *
   * Desligado por omissão: as caixas de duas linhas fixas que já existem (a
   * nota do orçamento, por exemplo) ficam exactamente como estão.
   */
  cresce?: boolean;
  readOnly?: boolean;
  /** Há português escrito e esta caixa está vazia. */
  porTraduzir?: boolean;
  placeholder?: string;
}) {
  const comuns = {
    /**
     * A pega do salto, com o mesmo mecanismo do «Ver no campo» das gralhas:
     * a chave do campo mais `:en`. Uma segunda maquinaria para encontrar a
     * caixa inglesa era uma segunda maquinaria a avariar-se sozinha.
     */
    "data-campo": `${chaveDoCampo(campo)}:en`,
    value: valor,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    readOnly,
    placeholder,
    // Quem ouve o ecrã tem de ouvir a diferença: são duas caixas com o mesmo
    // nome a meio centímetro uma da outra.
    "aria-label": `${rotulo} (inglês)`,
    className: `${className ?? ""} ${
      porTraduzir ? "border-dashed border-[#c08a3e]/60" : ""
    } bg-[#4d6350]/[0.04]`.trim(),
  };

  return (
    <div className="mt-1 flex w-full basis-full items-start gap-1.5">
      <span
        aria-hidden="true"
        className="mt-1.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-[#4d6350]/80 uppercase"
      >
        EN
      </span>
      {as === "textarea" ? (
        cresce ? (
          <TextareaQueCresce {...comuns} />
        ) : (
          <textarea {...comuns} rows={rows ?? 2} />
        )
      ) : (
        <input {...comuns} type="text" />
      )}
    </div>
  );
}
