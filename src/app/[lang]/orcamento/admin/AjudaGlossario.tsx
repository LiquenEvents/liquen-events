"use client";

import { useEffect } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
}

// O percurso que cada trabalho faz, do primeiro contacto até ao dia do evento.
// Uma frase simples por etapa — para que os nomes do menu se sintam como um só
// processo, e não como separadores soltos.
const LIFECYCLE: { step: string; desc: string }[] = [
  {
    step: "Pedido",
    desc: "Alguém pede um orçamento. É a primeira conversa: quem é, que evento quer, para quando e para quantas pessoas.",
  },
  {
    step: "Proposta",
    desc: "Respondemos com uma sugestão de serviços e um preço. É o nosso “aqui está o que propomos, por este valor”.",
  },
  {
    step: "Contrato",
    desc: "O cliente aceita as condições por escrito. A partir daqui o evento está confirmado e reservamos a data.",
  },
  {
    step: "Fatura (sinal + saldo)",
    desc: "O pagamento costuma ser em duas partes: o sinal, para garantir a reserva, e o saldo, o resto, perto do evento.",
  },
  {
    step: "Evento",
    desc: "O grande dia. Tudo o que preparámos acontece — e no fim fica o registo para o histórico do cliente.",
  },
];

// Vocabulário do dia a dia, em linguagem simples. Os nomes coincidem com os que
// aparecem nos ecrãs (menu, estados dos pedidos, botões).
const GLOSSARY: { term: string; def: string }[] = [
  {
    term: "Pedido",
    def: "Um contacto de alguém que quer um orçamento. Cada pedido tem um estado que mostra em que ponto está: Novo, Em revisão, Proposta enviada, Ganho ou Perdido.",
  },
  {
    term: "Proposta",
    def: "O documento que enviamos ao cliente com os serviços sugeridos e o preço. É a nossa resposta a um pedido.",
  },
  {
    term: "Cotado / Proposta enviada",
    def: "O estado de um pedido a quem já mandámos uma proposta e estamos à espera de resposta. Nos ecrãs aparece como “Proposta enviada”.",
  },
  {
    term: "Contrato",
    def: "O acordo em que o cliente aceita as condições. Quando está aceite, o evento fica confirmado.",
  },
  {
    term: "Sinal",
    def: "A primeira parte do pagamento (habitualmente 30%), paga no início para reservar a data. Sem sinal, a data não fica garantida.",
  },
  {
    term: "Saldo",
    def: "O resto do pagamento (habitualmente 70%), pago mais perto do evento. Sinal + saldo = valor total.",
  },
  {
    term: "Fatura",
    def: "O documento oficial que pede um pagamento ao cliente. Pode ser do sinal, do saldo, ou uma fatura única com o valor todo.",
  },
  {
    term: "Recibo",
    def: "O comprovativo de que um pagamento já foi feito. A fatura pede; o recibo confirma que recebemos.",
  },
  {
    term: "Dossier",
    def: "A vista completa de um evento, tudo num só sítio: contacto, proposta, contrato, faturas e produção. É o “processo” do evento.",
  },
  {
    term: "Seguimento",
    def: "Um lembrete para voltar a falar com o cliente numa certa data — por exemplo, para não deixar uma proposta sem resposta. Se a data já passou, aparece “em atraso”.",
  },
  {
    term: "Pipeline",
    def: "O quadro que mostra todos os pedidos organizados por fase, em colunas. Serve para ver, num relance, em que ponto está cada trabalho.",
  },
  {
    term: "Convidados",
    def: "As pessoas que vão ao evento. O número de convidados influencia o espaço, a comida e o preço.",
  },
];

/**
 * Ajuda de entrada para quem começa: explica o percurso de um trabalho
 * (Pedido → Proposta → Contrato → Fatura → Evento) e traduz o vocabulário do
 * back-office em linguagem simples. Abre a partir do botão "?" na barra de topo.
 *
 * Espelha o ShortcutsModal: role="dialog"/aria-modal, foco levado para dentro e
 * devolvido ao fechar, fecha com Escape e ao clicar fora.
 */
export default function AjudaGlossario({ open, onClose }: Props) {
  // Trap Tab within the dialog + restore focus to the trigger on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ajuda e glossário"
        className="relative w-full max-w-2xl bg-white border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/[0.07]">
          <p className="bo-eyebrow">Ajuda e glossário</p>
          <button
            onClick={onClose}
            className="text-foreground/30 hover:text-foreground/60 transition-colors text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 max-h-[72vh] overflow-y-auto">
          {/* ── Como funciona ── */}
          <section>
            <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-1">
              Como funciona
            </p>
            <p className="text-foreground/45 text-sm mb-4">
              Cada trabalho faz sempre o mesmo percurso. Os nomes do menu são só as fases deste
              caminho:
            </p>
            <ol className="flex flex-col gap-3">
              {LIFECYCLE.map((it, i) => (
                <li key={it.step} className="flex gap-3">
                  <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#4d6350]/12 text-[#4d6350] text-[11px] font-semibold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-foreground/75 text-sm font-medium">{it.step}</p>
                    <p className="text-foreground/50 text-sm leading-relaxed">{it.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="h-px bg-foreground/[0.07] my-6" />

          {/* ── Glossário ── */}
          <section>
            <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-4">
              Glossário — o que significa cada palavra
            </p>
            <dl className="flex flex-col gap-4">
              {GLOSSARY.map((it) => (
                <div key={it.term}>
                  <dt className="text-foreground/75 text-sm font-medium">{it.term}</dt>
                  <dd className="text-foreground/50 text-sm leading-relaxed">{it.def}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
