import type { EventCategory } from "@/lib/orcamento/types";

/**
 * Production checklist templates, used to seed a quote's checklist with one
 * click. Picks a list based on the event category, plus a common baseline.
 */
const COMMON = [
  "Confirmar data e local",
  "Reunião de briefing com o cliente",
  "Enviar proposta",
  "Receber sinal",
  "Contratar fornecedores",
  "Plano de produção / cronograma",
  "Visita técnica ao espaço",
  "Confirmar número final de convidados",
  "Coordenação no dia do evento",
  "Faturação e saldo final",
  "Follow-up pós-evento",
];

const BY_CATEGORY: Record<EventCategory, string[]> = {
  particulares: [
    "Decoração floral",
    "Catering e menu (prova)",
    "Bolo / mesa de doces",
    "Música / DJ / banda",
    "Fotografia e vídeo",
    "Plano de mesas",
    "Convites e papelaria",
  ],
  empresas: [
    "Audiovisual e som",
    "Sinalética e branding",
    "Coffee breaks / catering",
    "Gestão de inscrições",
    "Credenciação de convidados",
    "Material de apoio / brindes",
  ],
};

export function checklistTemplate(category: EventCategory | null): string[] {
  const extra = category ? (BY_CATEGORY[category] ?? []) : [];
  return [...COMMON.slice(0, 6), ...extra, ...COMMON.slice(6)];
}
