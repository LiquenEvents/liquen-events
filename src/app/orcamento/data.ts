import type { EventCategory, EventType, LocationType, AddonCatalogItem } from "./types";

export const CATEGORIES: {
  id: EventCategory;
  label: string;
  subtitle: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "empresas",
    label: "Eventos Empresariais",
    subtitle: "Para Empresas",
    description:
      "Conferências, teambuilding, lançamentos de produto e jantares corporativos que elevam a sua marca.",
    icon: "🏢",
  },
  {
    id: "particulares",
    label: "Eventos Particulares",
    subtitle: "Para Particulares",
    description:
      "Casamentos, batizados, aniversários e celebrações privadas tornadas verdadeiramente inesquecíveis.",
    icon: "✨",
  },
];

export const EVENT_TYPES_BY_CATEGORY: Record<
  EventCategory,
  {
    id: EventType;
    label: string;
    description: string;
    icon: string;
    minGuests: number;
    maxGuests: number;
    basePrice: number;
    pricePerPax: number;
    suggestedDuration: number;
    features: string[];
  }[]
> = {
  empresas: [
    {
      id: "conferencias",
      label: "Conferências & Congressos",
      description:
        "Eventos profissionais de grande formato para networking e partilha de conhecimento.",
      icon: "🎤",
      minGuests: 50,
      maxGuests: 2000,
      basePrice: 2800,
      pricePerPax: 16,
      suggestedDuration: 8,
      features: [
        "Gestão de palestrantes",
        "Coordenação AV",
        "Credenciamento digital",
        "Coffee breaks",
        "Moderação profissional",
        "Relatório pós-evento",
      ],
    },
    {
      id: "teambuilding",
      label: "Teambuilding",
      description:
        "Actividades e dinâmicas criativas para fortalecer equipas e aumentar a motivação.",
      icon: "🤝",
      minGuests: 10,
      maxGuests: 500,
      basePrice: 2000,
      pricePerPax: 30,
      suggestedDuration: 6,
      features: [
        "Design de actividades",
        "Facilitadores certificados",
        "Material didáctico",
        "Espaço dedicado",
        "Avaliação de resultados",
      ],
    },
    {
      id: "lancamentos",
      label: "Lançamentos de Produto",
      description:
        "Apresentações de produto com impacto visual e experiências de marca memoráveis.",
      icon: "🚀",
      minGuests: 20,
      maxGuests: 500,
      basePrice: 3800,
      pricePerPax: 24,
      suggestedDuration: 4,
      features: [
        "Conceito criativo",
        "Cenografia personalizada",
        "Gestão de imprensa",
        "Produção AV completa",
        "Experiências interactivas",
      ],
    },
    {
      id: "jantares_empresa",
      label: "Jantares de Empresa",
      description:
        "Celebrações corporativas elegantes para reconhecimento, convívio e fortalecimento da cultura.",
      icon: "🥂",
      minGuests: 20,
      maxGuests: 600,
      basePrice: 2200,
      pricePerPax: 38,
      suggestedDuration: 5,
      features: [
        "Selecção de espaço premium",
        "Coordenação de catering",
        "Decoração temática",
        "Entretenimento",
        "Logística completa",
      ],
    },
  ],
  particulares: [
    {
      id: "casamentos",
      label: "Casamentos",
      description:
        "O dia mais especial da vossa vida, planeado ao pormenor com amor e dedicação total.",
      icon: "💒",
      minGuests: 30,
      maxGuests: 500,
      basePrice: 4500,
      pricePerPax: 42,
      suggestedDuration: 10,
      features: [
        "Planeamento completo (12 meses)",
        "Coordenação no dia",
        "Gestão de fornecedores",
        "Timeline detalhada",
        "Suporte pré-evento",
        "Visita ao espaço",
      ],
    },
    {
      id: "batizados",
      label: "Batizados & Comunhões",
      description:
        "Celebrações familiares intimistas com a ternura e personalização que a ocasião merece.",
      icon: "👶",
      minGuests: 15,
      maxGuests: 200,
      basePrice: 1400,
      pricePerPax: 24,
      suggestedDuration: 5,
      features: [
        "Tema personalizado",
        "Decoração floral",
        "Coordenação do dia",
        "Lembrança para convidados",
        "Fotografia dirigida",
      ],
    },
    {
      id: "aniversarios",
      label: "Festas de Aniversário",
      description:
        "Celebrações únicas para marcos importantes da sua vida com criatividade ao detalhe.",
      icon: "🎂",
      minGuests: 15,
      maxGuests: 300,
      basePrice: 1000,
      pricePerPax: 20,
      suggestedDuration: 6,
      features: [
        "Conceito criativo",
        "Decoração personalizada",
        "Entretenimento",
        "Bolo personalizado",
        "Gestão de convidados",
      ],
    },
    {
      id: "jantares_gala",
      label: "Jantares de Gala",
      description:
        "Experiências gastronómicas de luxo para ocasiões verdadeiramente especiais e memoráveis.",
      icon: "✨",
      minGuests: 20,
      maxGuests: 300,
      basePrice: 3200,
      pricePerPax: 52,
      suggestedDuration: 5,
      features: [
        "Chef de renome",
        "Menu degustação",
        "Sommelier dedicado",
        "Decoração de mesa premium",
        "Serviço de protocolo",
      ],
    },
  ],
  cultural: [
    {
      id: "cultural",
      label: "Eventos Culturais",
      description:
        "Festivais, concertos, espectáculos e manifestações culturais de impacto e alcance.",
      icon: "🎭",
      minGuests: 100,
      maxGuests: 5000,
      basePrice: 3500,
      pricePerPax: 10,
      suggestedDuration: 8,
      features: [
        "Licenciamentos",
        "Produção técnica",
        "Gestão artística",
        "Comunicação & PR",
        "Segurança e logística",
        "Gestão de bilheteira",
      ],
    },
    {
      id: "exposicoes",
      label: "Exposições & Inaugurações",
      description:
        "Inaugurações de arte, showrooms e espaços expositivos com elegância e rigor curatorial.",
      icon: "🖼️",
      minGuests: 30,
      maxGuests: 500,
      basePrice: 2000,
      pricePerPax: 0,
      suggestedDuration: 4,
      features: [
        "Montagem da exposição",
        "Iluminação curatorial",
        "Gestão de convites",
        "Catering de inauguração",
        "Catalogação e press kit",
      ],
    },
  ],
};

