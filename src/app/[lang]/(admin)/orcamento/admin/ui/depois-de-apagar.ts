"use client";

import { useCallback } from "react";
import { useToast } from "../Toast";
import { useAnular } from "./anular";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DEPOIS DE APAGAR: «ANULAR», QUE REPÕE A PARTIR DA RECICLAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase R3 de `docs/TUDO-REVERSIVEL.md`. Apagar passou a deixar a coisa 30 dias
 * na Reciclagem, e a rota diz como correu (`src/lib/reciclagem.ts`):
 *
 *  · `{ id }`  — está na Reciclagem: o aviso traz «Anular» (os 10 s da casa,
 *               `ui/anular.ts`), que a repõe tal e qual, com o mesmo id;
 *  · `false`  — a Reciclagem ainda não está ligada (a migração não correu):
 *               apagou de vez, e o aviso DI-LO em vez de prometer volta;
 *  · `null`   — já não existia: diz-se só o que se pediu.
 *
 * `depoisDeRepor` relê a lista do ecrã: o que volta tem o mesmo id, mas o
 * ecrã tirou-o, e só o servidor sabe como ficou.
 */
export function useDepoisDeApagar() {
  const anular = useAnular();
  const { toast } = useToast();
  return useCallback(
    (corpo: unknown, frase: string, depoisDeRepor?: () => void) => {
      const r = (corpo as { reciclagem?: { id?: unknown } | false | null } | null)?.reciclagem;
      if (r && typeof r === "object" && typeof r.id === "string") {
        const id = r.id;
        anular(
          `${frase} Fica 30 dias na Reciclagem.`,
          async () => {
            let res: Response;
            try {
              res = await fetch(`/api/reciclagem/${encodeURIComponent(id)}/repor`, {
                method: "POST",
              });
            } catch {
              toast("Sem ligação — não deu para repor. Está na Reciclagem.", "error");
              return false;
            }
            const resposta = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
              toast(resposta?.error ?? "Não deu para repor. Está na Reciclagem.", "error");
              return false;
            }
            depoisDeRepor?.();
            return true;
          },
          "Reposto.",
        );
        return;
      }
      if (r === false) {
        toast(`${frase} Apagado de vez: a Reciclagem ainda não está ligada.`, "info");
        return;
      }
      toast(frase, "success");
    },
    [anular, toast],
  );
}

const idDaEntrada = (corpo: unknown): string | null => {
  const r = (corpo as { reciclagem?: { id?: unknown } | false | null } | null)?.reciclagem;
  return r && typeof r === "object" && typeof r.id === "string" ? r.id : null;
};
const apagouDeVez = (corpo: unknown) =>
  (corpo as { reciclagem?: unknown } | null)?.reciclagem === false;

/**
 * O mesmo, para um gesto que apagou VÁRIOS (pedidos marcados, fotos
 * escolhidas): UM aviso, e um «Anular» que os repõe todos. Se algum não
 * voltar, diz quantos — e o que não voltou continua na Reciclagem.
 *
 * `depoisDeRepor` recebe as posições (em `corpos`) dos que voltaram, para o
 * ecrã os pôr de volta onde estavam.
 */
export function useDepoisDeApagarVarios() {
  const anular = useAnular();
  const { toast } = useToast();
  return useCallback(
    (corpos: unknown[], frase: string, depoisDeRepor?: (repostos: number[]) => void) => {
      const entradas = corpos
        .map((c, indice) => ({ indice, id: idDaEntrada(c) }))
        .filter((e): e is { indice: number; id: string } => !!e.id);
      if (entradas.length > 0) {
        anular(
          `${frase} ${entradas.length === 1 ? "Fica" : "Ficam"} 30 dias na Reciclagem.`,
          async () => {
            const voltou = await Promise.all(
              entradas.map((e) =>
                fetch(`/api/reciclagem/${encodeURIComponent(e.id)}/repor`, { method: "POST" })
                  .then((r) => r.ok)
                  .catch(() => false),
              ),
            );
            const repostos = entradas.filter((_, i) => voltou[i]).map((e) => e.indice);
            if (repostos.length > 0) depoisDeRepor?.(repostos);
            const falharam = entradas.length - repostos.length;
            if (falharam === 0) return true;
            toast(
              repostos.length === 0
                ? "Não deu para repor. Está na Reciclagem."
                : `${repostos.length} reposto(s); ${falharam} não — está(ão) na Reciclagem.`,
              "error",
            );
            return false;
          },
          "Reposto.",
        );
        return;
      }
      if (corpos.some(apagouDeVez)) {
        toast(`${frase} Apagado de vez: a Reciclagem ainda não está ligada.`, "info");
        return;
      }
      toast(frase, "success");
    },
    [anular, toast],
  );
}
