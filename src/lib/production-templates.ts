/**
 * Decor production timeline templates for the atelier. Used to seed a quote's
 * production plan (checklist) with one click, from Sourcing through Strike.
 * Each phase carries concrete PT tasks; the flattened form tags every item with
 * its phase so the plan can be grouped and progress shown per phase.
 *
 * Client-safe (sem `server-only`): tanto o painel `ProductionPlan` como o
 * endpoint de aceitação da proposta importam daqui, para o seed do servidor
 * ficar byte-a-byte igual ao seed feito na UI.
 */

import type { ChecklistItem } from "@/lib/orcamento/types";

export interface ProductionPhase {
  key: string;
  label: string;
  tasks: string[];
}

export const DECOR_PRODUCTION: ProductionPhase[] = [
  {
    key: "sourcing",
    label: "Sourcing",
    tasks: [
      "Encomendar flores ao fornecedor",
      "Encomendar adereços e material decorativo",
      "Confirmar disponibilidade de espécies e cores",
      "Orçamentar flores e adereços",
      "Confirmar prazos de entrega no atelier",
    ],
  },
  {
    key: "condicionamento",
    label: "Condicionamento",
    tasks: [
      "Receber e conferir flores 24-48h antes",
      "Condicionar flores (hidratação e câmara fria)",
      "Preparar e higienizar recipientes e vasos",
      "Preparar espuma floral e suportes",
    ],
  },
  {
    key: "montagem",
    label: "Montagem/Pré-produção",
    tasks: [
      "Montar arranjos florais no atelier",
      "Preparar estruturas e cenografia",
      "Etiquetar e organizar peças por zona",
      "Rever plano de decoração com a equipa",
    ],
  },
  {
    key: "instalacao",
    label: "Instalação no local",
    tasks: [
      "Transportar material para o local",
      "Montar decoração da cerimónia",
      "Montar decoração do jantar e mesas",
      "Montar decoração do bar e zonas de lounge",
      "Instalar e afinar iluminação decorativa",
    ],
  },
  {
    key: "strike",
    label: "Desmontagem/Strike",
    tasks: [
      "Recolher material e arranjos após o evento",
      "Limpeza das zonas intervencionadas",
      "Inventário de retorno ao atelier",
      "Devolver material alugado ao fornecedor",
    ],
  },
];

/**
 * Flattens the decor production template into checklist-ready items tagged by
 * phase. Each entry carries the phase key + label so the plan view can group
 * items and the seeded label can be prefixed with the phase.
 */
export function buildProductionChecklist(): {
  phase: string;
  label: string;
  done: boolean;
}[] {
  return DECOR_PRODUCTION.flatMap((phase) =>
    phase.tasks.map((task) => ({
      phase: phase.label,
      label: task,
      done: false,
    })),
  );
}

/** Separador entre a fase e a tarefa no label do item (ex.: "Sourcing · …").
    Fonte única, para o agrupamento por fase e o seed nunca divergirem. */
export const PRODUCTION_PHASE_SEP = " · ";

/** Compõe o label de um item de produção com o prefixo da fase. */
export const productionPhaseLabel = (phase: string, task: string) =>
  `${phase}${PRODUCTION_PHASE_SEP}${task}`;

/**
 * Transforma o template de produção decor em `ChecklistItem[]` prontos a gravar
 * (cada item prefixado com a sua fase). É a ÚNICA fonte deste transform: tanto o
 * botão "Aplicar plano" na UI como o auto-seed no aceite da proposta chamam aqui,
 * para um seed-servidor == seed-UI (sem drift).
 *
 * `makeId` gera o id de cada item (a UI passa o `randomId` do cliente; o servidor
 * passa um gerador próprio). `existingLabels`, quando fornecido, filtra labels já
 * presentes — reaplicar só acrescenta o que falta (idempotente).
 */
export function buildProductionPlanItems(
  makeId: () => string,
  existingLabels?: Set<string>,
): ChecklistItem[] {
  return buildProductionChecklist()
    .map((t) => ({ id: makeId(), label: productionPhaseLabel(t.phase, t.label), done: false }))
    .filter((t) => !existingLabels || !existingLabels.has(t.label));
}
