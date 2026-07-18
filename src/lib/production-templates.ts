/**
 * Decor production timeline templates for the atelier. Used to seed a quote's
 * production plan (checklist) with one click, from Sourcing through Strike.
 * Each phase carries concrete PT tasks; the flattened form tags every item with
 * its phase so the plan can be grouped and progress shown per phase.
 */

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
