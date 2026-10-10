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
