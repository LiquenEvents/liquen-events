"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeloProposta, TipoModelo } from "@/lib/proposal-templates";

/**
 * MODELOS PARCIAIS — guardar e reutilizar UM grupo de serviços, ou UM mood
 * board, sem copiar a proposta inteira.
 *
 * ── Porque é que isto não é o mesmo que duplicar a proposta ───────────────
 * Duplicar serve quando a proposta nova é uma variação da anterior. Isto serve
 * para a outra metade do trabalho repetido: o bloco «Complementos dos Noivos»
 * é igual em todos os casamentos, e o mood board da cerimónia na igreja
 * também. Copiar a proposta toda para ir buscar um bloco obrigaria a apagar
 * tudo o resto — mais trabalho do que escrever de novo.
 *
 * ── É um menu e não um diálogo ───────────────────────────────────────────
 * Vive dentro da secção a que pertence, ao lado do «+ Adicionar». Um diálogo
 * a ecrã inteiro para escolher entre três blocos rouba o contexto de onde ela
 * está — e ela está a meio de uma lista, não a começar uma tarefa nova.
 */

interface Props {
  tipo: Extract<TipoModelo, "grupo" | "moodboard">;
  /** O que inserir quando ela escolhe um modelo. */
  onInserir: (conteudo: NonNullable<ModeloProposta["grupo"] | ModeloProposta["moodboard"]>) => void;
  /** O bloco que está neste momento em edição, para o poder guardar. */
  paraGuardar?: NonNullable<ModeloProposta["grupo"] | ModeloProposta["moodboard"]>;
  /** Um nome de partida para a caixa do nome (o título do grupo/board). */
  nomeSugerido?: string;
  toast?: (mensagem: string, tipo?: "success" | "error") => void;
  className?: string;
}

const ROTULO = {
  grupo: { um: "grupo", inserir: "De um modelo…", guardar: "Guardar como modelo" },
  moodboard: { um: "mood board", inserir: "De um modelo…", guardar: "Guardar como modelo" },
} as const;

export default function ModelosParciais({
  tipo,
  onInserir,
  paraGuardar,
  nomeSugerido,
  toast,
  className,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [modelos, setModelos] = useState<ModeloProposta[]>([]);
  const [aGuardar, setAGuardar] = useState(false);
  const [nome, setNome] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/propostas/modelos");
      const j = await r.json().catch(() => null);
      setModelos(
        Array.isArray(j?.modelos)
          ? (j.modelos as ModeloProposta[]).filter((m) => m.tipo === tipo)
          : [],
      );
    } catch {
      toast?.("Não deu para ler os modelos.", "error");
    }
  }, [tipo, toast]);

  // Fechar ao clicar fora e no Esc — as duas saídas que as pessoas tentam.
  useEffect(() => {
    if (!aberto && !aGuardar) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
        setAGuardar(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        setAGuardar(false);
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto, aGuardar]);

  async function guardar() {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch("/api/propostas/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: limpo,
          tipo,
          ...(tipo === "grupo" ? { grupo: paraGuardar } : { moodboard: paraGuardar }),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar.");
      setModelos((j.modelos as ModeloProposta[]).filter((m) => m.tipo === tipo));
      setAGuardar(false);
      setNome("");
      toast?.(`Modelo «${limpo}» guardado.`, "success");
    } catch (e) {
      toast?.(e instanceof Error ? e.message : "Não deu para guardar.", "error");
    }
  }

  // `alvo-toque` leva estes dois a 44 px no telemóvel sem lhes mudar o aspecto:
  // eram links de 16 px de altura, e num ecrã táctil isso é acertar numa linha
  // de texto. No computador continuam a ser o que eram.
  const botao =
    "alvo-toque py-2 text-xs text-foreground/50 underline-offset-2 hover:text-foreground/80 hover:underline";

  return (
    <div ref={caixa} className={`relative inline-flex items-center gap-3 ${className ?? ""}`}>
      <button
        type="button"
        className={botao}
        aria-expanded={aberto}
        onClick={() => {
          const vai = !aberto;
          setAberto(vai);
          setAGuardar(false);
          if (vai) void carregar();
        }}
      >
        {ROTULO[tipo].inserir}
      </button>

      {paraGuardar && (
        <button
          type="button"
          className={botao}
          onClick={() => {
            setAGuardar((v) => !v);
            setAberto(false);
            setNome(nomeSugerido ?? "");
          }}
        >
          {ROTULO[tipo].guardar}
        </button>
      )}

      {aberto && (
        <div className="absolute top-full left-0 z-30 mt-1 w-72 rounded-xl border border-foreground/10 bg-background p-1 shadow-lg">
          {modelos.length === 0 ? (
            <p className="px-3 py-2 text-xs text-foreground/50">
              Ainda não guardou nenhum {ROTULO[tipo].um}. Monte um e carregue em «Guardar como
              modelo».
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {modelos.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-foreground/[0.05]"
                    onClick={() => {
                      const conteudo = tipo === "grupo" ? m.grupo : m.moodboard;
                      // Um modelo sem conteúdo não pode passar por inserção
                      // bem sucedida: ela carregava e não acontecia nada.
                      if (!conteudo) {
                        toast?.("Esse modelo está vazio.", "error");
                        return;
                      }
                      // Cópia funda: inserir o mesmo objecto duas vezes fazia
                      // as duas cópias partilharem os itens, e editar uma
                      // mudava a outra.
                      onInserir(JSON.parse(JSON.stringify(conteudo)));
                      setAberto(false);
                    }}
                  >
                    {m.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aGuardar && (
        <div className="absolute top-full left-0 z-30 mt-1 w-72 rounded-xl border border-foreground/10 bg-background p-3 shadow-lg">
          <label className="block text-[11px] text-foreground/55" htmlFor={`mp-${tipo}`}>
            Nome do modelo
          </label>
          <input
            id={`mp-${tipo}`}
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder={tipo === "grupo" ? "Complementos dos noivos" : "Cerimónia na igreja"}
            className="bo-input mt-1 w-full px-2.5 py-1.5 text-xs"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={botao} onClick={() => setAGuardar(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#4d6350] px-3 py-1.5 text-xs text-white disabled:opacity-40"
              disabled={!nome.trim()}
              onClick={() => void guardar()}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
