export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQS: FAQItem[] = [
  {
    question: "Que tipo de eventos organizam?",
    answer:
      "Organizamos casamentos, eventos corporativos, conferências, festas privadas, batizados, aniversários e jantares de gala. Cada evento é planeado à medida do cliente.",
  },
  {
    question: "Em que zonas atuam?",
    answer: "Atuamos em todo o território nacional, incluindo Lisboa, Alentejo e Algarve.",
  },
  {
    question: "Com quanto tempo de antecedência devo reservar?",
    answer:
      "Recomendamos o máximo de antecedência possível. Para casamentos, idealmente 6 a 12 meses; para eventos corporativos, 2 a 3 meses.",
  },
  {
    question: "Fazem orçamentos personalizados?",
    answer:
      "Sim. Cada evento é único, por isso elaboramos sempre um orçamento personalizado e adaptado às suas necessidades e ao seu orçamento disponível.",
  },
  {
    question: "Trabalham com fornecedores próprios?",
    answer:
      "Sim, temos uma rede de fornecedores de confiança — catering, decoração, fotografia, música e muito mais — mas também trabalhamos com os seus fornecedores preferidos.",
  },
];
