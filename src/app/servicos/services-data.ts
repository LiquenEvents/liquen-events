/**
 * Dedicated service pages content. Each entry powers /servicos/[slug] with
 * SEO-rich, location-aware copy and imagery. Keep the slugs stable — they
 * are part of the public URLs and the sitemap.
 */

export interface ServiceDetail {
  slug: string;
  eyebrow: string;
  title: string; // H1 on the page
  metaTitle: string; // <title>
  metaDescription: string;
  keywords: string[];
  hero: string; // hero image
  intro: string[]; // intro paragraphs (keyword-rich)
  includes: string[]; // what's included
  gallery: string[]; // supporting images
  faqs: { q: string; a: string }[];
  related: string[]; // slugs of related services
}

export const SERVICES: ServiceDetail[] = [
  {
    slug: "casamentos",
    eyebrow: "Wedding Planning",
    title: "Organização de Casamentos no Alentejo e em Portugal",
    metaTitle: "Wedding Planner em Évora e Alentejo — Organização de Casamentos",
    metaDescription:
      "Wedding planner em Évora e no Alentejo. Organizamos casamentos completos — decoração floral, catering, coordenação do dia — em herdades, quintas e espaços únicos de todo o Portugal.",
    keywords: [
      "wedding planner Alentejo",
      "wedding planner Évora",
      "organização de casamentos Alentejo",
      "casamentos Évora",
      "casamento herdade Alentejo",
      "wedding planner Portugal",
    ],
    hero: "/imagens/DaniGui_Preview18.jpg",
    intro: [
      "O vosso casamento é único — e merece ser planeado ao pormenor. A Líquen Events é wedding planner em Évora e organiza casamentos em todo o Alentejo e Portugal, das herdades e quintas históricas aos espaços mais íntimos.",
      "Acompanhamos o casal do primeiro esboço ao último brinde: conceito e estética, escolha do espaço, decoração floral, catering, música, papelaria e coordenação completa do grande dia. Cada detalhe pensado para que só tenham de viver o momento.",
    ],
    includes: [
      "Wedding planning completo (full planning)",
      "Coordenação do dia (day coordination)",
      "Decoração floral e cenografia",
      "Seleção de espaço e fornecedores",
      "Catering e prova de menu",
      "Plano de mesas e papelaria",
    ],
    gallery: [
      "/imagens/DaniGui_Preview20.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
      "/imagens/M&F0497.jpg",
      "/imagens/Natalia e Jonathan-167.jpg",
    ],
    faqs: [
      {
        q: "Com quanto tempo de antecedência devo contratar um wedding planner?",
        a: "Recomendamos pelo menos 12 meses de antecedência para casamentos, sobretudo se o espaço for muito procurado. Para casamentos mais íntimos, conseguimos organizar em prazos mais curtos.",
      },
      {
        q: "Organizam casamentos fora do Alentejo?",
        a: "Sim. Apesar de termos sede em Évora, organizamos casamentos em todo o Portugal continental e ilhas, com uma rede de fornecedores de confiança em várias regiões.",
      },
    ],
    related: ["jantares-de-gala", "eventos-corporativos"],
  },
  {
    slug: "eventos-corporativos",
    eyebrow: "Para Empresas",
    title: "Eventos Corporativos em Évora e Lisboa",
    metaTitle: "Eventos Corporativos em Évora e Lisboa — Conferências e Empresas",
    metaDescription:
      "Organização de eventos corporativos em Évora, Lisboa e todo o Portugal: conferências, congressos, teambuilding, lançamentos de produto e jantares de empresa. Produção completa e chave na mão.",
    keywords: [
      "eventos corporativos Évora",
      "eventos corporativos Lisboa",
      "organização de conferências",
      "congressos Portugal",
      "teambuilding empresas",
      "jantar de empresa",
    ],
    hero: "/imagens/EW1_1408.jpg",
    intro: [
      "Elevamos a imagem da sua marca através de eventos corporativos que transformam equipas e celebram conquistas. A Líquen Events organiza conferências, congressos, teambuildings e jantares de empresa em Évora, Lisboa e em todo o Portugal.",
      "Da logística ao audiovisual, da gestão de inscrições à coordenação no local, tratamos de tudo com o rigor que um evento profissional exige — para que a sua empresa se foque apenas nos resultados.",
    ],
    includes: [
      "Conferências e congressos",
      "Teambuilding e ativações de equipa",
      "Lançamentos de produto",
      "Jantares de empresa e gala awards",
      "Audiovisual, palco e cenografia",
      "Gestão de inscrições e credenciação",
    ],
    gallery: [
      "/imagens/EW1_1330.jpg",
      "/imagens/EW1_0697.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/20_10_2025_0295.jpg",
    ],
    faqs: [
      {
        q: "Organizam eventos de empresa em Lisboa?",
        a: "Sim. Produzimos eventos corporativos em Lisboa, Évora e em todo o país, com equipa e fornecedores em diferentes regiões.",
      },
      {
        q: "Tratam de eventos com convidados internacionais?",
        a: "Sim, temos experiência em eventos com logística internacional, incluindo tradução simultânea, alojamento e transfers.",
      },
    ],
    related: ["casamentos", "jantares-de-gala"],
  },
  {
    slug: "festas-e-aniversarios",
    eyebrow: "Celebrações Privadas",
    title: "Festas de Aniversário e Celebrações Privadas",
    metaTitle: "Festas de Aniversário e Celebrações Privadas no Alentejo",
    metaDescription:
      "Organização de festas de aniversário, batizados, comunhões e celebrações privadas em Évora e no Alentejo. Conceito, decoração, catering e entretenimento à medida.",
    keywords: [
      "festas de aniversário Évora",
      "organização de festas Alentejo",
      "batizados Évora",
      "festa privada Alentejo",
      "celebrações privadas Portugal",
    ],
    hero: "/imagens/DaniGui_JantarFesta_1.jpg",
    intro: [
      "Cada celebração é uma história. Organizamos festas de aniversário, batizados, comunhões e celebrações privadas em Évora, no Alentejo e em todo o Portugal — temáticas ou clássicas, íntimas ou de grande escala.",
      "Do conceito à decoração, do catering ao entretenimento, criamos momentos memoráveis com a atenção ao detalhe que distingue a Líquen Events.",
    ],
    includes: [
      "Festas de aniversário (todas as idades)",
      "Batizados e comunhões",
      "Conceito temático e decoração completa",
      "Catering, bolo e mesa de doces",
      "Animação e entretenimento",
      "Coordenação total no dia",
    ],
    gallery: [
      "/imagens/DaniGui_JantarFesta_11.jpg",
      "/imagens/DaniGui_JantarFesta_27.jpg",
      "/imagens/DaniGui_JantarFesta_17.jpg",
      "/imagens/DaniGui_Adois_57.jpg",
    ],
    faqs: [
      {
        q: "Organizam festas pequenas e íntimas?",
        a: "Sim. Adaptamo-nos a qualquer dimensão — de celebrações familiares íntimas a grandes festas — sempre com o mesmo cuidado.",
      },
    ],
    related: ["casamentos", "jantares-de-gala"],
  },
  {
    slug: "jantares-de-gala",
    eyebrow: "Eventos Sociais",
    title: "Jantares de Gala e Eventos Sociais de Prestígio",
    metaTitle: "Jantares de Gala e Eventos Sociais — Évora e Portugal",
    metaDescription:
      "Organização de jantares de gala e eventos sociais de prestígio em Évora, Lisboa e Portugal. Ambiente sofisticado, mesa posta premium e coordenação impecável.",
    keywords: [
      "jantar de gala Portugal",
      "eventos sociais de prestígio",
      "jantar de gala Évora",
      "gala awards",
      "evento de prestígio Alentejo",
    ],
    hero: "/imagens/JOAO_E_PEDRO_IMGL2180.jpg",
    intro: [
      "Para os momentos que pedem sofisticação, organizamos jantares de gala e eventos sociais de prestígio em Évora, Lisboa e por todo o Portugal.",
      "Mesa posta premium, chef convidado, wine pairing e animação ao vivo — uma experiência cuidada ao pormenor, com a coordenação impecável que um evento de gala exige.",
    ],
    includes: [
      "Mesa posta e decoração premium",
      "Chef convidado e menu de autor",
      "Wine pairing",
      "Cenografia e iluminação",
      "Animação e entretenimento",
      "Coordenação integral do evento",
    ],
    gallery: [
      "/imagens/JOAO_E_PEDRO_1Y1A3170.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/M&F0512.jpg",
      "/imagens/DaniGui_JantarFesta_18.jpg",
    ],
    faqs: [],
    related: ["eventos-corporativos", "casamentos"],
  },
];

export function getService(slug: string): ServiceDetail | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
