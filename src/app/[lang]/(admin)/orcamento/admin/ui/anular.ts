"use client";

import { useCallback } from "react";
import { useToast } from "../Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «ANULAR» DA CASA — UM SÓ, IGUAL EM TODO O BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «tem que haver no site todo, em tudo aquilo que se
 * faz, uma forma de voltar atrás ou que seja reversível». A análise que se fez
 * a seguir está em `docs/TUDO-REVERSIVEL.md`.
 *
 * Quem faz um gesto chama `anular(«o que aconteceu», repor)`: aparece o aviso
 * com «Anular» durante `TOAST_ANULAR_MS` (10 s), e tocar nele corre `repor`.
 * `repor` é o gesto ao contrário, gravado no servidor como qualquer outro — com
 * a linha no histórico quando a acção a tem.
 *
 * Se o `repor` falhar, diz-se, com o erro que veio; nunca fica um «Anulado»
 * por cima de uma escrita que não aconteceu.
 */
export function useAnular() {
  const { toast } = useToast();
  return useCallback(
    (mensagem: string, repor: () => void | Promise<unknown>, anulado = "Anulado.") => {
      toast(mensagem, "success", {
        rotulo: "Anular",
        aoTocar: () => {
          Promise.resolve()
            .then(repor)
            .then(
              () => toast(anulado, "info"),
              (e: unknown) =>
                toast(
                  e instanceof Error && e.message ? e.message : "Não foi possível anular.",
                  "error",
                ),
            );
        },
      });
    },
    [toast],
  );
}
