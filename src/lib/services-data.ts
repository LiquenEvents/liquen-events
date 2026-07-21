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
  ogImage?: string; // landscape social-share image when `hero` is portrait
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
    metaTitle: "Decoração de Casamentos no Alentejo",
    metaDescription:
      "Decoração de casamentos no Alentejo — design floral e cenografia à medida, com coordenação do dia em herdades, quintas e espaços únicos de todo o Portugal.",
    keywords: [
      "decoração de casamentos Alentejo",
      "decoração de casamentos",
      "coordenação de casamentos Alentejo",
      "aluguer de viaturas clássicas casamento",
      "casamento herdade Alentejo",
      "wedding decoration Alentejo",
    ],
    hero: "/imagens/EW1_1100.jpg",
    intro: [
      "Transformamos o seu casamento num dia verdadeiramente inesquecível. Cuidamos de cada detalhe — da escolha do local perfeito à decoração elegante, até à organização completa da cerimónia e receção —, garantindo que tudo reflete a sua personalidade e o seu estilo.",
      "Com uma equipa experiente e dedicada, proporcionamos um planeamento personalizado, assessoria e coordenação no dia, em herdades e quintas do Alentejo e em todo o Portugal, para que possa viver plenamente o seu momento especial, sem preocupações.",
    ],
    includes: [
      "Conceito e design de decoração",
      "Decoração floral e cenografia",
      "Styling e mesa posta",
      "Ambiente e iluminação",
      "Articulação de fornecedores (catering, fotografia, vídeo)",
      "Coordenação no dia",
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
    related: ["festas-e-aniversarios"],
  },
  {
    slug: "aluguer-de-viaturas-classicas",
    eyebrow: "Serviço Exclusivo",
    title: "Aluguer de Viaturas Clássicas para Casamentos",
    metaTitle: "Aluguer de Viaturas Clássicas para Casamentos",
    metaDescription:
      "Aluguer de viaturas clássicas para casamentos no Alentejo e em Portugal — carros de época com motorista para a chegada da noiva e o transporte dos noivos e convidados.",
    keywords: [
      "aluguer de viaturas clássicas casamento",
      "carros clássicos casamento",
      "aluguer de carros de época",
      "viatura clássica casamento Alentejo",
    ],
    hero: "/imagens/viaturas-classicas.jpg",
    intro: [
      "Na Líquen Events disponibilizamos um serviço exclusivo de aluguer de viaturas para casamentos, com uma seleção de carros clássicos que trazem elegância e sofisticação ao seu dia especial. Seja para a chegada triunfante da noiva, seja para o transporte dos noivos e dos convidados, cada detalhe é cuidadosamente planeado para proporcionar uma experiência confortável e memorável.",
      "Com motoristas experientes e um serviço de alta qualidade, asseguramos um transporte pontual e sem preocupações, acrescentando um toque de glamour ao seu casamento.",
    ],
    includes: [
      "Viatura clássica com motorista",
      "Decoração floral da viatura",
      "Chegada da noiva e transporte dos noivos",
      "Planeamento do percurso e logística",
      "Disponível em todo o Portugal",
    ],
    gallery: [
      "/imagens/M&F0512.jpg",
      "/imagens/stephanie-mizio-760.jpg",
      "/imagens/ines-goncalo-421.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL4226.jpg",
      "/imagens/matilde-tomas-27.jpg",
      "/imagens/DaniGui_Preview20.jpg",
    ],
    faqs: [
      {
        q: "As viaturas incluem motorista?",
        a: "Sim. Todas as viaturas clássicas são disponibilizadas com motorista experiente, para que só tenham de aproveitar a viagem.",
      },
      {
        q: "O aluguer está disponível fora do Alentejo?",
        a: "Sim. Levamos as viaturas a casamentos em todo o Portugal continental, mediante disponibilidade e planeamento da logística.",
      },
    ],
    related: ["casamentos"],
  },
  {
    slug: "eventos-corporativos",
    eyebrow: "Para Empresas",
    title: "Decoração de Eventos Corporativos em Lisboa",
    metaTitle: "Decoração de Eventos Corporativos em Lisboa",
    metaDescription:
      "Decoração e cenografia de eventos corporativos em Lisboa e Portugal: conferências, congressos, teambuilding, lançamentos e jantares de empresa à medida.",
    keywords: [
      "decoração de eventos corporativos",
      "eventos corporativos Lisboa",
      "cenografia de conferências",
      "teambuilding empresas",
      "jantar de empresa",
    ],
    // Landscape twilight-courtyard frame (was EW1_1408, a portrait shot whose
    // wide-hero centre-crop landed on a pale, out-of-focus band — reading as a
    // broken/hazy hero and leaving the white nav links low-contrast).
    hero: "/imagens/EW1_1332.jpg",
    ogImage: "/imagens/EW1_1404.jpg",
    intro: [
      "Na Líquen Events, combinamos profissionalismo e criatividade para proporcionar experiências que fortalecem a identidade da sua empresa. De conferências e lançamentos de produto a reuniões e formações, oferecemos soluções personalizadas que refletem os seus objetivos e valores.",
      "Garantimos uma organização impecável, com atenção ao detalhe em cada fase do planeamento — da escolha do local à logística, ao catering e ao suporte técnico. A nossa equipa assegura que cada evento é executado com excelência, num ambiente propício ao networking, à inovação e ao sucesso da sua empresa.",
    ],
    includes: [
      "Congressos",
      "Seminários",
      "Retiros corporativos",
      "Cerimónias de premiação",
      "Convívios de empresa",
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
    related: ["casamentos", "festas-e-aniversarios"],
  },
  {
    slug: "festas-e-aniversarios",
    eyebrow: "Celebrações Privadas",
    title: "Decoração de Festas de Aniversário e Celebrações Privadas",
    metaTitle: "Decoração de Festas e Celebrações Privadas",
    metaDescription:
      "Decoração de festas de aniversário, batizados, comunhões e celebrações privadas no Alentejo. Conceito, cenografia, ambiente e coordenação à medida.",
    keywords: [
      "decoração de festas Alentejo",
      "decoração de aniversários",
      "festa privada Alentejo",
      "celebrações privadas Portugal",
    ],
    hero: "/imagens/DaniGui_JantarFesta_130.jpg",
    intro: [
      "Garantimos que cada celebração seja única e memorável. De festas de aniversário a celebrações íntimas, criamos experiências personalizadas, com atenção ao ambiente, à decoração e ao entretenimento, sempre adaptadas ao seu estilo e às suas preferências.",
      "Com uma abordagem criativa e uma equipa dedicada, tratamos de todos os detalhes — da escolha do local ao catering, até à coordenação do evento —, permitindo-lhe desfrutar do momento sem preocupações. Transformamos a sua visão numa festa exclusiva e inesquecível.",
    ],
    includes: [
      "Conceito e tema da festa",
      "Decoração e cenografia do espaço",
      "Flores e styling de mesa",
      "Ambiente e iluminação",
      "Articulação de fornecedores (catering, animação)",
      "Coordenação no dia",
    ],
    gallery: [
      "/imagens/DaniGui_JantarFesta_1.jpg",
      "/imagens/DaniGui_JantarFesta_3.jpg",
      "/imagens/DaniGui_JantarFesta_11.jpg",
      "/imagens/DaniGui_JantarFesta_14.jpg",
      "/imagens/DaniGui_JantarFesta_15.jpg",
      "/imagens/DaniGui_JantarFesta_18.jpg",
    ],
    faqs: [
      {
        q: "Fazem festas de aniversário temáticas?",
        a: "Sim. Desenhamos o conceito e a decoração à volta do tema que imaginar — de aniversários infantis a festas de adulto —, sempre à medida.",
      },
      {
        q: "Com quanto tempo devo reservar a decoração da festa?",
        a: "Quanto mais cedo melhor para garantir a data, mas conseguimos entrar mais perto do dia, consoante a disponibilidade e a dimensão da festa.",
      },
    ],
    related: ["casamentos"],
  },
  {
    slug: "batizados-e-comunhoes",
    eyebrow: "Celebrações Familiares",
    title: "Decoração de Batizados e Comunhões no Alentejo",
    metaTitle: "Decoração de Batizados e Comunhões",
    metaDescription:
      "Decoração de batizados e comunhões no Alentejo e em Portugal — celebrações familiares íntimas, com conceito, flores e mesa à medida, organizadas com carinho.",
    keywords: [
      "decoração de batizados",
      "decoração de comunhões",
      "batizado Alentejo",
      "celebração familiar Alentejo",
    ],
    hero: "/imagens/DaniGui_JantarFesta_26.jpg",
    intro: [
      "Os batizados e as comunhões são momentos de família que ficam para a vida. A Líquen Events cria a decoração destas celebrações no Alentejo e em todo o Portugal — íntimas ou de maior escala, sempre com o mesmo cuidado.",
      "Do conceito à mesa, das flores ao ambiente, tratamos de cada detalhe para que só tenham de estar com quem é importante.",
    ],
    includes: [
      "Conceito e cenografia da celebração",
      "Decoração floral e styling de mesa",
      "Mesa de doces e detalhes personalizados",
      "Ambiente e iluminação",
      "Articulação de fornecedores",
      "Coordenação no dia",
    ],
    gallery: [
      "/imagens/DaniGui_JantarFesta_6.jpg",
      "/imagens/DaniGui_JantarFesta_17.jpg",
      "/imagens/DaniGui_JantarFesta_24.jpg",
      "/imagens/DaniGui_JantarFesta_39.jpg",
      "/imagens/DaniGui_JantarFesta_41.jpg",
      "/imagens/DaniGui_JantarFesta_48.jpg",
    ],
    faqs: [
      {
        q: "Decoram o batizado na cerimónia e no almoço de família?",
        a: "Sim. Tratamos da decoração tanto no momento da cerimónia como no almoço ou jantar, com um conceito coerente entre os dois espaços.",
      },
      {
        q: "Fazem batizados e comunhões fora do Alentejo?",
        a: "Sim. Decoramos estas celebrações em todo o Portugal, em articulação com os fornecedores de cada região.",
      },
    ],
    related: ["festas-e-aniversarios", "casamentos"],
  },
];

