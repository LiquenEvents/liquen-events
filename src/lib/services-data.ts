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
    title: "Decoração de Casamentos em Todo o Portugal",
    metaTitle: "Decoração de Casamentos em Portugal",
    metaDescription:
      "Decoração de casamentos em todo o Portugal — design floral e cenografia à medida, com coordenação do dia em herdades, quintas e espaços únicos do país.",
    keywords: [
      "decoração de casamentos",
      "decoração de casamentos Portugal",
      "coordenação de casamentos",
      "aluguer de viaturas clássicas casamento",
      "decoração de casamentos herdade",
      "wedding decoration Portugal",
    ],
    hero: "/imagens/EW1_1100.jpg",
    intro: [
      "Transformamos o seu casamento num dia verdadeiramente inesquecível. Cuidamos de cada detalhe — da escolha do local perfeito à decoração elegante, até à organização completa da cerimónia e receção —, garantindo que tudo reflete a sua personalidade e o seu estilo.",
      "Com uma equipa experiente e dedicada, proporcionamos um planeamento personalizado, assessoria e coordenação no dia, em herdades, quintas e espaços únicos de todo o país, para que possa viver plenamente o seu momento especial, sem preocupações.",
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
        q: "Em que zonas do país trabalham?",
        a: "Em todo o país. Decoramos e coordenamos casamentos em todo o Portugal continental e ilhas, em articulação com os fornecedores de cada região.",
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
      "Aluguer de viaturas clássicas para casamentos em todo o Portugal — carros de época com motorista para a chegada da noiva e o transporte dos noivos e convidados.",
    keywords: [
      "aluguer de viaturas clássicas casamento",
      "carros clássicos casamento",
      "aluguer de carros de época",
      "viatura clássica casamento Portugal",
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
        q: "O aluguer está disponível em todo o país?",
        a: "Sim. Levamos as viaturas a casamentos em todo o Portugal continental, mediante disponibilidade e planeamento da logística.",
      },
    ],
    related: ["casamentos"],
  },
  {
    slug: "eventos-corporativos",
    eyebrow: "Para Empresas",
    title: "Decoração de Eventos Corporativos em Portugal",
    metaTitle: "Decoração de Eventos Corporativos em Portugal",
    metaDescription:
      "Decoração e cenografia de eventos corporativos em todo o Portugal: conferências, congressos, teambuilding, lançamentos e jantares de empresa à medida.",
    keywords: [
      "decoração de eventos corporativos",
      "eventos corporativos Portugal",
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
      "Garantimos uma execução impecável, com atenção ao detalhe em cada fase — do conceito e da cenografia à montagem no espaço e à articulação com os restantes fornecedores. A nossa equipa assegura que cada evento é executado com excelência, num ambiente propício ao networking, à inovação e ao sucesso da sua empresa.",
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
        q: "Organizam eventos de empresa em todo o país?",
        a: "Sim. Produzimos eventos corporativos de norte a sul, com equipa e fornecedores em diferentes regiões.",
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
      "Decoração de festas de aniversário, batizados, comunhões e celebrações privadas em todo o Portugal. Conceito, cenografia, ambiente e coordenação à medida.",
    keywords: [
      "decoração de festas Portugal",
      "decoração de aniversários",
      "festa privada Portugal",
      "celebrações privadas Portugal",
    ],
    hero: "/imagens/DaniGui_JantarFesta_130.jpg",
    intro: [
      "Garantimos que cada celebração seja única e memorável. De festas de aniversário a celebrações íntimas, criamos experiências personalizadas, com atenção ao ambiente, à decoração e ao entretenimento, sempre adaptadas ao seu estilo e às suas preferências.",
      "Com uma abordagem criativa e uma equipa dedicada, tratamos de cada detalhe da decoração — do conceito às flores e à mesa posta, até à coordenação no dia —, permitindo-lhe desfrutar do momento sem preocupações. Transformamos a sua visão numa festa exclusiva e inesquecível.",
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
    title: "Decoração de Batizados e Comunhões em Portugal",
    metaTitle: "Decoração de Batizados e Comunhões",
    metaDescription:
      "Decoração de batizados e comunhões em todo o Portugal — celebrações familiares íntimas, com conceito, flores e mesa à medida, organizadas com carinho.",
    keywords: [
      "decoração de batizados",
      "decoração de comunhões",
      "decoração de batizados Portugal",
      "celebração familiar Portugal",
    ],
    hero: "/imagens/DaniGui_JantarFesta_26.jpg",
    intro: [
      "Os batizados e as comunhões são momentos de família que ficam para a vida. A Líquen Events cria a decoração destas celebrações em todo o Portugal — íntimas ou de maior escala, sempre com o mesmo cuidado.",
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
        q: "Em que zonas do país fazem estas celebrações?",
        a: "Em todo o país. Decoramos estas celebrações em todo o Portugal, em articulação com os fornecedores de cada região.",
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
    title: "Wedding Decoration across Portugal",
    metaTitle: "Wedding Decoration in Portugal",
    metaDescription:
      "Wedding decoration across Portugal — bespoke floral design and scenography, with day-of coordination, at estates, quintas and unique venues nationwide.",
    intro: [
      "We turn your wedding into a truly unforgettable day. We take care of every detail — from choosing the perfect venue to elegant decoration and the complete organisation of the ceremony and reception — making sure everything reflects your personality and style.",
      "With an experienced, dedicated team, we provide bespoke planning, guidance and day-of coordination, at estates, quintas and unique venues right across the country, so you can fully live your special moment, worry-free.",
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
        q: "Which parts of the country do you work in?",
        a: "Anywhere in the country. We decorate and coordinate weddings throughout mainland Portugal and the islands, working with each region's suppliers.",
      },
    ],
  },
  "aluguer-de-viaturas-classicas": {
    eyebrow: "Exclusive Service",
    title: "Classic Car Hire for Weddings",
    metaTitle: "Classic Car Hire for Weddings",
    metaDescription:
      "Classic car hire for weddings across Portugal — vintage cars with a driver for the bride's arrival and transport for the couple and guests.",
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
        q: "Is hire available anywhere in the country?",
        a: "Yes. We take the cars to weddings throughout mainland Portugal, subject to availability and logistics planning.",
      },
    ],
  },
  "eventos-corporativos": {
    eyebrow: "For Companies",
    title: "Corporate Event Decoration in Portugal",
    metaTitle: "Corporate Event Decoration in Portugal",
    metaDescription:
      "Decoration and scenography for corporate events across Portugal: conferences, congresses, team-building, product launches and company dinners.",
    intro: [
      "At Líquen Events, we combine professionalism and creativity to deliver experiences that strengthen your company's identity. From conferences and product launches to meetings and training, we offer tailored solutions that reflect your goals and values.",
      "We ensure flawless delivery, with attention to detail at every stage — from concept and scenography to the on-site build and liaison with your other suppliers. Our team makes sure each event is executed with excellence, in an environment that fosters networking, innovation and your company's success.",
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
        q: "Do you organise company events anywhere in the country?",
        a: "Yes. We produce corporate events from north to south, with a team and suppliers in different regions.",
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
      "Decoration for birthday parties, christenings, communions and private celebrations across Portugal. Concept, scenography, atmosphere and bespoke coordination.",
    intro: [
      "We make sure every celebration is unique and memorable. From birthday parties to intimate gatherings, we create personalised experiences with care for atmosphere, decoration and entertainment, always tailored to your style and preferences.",
      "With a creative approach and a dedicated team, we handle every detail of the décor — from concept to flowers and table styling, through to day-of coordination — so you can simply enjoy the moment. We turn your vision into an exclusive, unforgettable celebration.",
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
    title: "Christening & Communion Decoration in Portugal",
    metaTitle: "Christening & Communion Decoration",
    metaDescription:
      "Decoration for christenings and communions across Portugal — intimate family celebrations, with bespoke concept, flowers and table styling.",
    intro: [
      "Christenings and communions are family moments that last a lifetime. Líquen Events creates the decoration for these celebrations across Portugal — intimate or larger in scale, always with the same care.",
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
        q: "Where in the country do you do these celebrations?",
        a: "Anywhere in the country. We decorate these celebrations across Portugal, working with each region's suppliers.",
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
