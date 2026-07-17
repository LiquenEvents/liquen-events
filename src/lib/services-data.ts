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
    metaTitle: "Decoração de Casamentos no Alentejo",
    metaDescription:
      "Decoração de casamentos no Alentejo — decoração floral e cenografia à medida, com coordenação do dia para viverem o grande dia sem preocupações. Em herdades, quintas e espaços únicos de todo o Portugal.",
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
      "O vosso casamento é único — e a decoração é o que lhe dá alma. A Líquen Events cria a decoração do vosso casamento em todo o Alentejo e Portugal, das herdades e quintas históricas aos espaços mais íntimos: conceito, flores e cenografia pensados ao pormenor.",
      "E no grande dia coordenamos tudo — cronograma, fornecedores, montagem e imprevistos — para que só tenham de viver o momento.",
      "E para uma chegada de sonho, temos ainda aluguer de viaturas clássicas — da entrada da noiva ao transporte dos noivos e convidados, com motorista e todo o cuidado.",
    ],
    includes: [
      "Decoração floral e cenografia",
      "Conceito e design decorativo",
      "Montagem e styling do espaço",
      "Coordenação do dia do casamento",
      "Cronograma e articulação de fornecedores",
      "Aluguer de viaturas clássicas (opcional)",
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
    title: "Decoração de Eventos Corporativos em Lisboa",
    metaTitle: "Decoração de Eventos Corporativos em Lisboa",
    metaDescription:
      "Decoração e cenografia de eventos corporativos em Lisboa e todo o Portugal: conferências, congressos, teambuilding, lançamentos de produto e jantares de empresa — ambiente e produção à medida.",
    keywords: [
      "decoração de eventos corporativos",
      "eventos corporativos Lisboa",
      "cenografia de conferências",
      "teambuilding empresas",
      "jantar de empresa",
    ],
    hero: "/imagens/EW1_1408.jpg",
    intro: [
      "Elevamos a imagem da sua marca com eventos corporativos memoráveis em Lisboa e em todo o Portugal. Cada tipo de evento tem a sua abordagem dedicada — conferências e congressos, teambuilding, lançamentos de produto e jantares de empresa.",
      "Do conceito visual à montagem, da iluminação à coordenação no local, cuidamos de cada detalhe com o rigor que um evento profissional exige — para que a sua empresa se foque apenas nos resultados.",
    ],
    includes: [
      "Conceito visual e cenografia",
      "Decoração e styling de espaços",
      "Palco, iluminação e audiovisual",
      "Ambientação de jantares e galas de empresa",
      "Sinalética e identidade do evento",
      "Coordenação e produção no local",
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
      "Cada celebração é uma história. Criamos a decoração de festas de aniversário, batizados, comunhões e celebrações privadas no Alentejo e em todo o Portugal — temáticas ou clássicas, íntimas ou de grande escala.",
      "Do conceito e cenografia à mesa e ao ambiente, criamos momentos memoráveis com a atenção ao detalhe que distingue a Líquen Events.",
    ],
    includes: [
      "Conceito temático e cenografia",
      "Decoração completa do espaço",
      "Mesa de doces e styling de mesa",
      "Ambiente, flores e iluminação",
      "Batizados, comunhões e aniversários",
      "Coordenação no dia da festa",
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
      "Organização de teambuilding e experiências de equipa no Alentejo e em Portugal — atividades e ambientes à medida que unem equipas e fortalecem a cultura da empresa.",
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
      "Decoração e ambientação de jantares de empresa e galas corporativas em Lisboa e Portugal — de jantares de Natal a galas de prémios, com mesa posta premium e coordenação impecável.",
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
      "Wedding decoration in the Alentejo — bespoke floral design and scenography, with day-of coordination so you can simply enjoy your day, at estates, quintas and unique venues across Portugal.",
    intro: [
      "Your wedding is one of a kind — and the decoration is what gives it soul. Líquen Events creates your wedding's decoration throughout the Alentejo and Portugal, from historic estates and quintas to the most intimate venues: concept, flowers and scenography considered down to the last detail.",
      "And on the day, we coordinate everything — timeline, suppliers, setup and the unexpected — so all you have to do is live the moment.",
      "And for a dream arrival, we also offer classic car rental — from the bride's entrance to transport for the newlyweds and guests, with a driver and every care taken.",
    ],
    includes: [
      "Floral décor and scenography",
      "Concept and decorative design",
      "Setup and venue styling",
      "Wedding day coordination",
      "Timeline and supplier liaison",
      "Classic car rental (optional)",
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
    title: "Corporate Event Decoration in Lisbon",
    metaTitle: "Corporate Event Decoration in Lisbon",
    metaDescription:
      "Decoration and scenography for corporate events in Lisbon and across Portugal: conferences, congresses, team-building, product launches and company dinners — bespoke atmosphere and production.",
    intro: [
      "We elevate your brand's image with memorable corporate events in Lisbon and across Portugal. Each type of event has its own dedicated approach — conferences and congresses, team building, product launches and company dinners.",
      "From the visual concept to the build, from lighting to on-site coordination, we take care of every detail with the rigour a professional event demands — so your company can focus solely on results.",
    ],
    includes: [
      "Visual concept and scenography",
      "Decoration and space styling",
      "Stage, lighting and audiovisual",
      "Styling of company dinners and galas",
      "Signage and event identity",
      "On-site coordination and production",
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
      "Every celebration is a story. We create the decoration for birthday parties, christenings, communions and private celebrations in the Alentejo and across Portugal — themed or classic, intimate or large-scale.",
      "From concept and scenography to the table and the atmosphere, we create memorable moments with the attention to detail that sets Líquen Events apart.",
    ],
    includes: [
      "Themed concept and scenography",
      "Full space decoration",
      "Dessert table and table styling",
      "Atmosphere, flowers and lighting",
      "Christenings, communions and birthdays",
      "Coordination on the day",
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
      "Decoration for christenings and communions in the Alentejo and across Portugal — intimate family celebrations, with bespoke concept, flowers and table styling, organised with care.",
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
      "Team building and team experiences in the Alentejo and across Portugal — bespoke activities and settings that bring teams together and strengthen company culture.",
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
      "Decoration and styling for company dinners and corporate galas in Lisbon and Portugal — from Christmas dinners to awards galas, with premium table settings and impeccable coordination.",
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