export const PACKAGES: {
  id: "essencial" | "completo" | "premium" | "personalizado";
  label: string;
  description: string;
  multiplier: number;
  highlight: boolean;
  badge: string | null;
  included: string[];
  notIncluded: string[];
}[] = [
  {
    id: "essencial",
    label: "Essencial",
    description:
      "O essencial para um evento de qualidade, gerido com competência e profissionalismo.",
    multiplier: 1.0,
    highlight: false,
    badge: null,
    included: [
      "Coordenação no dia do evento",
      "Plano de evento detalhado",
      "Gestão de fornecedores básica",
      "Reunião inicial de briefing",
      "Suporte por email e telefone",
      "Relatório pós-evento",
    ],
    notIncluded: [
      "Decoração incluída",
      "Fotografia profissional",
      "Assistente dedicado",
      "Reuniões de acompanhamento",
    ],
  },
  {
    id: "completo",
    label: "Completo",
    description:
      "A escolha mais popular — cobertura total e acompanhamento dedicado para um evento sem preocupações.",
    multiplier: 1.45,
    highlight: true,
    badge: "Mais popular",
    included: [
      "Tudo do Essencial",
      "Assistente dedicado no evento",
      "3 reuniões de acompanhamento",
      "Coordenação pré-evento (3 meses)",
      "Gestão de fornecedores premium",
      "Decoração base incluída",
      "Visita ao espaço incluída",
      "Checklist completo de fornecedores",
    ],
    notIncluded: ["Fotografia profissional", "Decoração floral premium", "Entretenimento ao vivo"],
  },
  {
    id: "premium",
    label: "Premium",
    description:
      "Experiência sem limites — cada detalhe tratado com perfeição absoluta e serviço de excelência.",
    multiplier: 2.1,
    highlight: false,
    badge: "Experiência total",
    included: [
      "Tudo do Completo",
      "Equipa dedicada de 3 elementos",
      "Acompanhamento personalizado 24/7",
      "Decoração floral premium incluída",
      "Fotografia profissional (8h)",
      "Vídeo cinematográfico incluído",
      "Rede de fornecedores exclusivos",
      "Gestão de convidados VIP",
      "Transporte coordenado",
      "Welcome kit personalizado",
    ],
    notIncluded: [],
  },
  {
    id: "personalizado",
    label: "Personalizado",
    description:
      "Monte o seu pacote à medida, seleccionando exactamente os serviços de que necessita.",
    multiplier: 1.0,
    highlight: false,
    badge: null,
    included: [
      "Escolha os serviços que precisa",
      "Flexibilidade total de configuração",
      "Orçamento adaptado ao detalhe",
    ],
    notIncluded: [],
  },
];