/**
 * English overrides for the visible copy AND the page metadata (eyebrow, H1
 * title, intro, includes, FAQs, metaTitle, metaDescription). Only `keywords`
 * stays Portuguese — PT is the canonical, indexed language; getService() merges
 * the English copy for /en/servicos/*.
 */
type ServiceCopy = Pick<
  ServiceDetail,
  "eyebrow" | "title" | "intro" | "includes" | "faqs" | "metaTitle" | "metaDescription"
>;

const SERVICES_EN: Record<string, ServiceCopy> = {
  casamentos: {
    eyebrow: "Wedding Decoration & Coordination",
    title: "Wedding Decoration in the Alentejo and across Portugal",
    metaTitle: "Wedding Decoration in the Alentejo",
    metaDescription:
      "Wedding decoration in the Alentejo — bespoke floral design and scenography, with day-of coordination, at estates, quintas and unique venues across Portugal.",
    intro: [
      "We turn your wedding into a truly unforgettable day. We take care of every detail — from choosing the perfect venue to elegant decoration and the complete organisation of the ceremony and reception — making sure everything reflects your personality and style.",
      "With an experienced, dedicated team, we provide bespoke planning, guidance and day-of coordination, at estates and quintas across the Alentejo and all of Portugal, so you can fully live your special moment, worry-free.",
    ],
    includes: [
      "Decoration concept and design",
      "Floral decoration and scenography",
      "Styling and table settings",
      "Atmosphere and lighting",
      "Supplier liaison (catering, photography, video)",
      "Day-of coordination",
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
  "aluguer-de-viaturas-classicas": {
    eyebrow: "Exclusive Service",
    title: "Classic Car Hire for Weddings",
    metaTitle: "Classic Car Hire for Weddings",
    metaDescription:
      "Classic car hire for weddings in the Alentejo and across Portugal — vintage cars with a driver for the bride's arrival and transport for the couple and guests.",
    intro: [
      "At Líquen Events we offer an exclusive wedding car hire service, with a selection of classic cars that bring elegance and sophistication to your special day. Whether for the bride's grand arrival or transport for the couple and guests, every detail is carefully planned for a comfortable, memorable experience.",
      "With experienced drivers and a high-quality service, we ensure punctual, worry-free transport, adding a touch of glamour to your wedding.",
    ],
    includes: [
      "Classic car with driver",
      "Floral decoration of the car",
      "Bride's arrival and transport for the couple",
      "Route planning and logistics",
      "Available across Portugal",
    ],
    faqs: [
      {
        q: "Do the cars come with a driver?",
        a: "Yes. Every classic car comes with an experienced driver, so all you have to do is enjoy the ride.",
      },
      {
        q: "Is hire available outside the Alentejo?",
        a: "Yes. We take the cars to weddings throughout mainland Portugal, subject to availability and logistics planning.",
      },
    ],
  },
  "eventos-corporativos": {
    eyebrow: "For Companies",
    title: "Corporate Event Decoration in Lisbon",
    metaTitle: "Corporate Event Decoration in Lisbon",
    metaDescription:
      "Decoration and scenography for corporate events in Lisbon and Portugal: conferences, congresses, team-building, product launches and company dinners.",
    intro: [
      "At Líquen Events, we combine professionalism and creativity to deliver experiences that strengthen your company's identity. From conferences and product launches to meetings and training, we offer tailored solutions that reflect your goals and values.",
      "We ensure flawless organisation, with attention to detail at every stage of planning — from venue selection to logistics, catering and technical support. Our team makes sure each event is executed with excellence, in an environment that fosters networking, innovation and your company's success.",
    ],
    includes: [
      "Congresses",
      "Seminars",
      "Corporate retreats",
      "Awards ceremonies",
      "Company socials",
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
    title: "Decoration for Birthday Parties and Private Celebrations",
    metaTitle: "Party & Private Celebration Decoration",
    metaDescription:
      "Decoration for birthday parties, christenings, communions and private celebrations in the Alentejo. Concept, scenography, atmosphere and bespoke coordination.",
    intro: [
      "We make sure every celebration is unique and memorable. From birthday parties to intimate gatherings, we create personalised experiences with care for atmosphere, decoration and entertainment, always tailored to your style and preferences.",
      "With a creative approach and a dedicated team, we handle every detail — from choosing the venue to catering and coordinating the event — so you can simply enjoy the moment. We turn your vision into an exclusive, unforgettable celebration.",
    ],
    includes: [
      "Party concept and theme",
      "Space decoration and scenography",
      "Flowers and table styling",
      "Atmosphere and lighting",
      "Supplier liaison (catering, entertainment)",
      "Day-of coordination",
    ],
    faqs: [
      {
        q: "Do you do themed birthday parties?",
        a: "Yes. We design the concept and decoration around whatever theme you imagine — from children's birthdays to grown-up parties — always bespoke.",
      },
      {
        q: "How far in advance should I book the party decoration?",
        a: "The earlier the better to secure the date, but we can come on board closer to the day, depending on availability and the size of the party.",
      },
    ],
  },
  "batizados-e-comunhoes": {
    eyebrow: "Family Celebrations",
    title: "Christening & Communion Decoration in the Alentejo",
    metaTitle: "Christening & Communion Decoration",
    metaDescription:
      "Decoration for christenings and communions in the Alentejo and across Portugal — intimate family celebrations, with bespoke concept, flowers and table styling.",
    intro: [
      "Christenings and communions are family moments that last a lifetime. Líquen Events creates the decoration for these celebrations in the Alentejo and across Portugal — intimate or larger in scale, always with the same care.",
      "From concept to the table, from flowers to the atmosphere, we handle every detail so all you have to do is be with the people who matter.",
    ],
    includes: [
      "Concept and scenography",
      "Floral décor and table styling",
      "Dessert table and personalised details",
      "Atmosphere and lighting",
      "Supplier liaison",
      "Coordination on the day",
    ],
    faqs: [
      {
        q: "Do you decorate both the ceremony and the family lunch?",
        a: "Yes. We handle the decoration both at the ceremony and at the lunch or dinner, with a concept that stays coherent across both spaces.",
      },
      {
        q: "Do you do christenings and communions outside the Alentejo?",
        a: "Yes. We decorate these celebrations across Portugal, working with each region's suppliers.",
      },
    ],
  },
};

export function getService(slug: string, locale: "pt" | "en" = "pt"): ServiceDetail | undefined {
  const svc = SERVICES.find((s) => s.slug === slug);
  if (!svc) return undefined;
  if (locale === "en" && SERVICES_EN[slug]) return { ...svc, ...SERVICES_EN[slug] };
  return svc;
}

// Maps a service slug to the quote form's event-type id (OrcamentoForm
// EVENT_TYPES), so a "Pedir orçamento" link from a service page can deep-link
// `?tipo=` and land with the type pre-selected — the visitor doesn't re-pick
// what they just came from. Unmapped slugs simply omit the param. Corporate
// sub-services all map to the single "Corporativo" option.
const SLUG_TO_QUOTE_TIPO: Record<string, string> = {
  casamentos: "casamentos",
  "aluguer-de-viaturas-classicas": "casamentos",
  "eventos-corporativos": "conferencias",
  "festas-e-aniversarios": "aniversarios",
  "batizados-e-comunhoes": "batizados",
};

/** Quote-form event-type id for a service slug, or undefined if none applies. */
export function quoteTipoForSlug(slug: string): string | undefined {
  return SLUG_TO_QUOTE_TIPO[slug];
}
