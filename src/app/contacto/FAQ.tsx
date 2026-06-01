"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Com quanto tempo de antecedência devo contactar?",
    a: "Para casamentos recomendamos pelo menos 12 meses de antecedência. Para eventos corporativos, 3 a 6 meses é o ideal. Para celebrações mais simples, 4 a 8 semanas é geralmente suficiente.",
  },
  {
    q: "Trabalham em todo o território nacional?",
    a: "Sim. Apesar de termos sede em Évora, trabalhamos em todo Portugal continental e ilhas. Temos uma vasta rede de fornecedores e parceiros em diversas regiões.",
  },
  {
    q: "Podem assumir apenas parte da organização?",
    a: "Absolutamente. Podemos tratar de tudo — da conceção à execução — ou assumir apenas áreas específicas como decoração, coordenação do dia, catering ou audiovisual. Adaptamos o serviço ao que precisa.",
  },
  {
    q: "Como funciona o processo de orçamentação?",
    a: "Após o primeiro contacto e uma conversa inicial (sem compromisso), preparamos uma proposta detalhada com orçamento transparente. Não há surpresas nem custos escondidos.",
  },
  {
    q: "Trabalham com diferentes orçamentos?",
    a: "Sim. Temos soluções para diferentes dimensões e orçamentos. O nosso compromisso é sempre oferecer o melhor resultado possível dentro das suas possibilidades, sem comprometer a qualidade.",
  },
  {
    q: "Fazem eventos com convidados internacionais?",
    a: "Sim, temos experiência em eventos com logística e convidados internacionais, incluindo tradução simultânea, alojamento e transfers.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      {faqs.map((faq, i) => (
        <div key={i} className="border-t border-foreground/8">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start justify-between gap-8 py-8 text-left group"
          >
            <span
              className={`text-sm lg:text-base leading-snug transition-colors duration-200 ${
                open === i ? "text-foreground" : "text-foreground/72 group-hover:text-foreground/80"
              }`}
            >
              {faq.q}
            </span>
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs transition-all duration-300 ${
                open === i
                  ? "border-moss text-moss rotate-45"
                  : "border-foreground/15 text-foreground/72"
              }`}
            >
              +
            </span>
          </button>
          <div
            className={`overflow-hidden transition-all duration-400 ease-in-out ${
              open === i ? "max-h-48 opacity-100 pb-8" : "max-h-0 opacity-0"
            }`}
          >
            <p className="text-foreground/42 text-sm leading-[1.9] max-w-2xl">{faq.a}</p>
          </div>
        </div>
      ))}
      <div className="border-t border-foreground/8" />
    </div>
  );
}
