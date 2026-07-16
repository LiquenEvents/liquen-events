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
    eyebrow: "Decoração e Coordenação de Casamentos",
    title: "Decoração de Casamentos no Alentejo e em Portugal",
    metaTitle: "Decoração de Casamentos no Alentejo — Líquen Events",
    metaDescription:
      "Decoração de casamentos no Alentejo — decoração floral e cenografia à medida, com coordenação do dia para viverem o grande dia sem preocupações. Em herdades, quintas e espaços únicos de todo o Portugal.",
    keywords: [
      "decoração de casamentos Alentejo",
      "decoração de casamentos",
      "coordenação de casamentos Alentejo",
      "casamento herdade Alentejo",
      "wedding decoration Alentejo",
    ],
    hero: "/imagens/EW1_1100.jpg",
    intro: [
      "O vosso casamento é único — e a decoração é o que lhe dá alma. A Líquen Events cria a decoração do vosso casamento em todo o Alentejo e Portugal, das herdades e quintas históricas aos espaços mais íntimos: conceito, flores e cenografia pensados ao pormenor.",
      "E no grande dia coordenamos tudo — cronograma, fornecedores, montagem e imprevistos — para que só tenham de viver o momento.",
    ],
    includes: [
      "Decoração floral e cenografia",
      "Conceito e design decorativo",
      "Montagem e styling do espaço",
      "Coordenação do dia do casamento",
      "Cronograma e articulação de fornecedores",
      "Supervisão da montagem no dia",
    ],
    gallery: [
      "/imagens/DaniGui_Preview20.jpg",
      "/imagens/matilde-tomas-27.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL4226.jpg",
      "/imagens/ines-goncalo-421.jpg",
      "/imagens/M&F0678.jpg",
      "/imagens/stephanie-mizio-760.jpg",
    ],
    faqs: [
      {
        q: "Com quanto tempo de antecedência devo contratar a decoração e coordenação?",
        a: "Idealmente alguns meses antes, para desenharmos a decoração e articularmos com os fornecedores. Mas conseguimos entrar mais perto da data, consoante a disponibilidade.",
      },
      {
        q: "Fazem casamentos fora do Alentejo?",
        a: "Sim. Decoramos e coordenamos casamentos em todo o Portugal continental e ilhas, em articulação com os fornecedores de cada região.",
      },
    ],
    related: ["jantares-de-gala", "festas-e-aniversarios"],
  },
  {
    slug: "eventos-corporativos",
    eyebrow: "Para Empresas",
    title: "Eventos Corporativos em Lisboa",
    metaTitle: "Eventos Corporativos em Lisboa e Conferências",
    metaDescription:
      "Organização de eventos corporativos em Lisboa e todo o Portugal: conferências, congressos, teambuilding, lançamentos de produto e jantares de empresa. Produção completa e chave na mão.",
    keywords: [
      "eventos corporativos Lisboa",
      "organização de conferências",
      "congressos Portugal",
      "teambuilding empresas",
      "jantar de empresa",
    ],
    hero: "/imagens/EW1_1332.jpg",
    intro: [
      "Elevamos a imagem da sua marca através de eventos corporativos que transformam equipas e celebram conquistas. A Líquen Events organiza conferências, congressos, teambuildings e jantares de empresa em Lisboa e em todo o Portugal.",
      "Da logística ao audiovisual, da gestão de inscrições à coordenação no local, tratamos de tudo com o rigor que um evento profissional exige — para que a sua empresa se foque apenas nos resultados.",
    ],
    includes: [
      "Conferências e congressos",
      "Teambuilding e ativações de equipa",
      "Lançamentos de produto",
      "Jantares de empresa e galas de prémios",
      "Audiovisual, palco e cenografia",
      "Gestão de inscrições e credenciação",
    ],
    gallery: [
      "/imagens/EW1_1330.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/hd-edited.jpg",
    ],
    faqs: [
      {
        q: "Organizam eventos de empresa em Lisboa?",
        a: "Sim. Produzimos eventos corporativos em Lisboa e em todo o país, com equipa e fornecedores em diferentes regiões.",
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
    metaTitle: "Festas de Aniversário e Celebrações Privadas",
    metaDescription:
      "Organização de festas de aniversário, batizados, comunhões e celebrações privadas no Alentejo. Conceito, decoração, catering e entretenimento à medida.",
    keywords: [
      "organização de festas Alentejo",
      "festa privada Alentejo",
      "celebrações privadas Portugal",
    ],
    hero: "/imagens/DaniGui_JantarFesta_130.jpg",
    intro: [
      "Cada celebração é uma história. Organizamos festas de aniversário, batizados, comunhões e celebrações privadas no Alentejo e em todo o Portugal — temáticas ou clássicas, íntimas ou de grande escala.",
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
      "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
      "/imagens/DaniGui_JantarFesta_26.jpg",
      "/imagens/DaniGui_JantarFesta_27.jpg",
      "/imagens/DaniGui_JantarFesta_6.jpg",
      "/imagens/DaniGui_JantarFesta_17.jpg",
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
    metaTitle: "Jantares de Gala e Eventos Sociais",
    metaDescription:
      "Organização de jantares de gala e eventos sociais de prestígio em Lisboa e Portugal. Ambiente sofisticado, mesa posta premium e coordenação impecável.",
    keywords: [
      "jantar de gala Portugal",
      "eventos sociais de prestígio",
      "galas de prémios",
      "evento de prestígio Alentejo",
    ],
    hero: "/imagens/J&P-IMGL3188.jpg",
    intro: [
      "Para os momentos que pedem sofisticação, organizamos jantares de gala e eventos sociais de prestígio em Lisboa e por todo o Portugal.",
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
      "/imagens/stephanie-mizio-838.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
      "/imagens/Natalia e Jonathan-198.jpg",
      "/imagens/stephanie-mizio-564.jpg",
      "/imagens/M&F0512.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A3170.jpg",
    ],
    faqs: [],
    related: ["eventos-corporativos", "casamentos"],
  },
];

/**
 * English overrides for the visible copy (eyebrow, H1 title, intro, includes,
 * FAQs). metaTitle/metaDescription/keywords stay Portuguese — PT is the
 * canonical, indexed language; the EN versions are a reading option.
 */
type ServiceCopy = Pick<
  ServiceDetail,
  "eyebrow" | "title" | "intro" | "includes" | "faqs" | "metaTitle" | "metaDescription"
>;

const SERVICES_EN: Record<string, ServiceCopy> = {
  casamentos: {
    eyebrow: "Wedding Decoration & Coordination",
    title: "Wedding Decoration in the Alentejo and across Portugal",
    metaTitle: "Wedding Decoration in the Alentejo — Líquen Events",
    metaDescription:
      "Wedding decoration in the Alentejo — bespoke floral design and scenography, with day-of coordination so you can simply enjoy your day, at estates, quintas and unique venues across Portugal.",
    intro: [
      "Your wedding is one of a kind — and the decoration is what gives it soul. Líquen Events creates your wedding's decoration throughout the Alentejo and Portugal, from historic estates and quintas to the most intimate venues: concept, flowers and scenography considered down to the last detail.",
      "And on the day, we coordinate everything — timeline, suppliers, setup and the unexpected — so all you have to do is live the moment.",
    ],
    includes: [
      "Floral décor and scenography",
      "Concept and decorative design",
      "Setup and venue styling",
      "Wedding day coordination",
      "Timeline and supplier liaison",
      "On-the-day setup supervision",
    ],
    faqs: [
      {
        q: "How far in advance should I hire decoration and coordination?",
        a: "Ideally a few months before, so we can design the decoration and liaise with your suppliers. But we can come on board closer to the date, subject to availability.",
      },
      {
        q: "Do you do weddings outside the Alentejo?",
        a: "Yes. We decorate and coordinate weddings throughout mainland Portugal and the islands, working with each region's suppliers.",
      },
    ],
  },
  "eventos-corporativos": {
    eyebrow: "For Companies",
    title: "Corporate Events in Lisbon",
    metaTitle: "Corporate Events & Conferences in Lisbon",
    metaDescription:
      "Corporate event planning in Lisbon and across Portugal: conferences, congresses, team-building, product launches and company dinners. Full turnkey production.",
    intro: [
      "We elevate your brand's image through corporate events that transform teams and celebrate achievements. Líquen Events organises conferences, congresses, team-building and company dinners in Lisbon and across Portugal.",
      "From logistics to audiovisual, from registration management to on-site coordination, we handle everything with the rigour a professional event demands — so your company can focus solely on results.",
    ],
    includes: [
      "Conferences and congresses",
      "Team building and team activations",
      "Product launches",
      "Company dinners and awards galas",
      "Audiovisual, stage and scenography",
      "Registration and accreditation management",
    ],
    faqs: [
      {
        q: "Do you organise company events in Lisbon?",
        a: "Yes. We produce corporate events in Lisbon and across the country, with a team and suppliers in different regions.",
      },
      {
        q: "Do you handle events with international guests?",
        a: "Yes, we have experience with international logistics, including simultaneous translation, accommodation and transfers.",
      },
    ],
  },
  "festas-e-aniversarios": {
    eyebrow: "Private Celebrations",
    title: "Birthday Parties and Private Celebrations",
    metaTitle: "Birthday Parties & Private Celebrations",
    metaDescription:
      "Planning of birthday parties, christenings, communions and private celebrations in the Alentejo. Concept, décor, catering and bespoke entertainment.",
    intro: [
      "Every celebration is a story. We organise birthday parties, christenings, communions and private celebrations in the Alentejo and across Portugal — themed or classic, intimate or large-scale.",
      "From concept to décor, from catering to entertainment, we create memorable moments with the attention to detail that sets Líquen Events apart.",
    ],
    includes: [
      "Birthday parties (all ages)",
      "Christenings and communions",
      "Themed concept and full décor",
      "Catering, cake and dessert table",
      "Entertainment and activities",
      "Full day-of coordination",
    ],
    faqs: [
      {
        q: "Do you organise small, intimate parties?",
        a: "Yes. We adapt to any size — from intimate family celebrations to large parties — always with the same care.",
      },
    ],
  },
  "jantares-de-gala": {
    eyebrow: "Social Events",
    title: "Gala Dinners and Prestige Social Events",
    metaTitle: "Gala Dinners & Social Events",
    metaDescription:
      "Planning of gala dinners and prestige social events in Lisbon and Portugal. Sophisticated atmosphere, premium table settings and impeccable coordination.",
    intro: [
      "For moments that call for sophistication, we organise gala dinners and prestige social events in Lisbon and throughout Portugal.",
      "Premium table settings, guest chef, wine pairing and live entertainment — a meticulously crafted experience, with the impeccable coordination a gala event demands.",
    ],
    includes: [
      "Premium table settings and décor",
      "Guest chef and signature menu",
      "Wine pairing",
      "Scenography and lighting",
      "Entertainment and performances",
      "End-to-end event coordination",
    ],
    faqs: [],
  },
};

export function getService(slug: string, locale: "pt" | "en" = "pt"): ServiceDetail | undefined {
  const svc = SERVICES.find((s) => s.slug === slug);
  if (!svc) return undefined;
  if (locale === "en" && SERVICES_EN[slug]) return { ...svc, ...SERVICES_EN[slug] };
  return svc;
}