export const ADDON_CATALOG: AddonCatalogItem[] = [
  // Fotografia & Vídeo
  {
    id: "fotografia",
    name: "Fotografia Profissional",
    description:
      "Cobertura fotográfica completa do evento com edição profissional e galeria digital.",
    category: "Fotografia & Vídeo",
    icon: "📷",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "4h · 100 fotos editadas · galeria digital", price: 450 },
      completo: { label: "8h · 300 fotos · álbum 30×30cm", price: 850 },
      premium: { label: "12h · galeria completa · álbum premium · prints", price: 1600 },
    },
  },
  {
    id: "video",
    name: "Vídeo Cinematográfico",
    description: "Produção de vídeo profissional com edição cinemática em alta resolução.",
    category: "Fotografia & Vídeo",
    icon: "🎬",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Teaser 2min + highlights redes sociais", price: 680 },
      completo: { label: "Filme 10min + teaser + highlights + making of", price: 1250 },
      premium: { label: "Filme completo + making of + drone + 4K", price: 2400 },
    },
  },
  {
    id: "drone",
    name: "Filmagem com Drone",
    description: "Imagens aéreas impressionantes do evento e espaço em 4K.",
    category: "Fotografia & Vídeo",
    icon: "🚁",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "30min · edição básica · entrega digital", price: 280 },
      completo: { label: "1h · edição completa · integração no vídeo", price: 480 },
      premium: { label: "Jornada completa · 4K · plano de voo dedicado", price: 850 },
    },
  },
  {
    id: "photobooth",
    name: "Photobooth & Experiências",
    description: "Cabine fotográfica interactiva para entretenimento e memórias dos convidados.",
    category: "Fotografia & Vídeo",
    icon: "🤳",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Photobooth simples · impressão no local (4h)", price: 300 },
      completo: { label: "Photobooth premium · props · galeria digital (6h)", price: 520 },
      premium: { label: "360° Booth · GIFs · Boomerangs · branding (8h)", price: 900 },
    },
  },
  // Catering
  {
    id: "catering",
    name: "Catering & F&B",
    description: "Serviço completo de alimentação e bebidas gerido com rigor e elegância.",
    category: "Catering",
    icon: "🍽️",
    pricingType: "per_pax",
    tiers: {
      essencial: { label: "Cocktail de boas-vindas + coffee breaks", price: 22 },
      completo: { label: "Menu 3 pratos + vinho + open bar básico", price: 55 },
      premium: { label: "Menu degustação + sommelier + open bar premium", price: 98 },
    },
  },
  {
    id: "cocktail_bar",
    name: "Bar & Cocktails Personalizados",
    description: "Bartenders profissionais com cocktails signature para o seu evento.",
    category: "Catering",
    icon: "🍸",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "1 bartender · carta básica (4h)", price: 200 },
      completo: { label: "2 bartenders · carta premium · cocktail signature (6h)", price: 380 },
      premium: { label: "3 bartenders · masterclass · cocktails personalizados (8h)", price: 650 },
    },
  },
  {
    id: "bolo",
    name: "Bolo Artesanal Personalizado",
    description: "Bolo de confeitaria artesanal criado especialmente para a ocasião.",
    category: "Catering",
    icon: "🎂",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Bolo personalizado até 50 doses", price: 190 },
      completo: { label: "Bolo artesanal decorado até 100 doses", price: 380 },
      premium: { label: "Alta pastelaria + sobremesas buffet", price: 750 },
    },
    eventTypes: ["casamentos", "batizados", "aniversarios", "jantares_gala"],
  },
  // Decoração
  {
    id: "decoracao_floral",
    name: "Decoração Floral",
    description: "Arranjos florais profissionais criados pelo nosso floral designer.",
    category: "Decoração",
    icon: "💐",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Centros de mesa simples + entrada floral", price: 380 },
      completo: { label: "Decoração completa + arco floral + buquê", price: 950 },
      premium: { label: "Instalação floral statement + decoração total", price: 2200 },
    },
  },
  {
    id: "iluminacao",
    name: "Iluminação Profissional & Efeitos",
    description: "Iluminação técnica e artística para criar a atmosfera perfeita.",
    category: "Decoração",
    icon: "💡",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Iluminação ambiente + spots direccionais", price: 300 },
      completo: { label: "Iluminação dinâmica RGB + efeitos + instalação", price: 620 },
      premium: { label: "LED + laser + mapping + operador residente", price: 1300 },
    },
  },
  {
    id: "cenografia",
    name: "Cenografia & Design de Espaço",
    description: "Criação de cenários e elementos decorativos únicos e impactantes.",
    category: "Decoração",
    icon: "🏛️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Backdrop + elementos decorativos básicos", price: 420 },
      completo: { label: "Cenário personalizado + branding integrado", price: 980 },
      premium: { label: "Instalação imersiva exclusiva + produção completa", price: 2800 },
    },
  },
  // Entretenimento
  {
    id: "musica_ao_vivo",
    name: "Música ao Vivo",
    description: "Actuações musicais ao vivo seleccionadas para criar a atmosfera ideal.",
    category: "Entretenimento",
    icon: "🎵",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Duo acústico (2h) + repertório personalizado", price: 380 },
      completo: { label: "Quarteto (4h) + repertório + cocktail boas-vindas", price: 800 },
      premium: { label: "Banda completa (6h) + solista especial + surpresa", price: 2000 },
    },
  },
  {
    id: "dj",
    name: "DJ Profissional",
    description: "DJ residente com setup premium de som e luz para animar o evento.",
    category: "Entretenimento",
    icon: "🎧",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "DJ + sistema de som básico (4h)", price: 300 },
      completo: { label: "DJ + sistema premium + iluminação (6h)", price: 580 },
      premium: { label: "DJ headliner + setup completo + cabine (8h+)", price: 1200 },
    },
  },
  {
    id: "apresentador",
    name: "Apresentador / Mestre de Cerimónias",
    description: "Profissional experiente para conduzir o programa com elegância.",
    category: "Entretenimento",
    icon: "🎙️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Apresentador profissional (até 3h)", price: 380 },
      completo: { label: "Apresentador premium (até 6h) + guião", price: 700 },
      premium: { label: "Apresentador TV/rádio + ensaio + guião completo", price: 1400 },
    },
  },
  {
    id: "animacao",
    name: "Animação & Actividades",
    description: "Actividades lúdicas e experiências de animação para os convidados.",
    category: "Entretenimento",
    icon: "🎪",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "1 actividade + animador (2h)", price: 220 },
      completo: { label: "3 actividades + equipa de 2 (4h)", price: 480 },
      premium: { label: "Programa completo + surpresa + experiências imersivas", price: 950 },
    },
  },
  // Produção Técnica
  {
    id: "som_profissional",
    name: "Sistema de Som Profissional",
    description: "Equipamento de áudio de alta qualidade com técnico de som certificado.",
    category: "Produção Técnica",
    icon: "🔊",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "PA básico + microfone sem fio + mixer", price: 200 },
      completo: { label: "PA profissional + microfones + técnico residente", price: 420 },
      premium: { label: "Sistema line array + técnico + teste técnico completo", price: 950 },
    },
  },
  {
    id: "projecao_led",
    name: "Vídeo, Projecção & LED",
    description: "Ecrãs, projectores e soluções de visualização de alto impacto.",
    category: "Produção Técnica",
    icon: "📽️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Projector + ecrã 3m + montagem técnica", price: 240 },
      completo: { label: "2 ecrãs LED + técnico AV + integração completa", price: 620 },
      premium: { label: "Video wall LED + técnico + integração total + backup", price: 1500 },
    },
  },
  {
    id: "streaming",
    name: "Streaming & Transmissão ao Vivo",
    description: "Transmissão profissional do evento para audiências remotas em todo o mundo.",
    category: "Produção Técnica",
    icon: "📡",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Stream básico 1 câmara + link privado + gravação", price: 320 },
      completo: { label: "Stream multi-câmara + moderação + gravação HD", price: 700 },
      premium: { label: "Produção broadcast + realização + servidor dedicado", price: 1500 },
    },
  },
  // Logística
  {
    id: "transporte",
    name: "Transporte & Transferes",
    description: "Gestão completa de transportes para convidados, staff e fornecedores.",
    category: "Logística",
    icon: "🚌",
    pricingType: "per_unit",
    tiers: {
      essencial: { label: "Minibus 9 lugares por viagem", price: 130 },
      completo: { label: "Autocarro 50 lugares por viagem", price: 300 },
      premium: { label: "Frota dedicada + coordenador de transportes (dia)", price: 900 },
    },
  },
  {
    id: "seguranca",
    name: "Segurança Privada",
    description: "Serviço de segurança profissional e discreto para o evento.",
    category: "Logística",
    icon: "🔒",
    pricingType: "per_unit",
    tiers: {
      essencial: { label: "1 segurança por turno de 8h", price: 200 },
      completo: { label: "3 seguranças + coordenador por turno de 8h", price: 520 },
      premium: { label: "Equipa completa + plano de segurança personalizado", price: 1050 },
    },
  },
  {
    id: "traducao",
    name: "Tradução & Interpretação Simultânea",
    description: "Serviços de interpretação profissional para eventos internacionais.",
    category: "Logística",
    icon: "🌐",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "1 intérprete + 1 idioma (por sessão)", price: 380 },
      completo: { label: "2 intérpretes + 2 idiomas + cabine", price: 820 },
      premium: { label: "Equipa multilingue + cabines + equipamento receptor", price: 1600 },
    },
    eventTypes: ["conferencias", "lancamentos", "cultural"],
  },
  // Comunicação
  {
    id: "convites_papelaria",
    name: "Convites & Papelaria Premium",
    description: "Design exclusivo e produção de convites e materiais personalizados.",
    category: "Comunicação",
    icon: "✉️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Convite digital + save the date (gestão envios)", price: 200 },
      completo: { label: "Convite impresso + digital + papelaria base (200 un)", price: 450 },
      premium: { label: "Kit completo premium + embalagem especial (500 un)", price: 1050 },
    },
  },
  {
    id: "pr_comunicacao",
    name: "Relações Públicas & Media",
    description: "Gestão de comunicação, cobertura mediática e presença digital do evento.",
    category: "Comunicação",
    icon: "📰",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Press release + 3 publicações redes sociais", price: 280 },
      completo: { label: "Gestão redes sociais + press + acreditação media", price: 600 },
      premium: { label: "Agência PR dedicada + media planning + influencers", price: 1600 },
    },
  },
];

