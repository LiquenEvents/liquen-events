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
      "Coordenação de casamento",
      "Reportagem de fotografia e vídeo",
      "Decoração",
      "Catering",
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
    hero: "/imagens/M&F0678.jpg",
    intro: [
      "Na Líquen Events disponibilizamos um serviço exclusivo de aluguer de viaturas para casamentos, com uma seleção de carros clássicos que trazem elegância e sofisticação ao seu dia especial. Seja para a chegada triunfante da noiva, seja para o transporte dos noivos e dos convidados, cada detalhe é cuidadosamente planeado para proporcionar uma experiência confortável e memorável.",
      "Com motoristas experientes e um serviço de alta qualidade, asseguramos um transporte pontual e sem preocupações, acrescentando um toque de glamour ao seu casamento.",
    ],
    includes: ["Aluguer de viaturas clássicas", "Iluminação decorativa"],
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
    related: ["casamentos", "jantares-de-gala"],
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
    related: [
      "conferencias-e-congressos",
      "teambuilding",
      "lancamentos-de-produto",
      "jantares-de-empresa",
    ],
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
    includes: ["Aniversários", "Despedidas de solteiro", "Comunhões", "Batizados"],
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
    title: "Decoração de Jantares de Gala e Eventos Sociais",
    metaTitle: "Decoração de Jantares de Gala",
    metaDescription:
      "Decoração de jantares de gala e eventos sociais de prestígio em Lisboa e Portugal. Mesa posta premium, cenografia sofisticada e coordenação impecável.",
    keywords: [
      "decoração de jantares de gala",
      "jantar de gala Portugal",
      "eventos sociais de prestígio",
      "evento de prestígio Alentejo",
    ],
    hero: "/imagens/J&P-IMGL3188.jpg",
    intro: [
      "Para os momentos que pedem sofisticação, criamos a decoração de jantares de gala e eventos sociais de prestígio em Lisboa e por todo o Portugal.",
      "Mesa posta premium, cenografia e iluminação de autor — uma experiência cuidada ao pormenor, com a coordenação impecável que um evento de gala exige.",
    ],
    includes: [
      "Mesa posta e decoração premium",
      "Chef convidado e menu de autor",
      "Harmonização de vinhos",
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
      "/imagens/DaniGui_JantarFesta_11.jpg",
      "/imagens/DaniGui_JantarFesta_17.jpg",
      "/imagens/DaniGui_JantarFesta_6.jpg",
      "/imagens/DaniGui_JantarFesta_27.jpg",
      "/imagens/DaniGui_JantarFesta_130.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
    ],
    faqs: [
      {
        q: "Organizam celebrações pequenas e íntimas?",
        a: "Sim. Adaptamo-nos a qualquer dimensão — de reuniões familiares íntimas a grandes celebrações — sempre com a mesma atenção ao detalhe.",
      },
    ],
    related: ["festas-e-aniversarios", "casamentos"],
  },
  {
    slug: "conferencias-e-congressos",
    eyebrow: "Para Empresas",
    title: "Decoração e Cenografia de Conferências e Congressos",
    metaTitle: "Cenografia de Conferências e Congressos",
    metaDescription:
      "Decoração, cenografia e produção de conferências e congressos em Lisboa e em todo o Portugal — palco, iluminação, sinalética e coordenação no local.",
    keywords: [
      "cenografia de conferências",
      "decoração de congressos",
      "produção de conferências Lisboa",
      "eventos corporativos Portugal",
    ],
    hero: "/imagens/EW1_1332.jpg",
    intro: [
      "Uma conferência é a montra da sua marca. A Líquen Events cria a cenografia e a produção de conferências e congressos em Lisboa e em todo o Portugal — do palco à sinalética, com o rigor que um evento profissional exige.",
      "Cuidamos do conceito visual, da iluminação e do audiovisual à coordenação no local, para que a sua equipa se foque apenas no conteúdo e nos resultados.",
    ],
    includes: [
      "Conceito visual e cenografia de palco",
      "Iluminação e audiovisual",
      "Sinalética e identidade do evento",
      "Ambientação de áreas de networking",
      "Articulação de fornecedores técnicos",
      "Coordenação e produção no local",
    ],
    gallery: [
      "/imagens/EW1_1330.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/EW1_1408.jpg",
      "/imagens/hd-edited.jpg",
    ],
    faqs: [
      {
        q: "Tratam da parte técnica (palco, som, luz)?",
        a: "Sim. Coordenamos toda a produção técnica com a nossa rede de fornecedores, do palco e iluminação ao audiovisual e tradução simultânea.",
      },
    ],
    related: ["eventos-corporativos", "jantares-de-empresa"],
  },
  {
    slug: "teambuilding",
    eyebrow: "Para Empresas",
    title: "Teambuilding e Experiências de Equipa",
    metaTitle: "Teambuilding para Empresas no Alentejo",
    metaDescription:
      "Organização de teambuilding e experiências de equipa no Alentejo e em Portugal — atividades e ambientes à medida que unem e fortalecem a equipa.",
    keywords: [
      "teambuilding empresas",
      "teambuilding Alentejo",
      "atividades de equipa",
      "eventos corporativos Portugal",
    ],
    hero: "/imagens/EW1_1398.jpg",
    intro: [
      "As melhores equipas constroem-se fora da sala de reuniões. A Líquen Events cria experiências de teambuilding no Alentejo e em todo o Portugal — do conceito à ambientação, pensadas para unir equipas e celebrar conquistas.",
      "Tratamos do espaço, da logística e de cada detalhe, para que a sua empresa viva o momento sem preocupações.",
    ],
    includes: [
      "Conceito e tema da experiência",
      "Ambientação e decoração do espaço",
      "Logística e catering",
      "Atividades e dinâmicas de equipa",
      "Articulação de fornecedores",
      "Coordenação no local",
    ],
    gallery: [
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1408.jpg",
      "/imagens/20_10_2025_0295.jpg",
      "/imagens/20_10_2025_0358.jpg",
    ],
    faqs: [
      {
        q: "Fazem teambuilding em herdades do Alentejo?",
        a: "Sim. Temos parceiros em herdades e quintas por todo o Alentejo, ideais para experiências de equipa em ambiente único.",
      },
    ],
    related: ["eventos-corporativos", "conferencias-e-congressos"],
  },
  {
    slug: "lancamentos-de-produto",
    eyebrow: "Para Empresas",
    title: "Lançamentos de Produto e Eventos de Marca",
    metaTitle: "Decoração de Lançamentos de Produto",
    metaDescription:
      "Decoração, cenografia e produção de lançamentos de produto e eventos de marca em Lisboa e Portugal — ambientes de impacto para apresentar novidades ao mercado.",
    keywords: [
      "lançamento de produto",
      "evento de marca",
      "cenografia de lançamento",
      "eventos corporativos Lisboa",
    ],
    hero: "/imagens/EW1_1428.jpg",
    intro: [
      "Um lançamento é a primeira impressão do seu produto. A Líquen Events cria a cenografia e a produção de lançamentos de produto e eventos de marca em Lisboa e em todo o Portugal — ambientes de impacto, fiéis à identidade da marca.",
      "Do conceito visual à montagem e coordenação no local, criamos o momento que faz o mercado olhar.",
    ],
    includes: [
      "Conceito visual e cenografia de marca",
      "Decoração e styling do espaço",
      "Iluminação e audiovisual",
      "Zonas de demonstração e imprensa",
      "Sinalética e identidade do evento",
      "Coordenação e produção no local",
    ],
    gallery: [
      "/imagens/EW1_1404.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1330.jpg",
      "/imagens/EW1_1408.jpg",
      "/imagens/hd-edited.jpg",
    ],
    faqs: [],
    related: ["eventos-corporativos", "conferencias-e-congressos"],
  },
  {
    slug: "jantares-de-empresa",
    eyebrow: "Para Empresas",
    title: "Jantares de Empresa e Galas Corporativas",
    metaTitle: "Decoração de Jantares de Empresa",
    metaDescription:
      "Decoração de jantares de empresa e galas corporativas em Lisboa e Portugal — de jantares de Natal a galas de prémios, com mesa posta premium.",
    keywords: [
      "jantar de empresa",
      "gala corporativa",
      "jantar de Natal empresa",
      "eventos corporativos Portugal",
    ],
    hero: "/imagens/EW1_1404.jpg",
    intro: [
      "Do jantar de Natal à gala de entrega de prémios, os jantares de empresa são momentos de celebração que merecem cuidado. A Líquen Events cria a decoração e a ambientação destes eventos em Lisboa e em todo o Portugal.",
      "Mesa posta premium, cenografia e iluminação à medida, com a coordenação impecável que uma noite memorável exige.",
    ],
    includes: [
      "Mesa posta e decoração premium",
      "Cenografia e iluminação",
      "Ambientação de palco e entrega de prémios",
      "Articulação de catering e fornecedores",
      "Sinalética e identidade do evento",
      "Coordenação integral da noite",
    ],
    gallery: [
      "/imagens/EW1_1405.jpg",
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/M&F0512.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
    ],
    faqs: [
      {
        q: "Organizam jantares de Natal de empresa?",
        a: "Sim. Do conceito à mesa e à coordenação da noite, tratamos de tudo para a sua empresa celebrar sem preocupações.",
      },
    ],
    related: ["eventos-corporativos", "jantares-de-gala"],
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
    includes: ["Wedding coordination", "Photo and video coverage", "Decoration", "Catering"],
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
    includes: ["Birthdays", "Hen and stag parties", "Communions", "Christenings"],
    faqs: [
      {
        q: "Do you organise small, intimate parties?",
        a: "Yes. We adapt to any size — from intimate family celebrations to large parties — always with the same care.",
      },
    ],
  },
  "jantares-de-gala": {
    eyebrow: "Social Events",
    title: "Decoration for Gala Dinners and Social Events",
    metaTitle: "Gala Dinner Decoration",
    metaDescription:
      "Decoration for gala dinners and prestige social events in Lisbon and Portugal. Premium table settings, sophisticated scenography and impeccable coordination.",
    intro: [
      "For moments that call for sophistication, we create the decoration for gala dinners and prestige social events in Lisbon and throughout Portugal.",
      "Premium table settings, signature scenography and lighting — a meticulously crafted experience, with the impeccable coordination a gala event demands.",
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
        q: "Do you organise small, intimate celebrations?",
        a: "Yes. We adapt to any size — from intimate family gatherings to large celebrations — always with the same attention to detail.",
      },
    ],
  },
  "conferencias-e-congressos": {
    eyebrow: "For Companies",
    title: "Conference & Congress Decoration and Scenography",
    metaTitle: "Conference & Congress Scenography",
    metaDescription:
      "Decoration, scenography and production for conferences and congresses in Lisbon and across Portugal — stage, lighting, signage and on-site coordination.",
    intro: [
      "A conference is your brand's showcase. Líquen Events creates the scenography and production for conferences and congresses in Lisbon and across Portugal — from stage to signage, with the rigour a professional event demands.",
      "We take care of the visual concept, lighting and audiovisual through to on-site coordination, so your team can focus on the content and the results.",
    ],
    includes: [
      "Visual concept and stage scenography",
      "Lighting and audiovisual",
      "Signage and event identity",
      "Styling of networking areas",
      "Technical supplier liaison",
      "On-site coordination and production",
    ],
    faqs: [
      {
        q: "Do you handle the technical side (stage, sound, lighting)?",
        a: "Yes. We coordinate the full technical production with our network of suppliers, from stage and lighting to audiovisual and simultaneous translation.",
      },
    ],
  },
  teambuilding: {
    eyebrow: "For Companies",
    title: "Team Building & Team Experiences",
    metaTitle: "Team Building for Companies in the Alentejo",
    metaDescription:
      "Team building and team experiences in the Alentejo and Portugal — bespoke activities and settings that bring teams together and strengthen company culture.",
    intro: [
      "The best teams are built outside the meeting room. Líquen Events creates team-building experiences in the Alentejo and across Portugal — from concept to setting, designed to bring teams together and celebrate achievements.",
      "We handle the venue, the logistics and every detail, so your company can simply enjoy the moment.",
    ],
    includes: [
      "Concept and theme",
      "Setting and space decoration",
      "Logistics and catering",
      "Team activities and dynamics",
      "Supplier liaison",
      "On-site coordination",
    ],
    faqs: [
      {
        q: "Do you run team building at Alentejo estates?",
        a: "Yes. We have partners at estates and quintas across the Alentejo, ideal for team experiences in a unique setting.",
      },
    ],
  },
  "lancamentos-de-produto": {
    eyebrow: "For Companies",
    title: "Product Launches & Brand Events",
    metaTitle: "Product Launch Decoration",
    metaDescription:
      "Decoration, scenography and production for product launches and brand events in Lisbon and Portugal — high-impact settings to bring new products to market.",
    intro: [
      "A launch is your product's first impression. Líquen Events creates the scenography and production for product launches and brand events in Lisbon and across Portugal — high-impact settings, true to the brand's identity.",
      "From the visual concept to the build and on-site coordination, we create the moment that makes the market look.",
    ],
    includes: [
      "Visual concept and brand scenography",
      "Decoration and space styling",
      "Lighting and audiovisual",
      "Demo and press areas",
      "Signage and event identity",
      "On-site coordination and production",
    ],
    faqs: [],
  },
  "jantares-de-empresa": {
    eyebrow: "For Companies",
    title: "Company Dinners & Corporate Galas",
    metaTitle: "Company Dinner Decoration",
    metaDescription:
      "Decoration for company dinners and corporate galas in Lisbon and Portugal — from Christmas dinners to awards galas, with premium table settings.",
    intro: [
      "From the Christmas dinner to the awards gala, company dinners are moments of celebration that deserve care. Líquen Events creates the decoration and styling for these events in Lisbon and across Portugal.",
      "Premium table settings, bespoke scenography and lighting, with the impeccable coordination a memorable evening demands.",
    ],
    includes: [
      "Premium table settings and décor",
      "Scenography and lighting",
      "Stage and awards styling",
      "Catering and supplier liaison",
      "Signage and event identity",
      "End-to-end coordination of the evening",
    ],
    faqs: [
      {
        q: "Do you organise company Christmas dinners?",
        a: "Yes. From concept to the table and coordination of the evening, we take care of everything so your company can celebrate without a worry.",
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
  "jantares-de-gala": "jantares_gala",
  "batizados-e-comunhoes": "batizados",
  "conferencias-e-congressos": "conferencias",
  teambuilding: "conferencias",
  "lancamentos-de-produto": "conferencias",
  "jantares-de-empresa": "conferencias",
};

/** Quote-form event-type id for a service slug, or undefined if none applies. */
export function quoteTipoForSlug(slug: string): string | undefined {
  return SLUG_TO_QUOTE_TIPO[slug];
}
