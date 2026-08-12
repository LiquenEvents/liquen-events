"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PropItem } from "@/lib/inventory-types";
import { Button } from "./ui";

/**
 * MODO DE CARGA — o inventário para quem está de pé numa quinta a encher a
 * carrinha.
 *
 * ── Porque é que isto não é a mesma lista com letra maior ───────────────────
 * A lista normal do inventário é para GERIR: editar quantidades, corrigir
 * estados, exportar. Aqui a tarefa é outra e é uma só — **percorrer e ir
 * riscando** —, com uma mão, o telemóvel numa e uma caixa na outra, sol no ecrã
 * e a carrinha meio cheia. Tudo o que não seja riscar é ruído.
 *
 * Por isso: a LINHA INTEIRA é o alvo (não há um quadrado de 20 px para
 * acertar), o contador está sempre à vista, e não há nada mais no ecrã.
 *
 * ── Funciona sem rede, e é o ponto principal ────────────────────────────────
 * O que está riscado vive no PRÓPRIO TELEMÓVEL (`localStorage`), não no
 * servidor. Não é uma limitação — é a decisão:
 *
 *  · numa quinta a rede falha, e uma lista de carga que precise de rede é uma
 *    lista que não serve exactamente quando é precisa;
 *  · riscar 40 caixas não são 40 pedidos a esperar por uma rede que não há;
 *  · e isto NÃO é um registo do negócio. É uma sessão de trabalho: o que
 *    interessa é não perder o que já se riscou até a carrinha estar cheia.
 *
 * Sobrevive a fechar o browser, a ficar sem bateria e a perder a rede. O que
 * não faz — e está dito no ecrã — é aparecer no computador do escritório.
 */

const CHAVE = "liquen-modo-carga";

/** Lê o que já estava riscado. Um `localStorage` indisponível (janela privada)
 *  vale como "nada riscado", nunca como um ecrã partido. */
function lerRiscados(): Set<string> {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function guardarRiscados(ids: Set<string>): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify([...ids]));
  } catch {
    // Perder a marcação é mau; deitar o ecrã abaixo a meio de uma carga é pior.
  }
}

/** Está sem rede AGORA? Só para o dizer — nada aqui depende da resposta. */
function useSemRede(): boolean {
  const [sem, setSem] = useState(false);
  useEffect(() => {
    const ver = () => setSem(typeof navigator !== "undefined" && navigator.onLine === false);
    ver();
    window.addEventListener("online", ver);
    window.addEventListener("offline", ver);
    return () => {
      window.removeEventListener("online", ver);
      window.removeEventListener("offline", ver);
    };
  }, []);
  return sem;
}

export interface ModoDeCargaProps {
  /** Os itens que estão a ser mostrados — já filtrados pela procura e pela
   *  categoria. Carregar a carrinha é sempre sobre um subconjunto. */
  itens: readonly PropItem[];
  onSair: () => void;
}

export default function ModoDeCarga({ itens, onSair }: ModoDeCargaProps) {
  // Começa vazio nos dois lados (servidor e primeiro desenho) e só depois lê o
  // que estava guardado — senão o HTML do servidor e o do browser divergiam.
  const [riscados, setRiscados] = useState<Set<string>>(() => new Set());
  useEffect(() => setRiscados(lerRiscados()), []);
  const semRede = useSemRede();

  const alternar = useCallback((id: string) => {
    setRiscados((prev) => {
      const nova = new Set(prev);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      guardarRiscados(nova);
      return nova;
    });
  }, []);

  // Conta só o que está NA LISTA à frente dela. Se contasse tudo o que alguma
  // vez foi riscado, o "12 de 34" mentia assim que se mudasse de categoria.
  const feitos = useMemo(() => itens.filter((i) => riscados.has(i.id)).length, [itens, riscados]);
  const total = itens.length;
  const completo = total > 0 && feitos === total;

  return (
    <div className="pb-24">
      {/* O contador acompanha o scroll. Numa lista de 40 itens, ter de subir ao
          topo para saber quanto falta é o que faz perder a conta. */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-foreground/[0.08] bg-[var(--bo-surface,#ffffff)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onSair}>
            ← Sair
          </Button>
          <div className="min-w-0 flex-1">
            <p role="status" className="text-lg font-medium text-foreground/85">
              {feitos} de {total} carregados
            </p>
            {semRede && (
              <p className="text-xs text-[#8a6d2f]">Sem rede — a lista continua a funcionar</p>
            )}
          </div>
          {feitos > 0 && (
            <button
              type="button"
              onClick={() => {
                setRiscados(new Set());
                guardarRiscados(new Set());
              }}
              className="alvo-toque shrink-0 px-3 py-2 text-xs text-foreground/50 underline underline-offset-2"
            >
              Limpar
            </button>
          )}
        </div>
        {/* Barra de progresso: ao sol, um número pequeno lê-se mal; uma barra
            cheia vê-se de relance. */}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            className="h-full rounded-full bg-[#4d6350] transition-[width] duration-200"
            style={{ width: total ? `${(feitos / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {completo && (
        <p className="mb-3 rounded-xl bg-[#e7efe4] px-4 py-3 text-sm text-[#3a5c39]">
          Está tudo carregado.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {itens.map((i) => {
          const feito = riscados.has(i.id);
          return (
            <li key={i.id}>
              {/* A LINHA INTEIRA é o alvo. Um quadrado de 20 px num ecrã ao sol,
                  com a outra mão ocupada, é onde se falha o toque — e falhar
                  aqui rebenta a contagem, que é a única coisa que este ecrã tem
                  de acertar. */}
              <button
                type="button"
                onClick={() => alternar(i.id)}
                aria-pressed={feito}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition-colors ${
                  feito
                    ? "border-[#4d6350]/40 bg-[#e7efe4]"
                    : "border-foreground/[0.1] bg-white active:bg-foreground/[0.04]"
                }`}
                // 64 px: bem acima do mínimo de 44, porque aqui não se está
                // sentado nem a olhar com atenção.
                style={{ minHeight: 64 }}
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                    feito ? "border-[#4d6350] bg-[#4d6350] text-white" : "border-foreground/25"
                  }`}
                >
                  {feito && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-base ${
                      feito ? "text-foreground/45 line-through" : "text-foreground/85"
                    }`}
                  >
                    {i.name}
                  </span>
                  <span className="bo-text-muted block truncate text-xs">{i.category}</span>
                </span>
                {/* A quantidade é o que se conta ao carregar, e por isso é o
                    número maior da linha depois do nome. */}
                <span
                  className={`shrink-0 text-xl tabular-nums ${
                    feito ? "text-foreground/35" : "text-foreground/70"
                  }`}
                >
                  {i.quantity}
                  {i.unit ? <span className="text-xs"> {i.unit}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {itens.length === 0 && (
        <p className="bo-text-muted px-1 py-6 text-sm">
          Nada nesta lista. Ajusta a procura ou a categoria antes de entrar no modo de carga.
        </p>
      )}

      <p className="bo-text-muted mt-6 px-1 text-xs leading-relaxed">
        O que está riscado fica <strong>neste telemóvel</strong> — sobrevive a fechar o browser e a
        ficar sem rede, mas não aparece no computador do escritório. É uma lista de carga, não um
        registo do inventário.
      </p>
    </div>
  );
}