export const LOCATION_SURCHARGES: Record<LocationType, number> = {
  lisboa: 0,
  porto: 0.08,
  grande_cidade: 0.15,
  pequena_cidade: 0.25,
  internacional: 0.5,
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  lisboa: "Lisboa e Área Metropolitana",
  porto: "Porto e Área Metropolitana",
  grande_cidade: "Outra Grande Cidade (Coimbra, Braga…)",
  pequena_cidade: "Cidade Pequena / Zona Rural",
  internacional: "Internacional / Destino",
};

export const BUDGET_RANGES: { id: string; label: string }[] = [
  { id: "ate_5k", label: "Até €5.000" },
  { id: "5k_15k", label: "€5.000 – €15.000" },
  { id: "15k_30k", label: "€15.000 – €30.000" },
  { id: "30k_60k", label: "€30.000 – €60.000" },
  { id: "60k_plus", label: "€60.000 ou mais" },
];

export const URGENCY_OPTIONS: {
  id: string;
  label: string;
  description: string;
  surchargeLabel: string;
  surcharge: number;
}[] = [
  {
    id: "standard",
    label: "Standard",
    description: "Mais de 30 dias de antecedência",
    surchargeLabel: "Sem acréscimo",
    surcharge: 0,
  },
  {
    id: "rush",
    label: "Urgente",
    description: "15 a 30 dias de antecedência",
    surchargeLabel: "+20%",
    surcharge: 0.2,
  },
  {
    id: "urgente",
    label: "Muito Urgente",
    description: "Menos de 15 dias de antecedência",
    surchargeLabel: "+40%",
    surcharge: 0.4,
  },
];

export const REFERRAL_SOURCES = [
  "Pesquisa no Google",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Recomendação de amigo ou familiar",
  "Recomendação profissional",
  "Evento anterior",
  "Imprensa / Media",
  "Outro",
];

export const ADDON_CATEGORIES = [
  "Fotografia & Vídeo",
  "Catering",
  "Decoração",
  "Entretenimento",
  "Produção Técnica",
  "Logística",
  "Comunicação",
];
