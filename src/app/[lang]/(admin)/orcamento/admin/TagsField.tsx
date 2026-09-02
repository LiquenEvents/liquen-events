"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useToast } from "./Toast";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";

interface Props {
  quote: Quote;
  /** All tags already used across quotes — powers the add-suggestions. */
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Free-form labels on a quote. Persists immediately (like the checklist), and
 * suggests tags already in use so the vocabulary stays consistent rather than
 * sprouting near-duplicates.
 */
export default function TagsField({ quote, suggestions, onChange }: Props) {
  const { toast } = useToast();
  const [tags, setTags] = useState<string[]>(quote.tags ?? []);
  const [input, setInput] = useState("");
  const id = useId();
  /** Número de ordem da última gravação lançada (ver `persist`). */
  const ordem = useRef(0);
  /** A última lista que o servidor aceitou — o único sítio seguro para onde
   *  voltar quando uma gravação falha. */
  const confirmado = useRef<string[]>(quote.tags ?? []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A ETIQUETA QUE DESAPARECE DO ECRÃ SEM NINGUÉM DIZER QUE DESAPARECEU
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A gravação é optimista: a etiqueta aparece já e, se o servidor recusar, é
   * RETIRADA do ecrã outra vez. O aviso dizia «Não foi possível guardar as
   * etiquetas» — nem nomeava a etiqueta, nem dizia a única coisa que ela
   * acabou de ver acontecer: a que escreveu sumiu-se sozinha à frente dela.
   *
   * Quem lê um aviso que não fala do que se mexeu no ecrã não liga as duas
   * coisas — julga que a lista está como a deixou e volta lá meia hora depois
   * sem a etiqueta.
   */
  function reverter(falha: Falha) {
    setTags(confirmado.current);
    onChange(confirmado.current);
    // A frase da reversão vem a seguir à instrução e não antes: o `porqueFalhou`
    // já acaba em «repete» ou «volta a entrar», e o que se acrescenta é o
    // recado sobre o ecrã, não outra coisa para fazer.
    toast(`${falha.mensagem} A lista de etiquetas voltou à que está gravada.`, "error");
  }

  async function persist(next: string[], oQue: string) {
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    //
    // ── PORQUE É QUE A REVERSÃO NÃO PODE SER «O QUE ESTAVA ANTES DE MIM» ────
    // Escrever duas etiquetas a seguir uma à outra lança duas gravações que se
    // atropelam, e cada uma manda a lista INTEIRA. A segunda já levou as duas e
    // foi aceite; a primeira, ao falhar, repunha o ecrã como estava antes das
    // duas — apagava da vista (e da cópia do pedido no painel) uma etiqueta que
    // o servidor tinha guardado, e a etiqueta seguinte gravava por cima da
    // lista já sem ela.
    //
    // Daí as duas marcas: só a ÚLTIMA gravação pode mexer no ecrã, e o que ela
    // repõe é o último estado CONFIRMADO pelo servidor — nunca uma lista
    // intermédia que nunca lá chegou.
    const minha = ++ordem.current;
    setTags(next);
    onChange(next);
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
    } catch {
      if (minha !== ordem.current) return;
      reverter(porqueRebentou(oQue));
      return;
    }
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      if (minha !== ordem.current) return;
      reverter(porqueFalhou(oQue, res, corpo));
      return;
    }
    if (minha === ordem.current) confirmado.current = next;
  }

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    // Case-insensitive de-dupe so "VIP" and "vip" don't both stick.
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setInput("");
      return;
    }
    void persist([...tags, t], `pôr a etiqueta «${t}» em «${quote.name}»`);
    setInput("");
  }
  function remove(t: string) {
    void persist(
      tags.filter((x) => x !== t),
      `tirar a etiqueta «${t}» de «${quote.name}»`,
    );
  }

  // Suggestions not yet applied to this quote, filtered by what's typed.
  const open = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 6);
  }, [suggestions, tags, input]);

  return (
    <div>
      <label htmlFor={id} className="bo-eyebrow mb-2 block">
        Etiquetas
      </label>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#4d6350]/10 text-[#4d6350] text-[11px] font-medium"
          >
            {t}
            <button
              onClick={() => remove(t)}
              className="text-[#4d6350]/50 hover:text-[#4d6350] transition-colors leading-none"
              aria-label={`Remover etiqueta ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-foreground/25 text-xs">Sem etiquetas.</span>}
      </div>
      <input
        id={id}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(input);
          }
        }}
        placeholder="Adicionar etiqueta e Enter…"
        className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
        list={`tag-suggestions-${quote.id}`}
      />
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {open.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="px-2.5 py-1 rounded-full bg-[var(--bo-tinta-6)] text-foreground/45 text-[11px] hover:bg-[var(--bo-tinta-10)] hover:text-foreground/70 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
