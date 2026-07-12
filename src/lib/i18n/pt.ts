/**
 * Portuguese dictionary — the source-of-truth shape. `Dict = typeof pt`, so
 * the English dictionary (en.ts) is type-checked to mirror this exactly: a
 * missing or misspelled key fails `tsc`. Grow both files together.
 */
export const pt = {
  skipLink: "Saltar para o conteúdo",

  testimonials: [
    {
      name: "António Bettencourt",
      role: "Evento Corporativo",
      quote:
        "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
    },
    {
      name: "Alexandra Teixeira",
      role: "Evento Social",
      quote:
        "A dedicação da equipa em criar ambientes mágicos, com decoração impecável e coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.",
    },
    {
      name: "Stephanie & Mizio",
      role: "Evento Privado",
      quote: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
    },
    {
      name: "Teresinha Malta",
      role: "Evento Social",
      quote:
        "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
    },
  ],

  langToggle: {
    label: "Idioma",
    pt: "PT",
    en: "EN",
    switchToPt: "Mudar para português",
    switchToEn: "Mudar para inglês",
  },

  nav: {
    inicio: "Início",
    menuLabel: "Menu",
    sobre: "Sobre",
    servicos: "Serviços",
    galeria: "Galeria",
    clientes: "Clientes",
    contacto: "Contacto",
    orcamento: "Orçamento",
    pedirOrcamento: "Pedir Orçamento",
  },

  common: {
    pedirOrcamento: "Pedir Orçamento",
    verGaleria: "Ver galeria",
    verServicos: "Ver serviços",
    entrarContacto: "Entrar em Contacto",
    falarConnosco: "Falar connosco",
    voltarInicio: "Voltar ao início",
    abrirWhatsApp: "Abrir WhatsApp",
    enviarEmail: "Enviar e-mail",
    contactWhatsApp: "Contactar pelo WhatsApp",
    clientsSay: "O que dizem os clientes",
    whatsappPrefill: "Olá, gostaria de saber mais sobre a organização de eventos.",
  },

  meta: {
    ogLocale: "pt_PT",
    homeTitle: "Líquen Events — Organização de Eventos no Alentejo e em Portugal",
    homeDescription:
      "Empresa de organização de eventos. Casamentos, eventos corporativos e celebrações em todo o Alentejo, Lisboa e Portugal. Soluções à medida — peça orçamento.",
    sobreTitle: "Sobre Nós — Empresa de Eventos",
    sobreDescription:
      "Conheça a Líquen Events, empresa de organização de eventos. Mais de 100 eventos no Alentejo, Lisboa e em todo o Portugal — casamentos, eventos corporativos e celebrações.",
    servicosTitle: "Serviços — Casamentos e Eventos Corporativos no Alentejo",
    servicosDescription:
      "Organização de casamentos, eventos corporativos, conferências e festas privadas no Alentejo, Lisboa e todo o Portugal. Soluções à medida do seu evento.",
    galeriaTitle: "Galeria de Eventos — Alentejo",
    galeriaDescription:
      "Galeria de fotografias dos eventos organizados pela Líquen Events no Alentejo e todo o Portugal — casamentos, eventos corporativos, conferências e celebrações.",
    clientesTitle: "Clientes — Quem Confia na Líquen Events",
    clientesDescription:
      "Empresas e instituições que confiam na Líquen Events: José de Mello, Aernnova, Mainova, Universidade de Évora, Câmara Municipal de Évora, Pérez-Llorca e muito mais.",
    contactoTitle: "Contacto — Peça o Seu Orçamento de Evento",
    contactoDescription:
      "Contacte a Líquen Events para organizar o seu evento no Alentejo, Lisboa ou em qualquer ponto de Portugal. Respondemos em menos de 24 horas com uma proposta à medida.",
    orcamentoTitle: "Pedido de Orçamento",
    orcamentoDescription:
      "Peça o seu orçamento à Líquen Events. Diga-nos o tipo de evento, a data e o número de pessoas — respondemos com uma proposta à medida em menos de 24 horas.",
  },

  home: {
    eyebrow: "Organização de eventos",
    heroLines: [
      { words: ["Eventos", "que"] },
      { words: ["ficam", "na"] },
      { words: ["memória."], moss: true },
    ] as { words: string[]; moss?: boolean }[],
    scroll: "Scroll",
    servicesEyebrow: "O que fazemos",
    services: [
      { tag: "Empresas", title: "Corporativos" },
      { tag: "Celebrações", title: "Casamentos" },
      { tag: "Celebrações", title: "Privados" },
    ],
    areasEyebrow: "Onde quiser",
    areasTitleLine1: "Eventos sem",
    areasTitleLine2: "fronteiras",
    areasText:
      "Casamentos, eventos corporativos e celebrações — do conceito à execução, tratamos de cada detalhe para que só tenha de viver o momento, onde quer que seja.",
    areasTags: [
      "Casamentos",
      "Eventos corporativos",
      "Conferências",
      "Festas privadas",
      "Jantares de gala",
    ],
    ctaEyebrow: "Próximo passo",
    ctaTitleLine1: "Tem um evento",
    ctaTitleLine2: "em mente?",
    ctaText:
      "Conte-nos a sua ideia. Sem compromisso — respondemos com uma proposta à medida em menos de 24 horas.",
  },

  sobre: {
    heroEyebrow: "Quem somos",
    heroTitlePre: "Sobre a ",
    heroTitleMoss: "Líquen.",
    scroll: "Scroll",
    manifestoEyebrow: "A nossa essência",
    manifestoTitleLine1: "Organizamos eventos.",
    manifestoTitleLine2: "Eternizamos memórias.",
    manifestoText: "Desde 2018 que transformamos visões em experiências — em todo o Portugal.",
    statementLead: "Não organizamos apenas eventos.",
    statementRest: " Desenhamos experiências que ficam para sempre.",
    founderEyebrow: "As pessoas",
    founderQuote: "Cada evento é uma oportunidade de criar algo extraordinário. É o que nos move.",
    founderName: "Catarina Gaspar",
    founderRole: "Fundadora & CEO",
    ctaEyebrow: "Vamos criar juntos",
    ctaTitleLine1: "Vamos trabalhar",
    ctaTitleMoss: "juntos?",
    ctaText: "Da primeira conversa ao último brinde, tratamos de cada detalhe do seu evento.",
  },

  galeria: {
    headerLabel: "Os nossos momentos",
    headerTitle: "Galeria",
    headerDesc: "Casamentos, eventos corporativos e celebrações — capturados ao pormenor.",
    instaEyebrow: "Redes sociais",
    instaTitle: "Siga-nos no Instagram",
    instaText: "Partilhamos os bastidores dos nossos eventos e inspirações diárias.",
    verMais: "Ver mais",
    de: "de",
    labels: {
      Todos: "Todos",
      Casamento: "Casamento",
      Corporativo: "Corporativo",
      Conferência: "Conferência",
      Aéreo: "Aéreo",
      Evento: "Evento",
    },
    alt: {
      Casamento: "Casamento organizado pela Líquen Events no Alentejo",
      Corporativo: "Evento corporativo organizado pela Líquen Events",
      Conferência: "Conferência organizada pela Líquen Events",
      Aéreo: "Vista aérea de evento da Líquen Events",
      Evento: "Evento organizado pela Líquen Events em Portugal",
    },
    lbGallery: "Galeria",
    lbPhoto: "foto",
    lbOf: "de",
    lbPlay: "Iniciar slideshow",
    lbPause: "Pausar slideshow",
    lbClose: "Fechar",
    lbPrev: "Foto anterior",
    lbNext: "Foto seguinte",
    viewWedding: "Ver este casamento",
    backToGallery: "Toda a galeria",
    photosLabel: "fotos",
    backToTop: "Voltar ao topo",
  },

  clientes: {
    heroEyebrow: "Quem confia em nós",
    heroTitleLine1: "Os Nossos",
    heroTitleMoss: "Clientes.",
    heroLead:
      "Empresas, instituições e famílias que nos escolheram para os seus momentos mais especiais — e que nos honram com a sua confiança.",
    scroll: "Scroll",
    leadPre:
      "De grandes empresas a celebrações de família, são dezenas os que confiam à Líquen Events os seus momentos mais importantes — e a essa confiança respondemos com ",
    leadMoss: "rigor, criatividade e dedicação",
    leadPost: " em cada detalhe.",
    desde: "Desde",
    logosEyebrow: "Empresas & instituições",
    logosTitle: "Marcas que confiam em nós",
    clientesCount: "clientes",
    featuredEyebrow: "Testemunhos",
    featuredQuote:
      "A dedicação da equipa em criar ambientes mágicos, com decoração impecável e coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.",
    featuredName: "Alexandra Teixeira",
    featuredRole: "Evento Social",
    gridTitle: "Palavras de quem confiou.",
    testimonials: [
      {
        name: "António Bettencourt",
        text: "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
        event: "Evento Corporativo",
      },
      {
        name: "Stephanie & Mizio",
        text: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
        event: "Evento Privado",
      },
      {
        name: "Teresinha Malta",
        text: "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
        event: "Evento Social",
      },
      {
        name: "Ana Pinho",
        text: "Excelente, recomendo sem qualquer reserva. Uma equipa de confiança do início ao fim.",
        event: "Evento Privado",
      },
    ],
    mosaicEyebrow: "Momentos dos nossos eventos",
    mosaicLabels: [
      "Corporativo",
      "Casamento",
      "Gala",
      "Casamento",
      "Jantar",
      "Gala",
      "Institucional",
    ],
    ctaEyebrow: "Próximo evento",
    ctaTitleLine1: "Junte-se aos",
    ctaTitleLine2: "nossos clientes.",
    ctaText:
      "Conte-nos a sua ideia e mostramos-lhe como a podemos transformar num evento memorável.",
  },

  contacto: {
    testimonialsEyebrow: "O que dizem os nossos clientes",
    nextEyebrow: "O que acontece a seguir",
    steps: [
      {
        title: "Recebemos o seu pedido",
        desc: "Analisamos o seu pedido e preparamos uma resposta à medida.",
      },
      { title: "Entramos em contacto", desc: "Em menos de 24 horas, marcamos uma conversa." },
      { title: "Proposta à medida", desc: "Proposta detalhada, com orçamento transparente." },
      { title: "Começamos a criar", desc: "Tratamos de cada detalhe para um evento inesquecível." },
    ],
    faqEyebrow: "Perguntas frequentes",
    faqTitleLine1: "Tem",
    faqTitleLine2: "dúvidas?",
    faqSub: "Se não encontrar a resposta que procura, contacte-nos diretamente.",
    whatsappEyebrow: "Resposta imediata",
    whatsappTitleLine1: "Prefere falar",
    whatsappTitleLine2: "agora?",
    whatsappText:
      "Fale connosco diretamente pelo WhatsApp. Estamos disponíveis de segunda a sexta, das 9h às 18h.",
    form: {
      heroEyebrow: "Fale connosco",
      heroTitleLine1: "Vamos criar algo",
      heroTitleMoss: "extraordinário.",
      infoEyebrow: "Encontre-nos",
      emailLabel: "E-mail",
      emailSub: "Respondemos em menos de 24 horas",
      phoneLabel: "Telefone",
      phoneSub: "Seg–Sex, 9h–18h",
      locationLabel: "Localização",
      locationValue: "Portugal",
      locationSub: "Reuniões presenciais disponíveis",
      quoteLink: "Pedir orçamento para o seu evento",
      whatsappLink: "Falar pelo WhatsApp",
      promise:
        "Respondemos a todos os pedidos em menos de 24 horas úteis, com uma proposta personalizada.",
      promiseSign: "— Equipa Líquen Events",
      stepLabels: ["Evento", "Dados", "Detalhes", "Mensagem"],
      eventCards: [
        { value: "Corporativo", desc: "Conferências, teambuildings, jantares" },
        { value: "Casamento", desc: "O dia mais especial da vossa vida" },
        { value: "Aniversário", desc: "Festas e celebrações memoráveis" },
        { value: "Jantar de Gala", desc: "Eventos sociais de prestígio" },
        { value: "Outro", desc: "Evento personalizado à sua medida" },
      ],
      guestRanges: ["Até 30", "30–80", "80–150", "150–300", "300+"],
      budgetRanges: ["< 5.000 €", "5.000–15.000 €", "15.000–30.000 €", "30.000 €+", "A definir"],
      step1Title1: "Que tipo de evento",
      step1Title2: "está a planear?",
      step1Sub: "Selecione a opção que melhor descreve o seu evento.",
      step2Title: "Diga-nos quem é.",
      step2Sub: "Os seus dados de contacto para falarmos consigo.",
      step3Title: "Detalhes do evento.",
      step3Sub: "Ajude-nos a perceber a dimensão e o timing.",
      step4Title: "A sua visão.",
      step4Sub: "Descreva o evento dos seus sonhos. Quanto mais detalhe, melhor.",
      labelNome: "Nome *",
      labelEmail: "E-mail *",
      labelTelefone: "Telefone",
      labelData: "Data Prevista",
      labelConvidados: "Nº de Convidados",
      labelOrcamento: "Orçamento (opcional)",
      labelMensagem: "Mensagem *",
      phName: "O seu nome completo",
      phEmail: "email@exemplo.com",
      phPhone: "+351 9XX XXX XXX",
      msgPrefix: "Tipo de evento: ",
      phMensagem: "Local preferido, temática, inspirações, detalhes especiais...",
      summaryEvento: "Evento",
      summaryConvidados: "Convidados",
      summaryOrcamento: "Orçamento",
      summaryData: "Data",
      continuar: "Continuar",
      voltar: "Voltar",
      enviar: "Enviar Pedido",
      enviando: "A enviar…",
      resposta24: "Resposta em 24h",
      errNome: "Indique o seu nome",
      errEmail: "Email inválido",
      error: "Não foi possível enviar. Tente novamente ou contacte-nos pelo WhatsApp.",
      successEyebrow: "Enviado com sucesso",
      successTitle1: "Mensagem",
      successTitle2: "recebida.",
      successThanks: "Obrigado",
      successText: ". Em breve entraremos em contacto para avançarmos juntos no seu evento.",
      successSteps: [
        { n: "01", t: "Analisamos o seu pedido", d: "Nas próximas horas" },
        { n: "02", t: "Entramos em contacto", d: "Em menos de 24 horas" },
        { n: "03", t: "Enviamos proposta à medida", d: "Personalizada para si" },
      ],
      successWhatsApp: "Acompanhar pelo WhatsApp",
    },
    faqs: [
      {
        q: "Com quanto tempo de antecedência devo contactar?",
        a: "Para casamentos recomendamos pelo menos 12 meses de antecedência. Para eventos corporativos, 3 a 6 meses é o ideal. Para celebrações mais simples, 4 a 8 semanas é geralmente suficiente.",
      },
      {
        q: "Trabalham em todo o território nacional?",
        a: "Sim. Trabalhamos em todo o Portugal continental e ilhas. Temos uma vasta rede de fornecedores e parceiros em diversas regiões.",
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
    ],
  },

  orcamento: {
    back: "Líquen Events",
    eyebrow: "Pedido de orçamento",
    titleLine1: "Conte-nos",
    titleMoss: "a sua ideia.",
    lead: "Sem compromisso. Respondemos com uma proposta à medida em menos de 24 horas.",
    eventTypeLabels: [
      "Casamento",
      "Corporativo",
      "Aniversário",
      "Batizado / Comunhão",
      "Jantar de Gala",
      "Outro",
    ],
    labelTipo: "Tipo de evento *",
    labelData: "Data do evento",
    labelPessoas: "Nº de pessoas",
    labelNome: "Nome *",
    labelEmail: "Email *",
    labelTelefone: "Telefone",
    labelMensagem: "Mensagem",
    phPessoas: "Ex.: 120",
    phNome: "O seu nome",
    phEmail: "email@exemplo.com",
    phTelefone: "+351 9XX XXX XXX",
    phMensagem: "Conte-nos o que imagina para o seu evento — local, ambiente, detalhes especiais…",
    errNome: "Indique o seu nome",
    errEmail: "Email inválido",
    enviar: "Enviar pedido",
    enviando: "A enviar…",
    ouWhatsApp: "ou pelo WhatsApp",
    error: "Não foi possível enviar. Tente novamente ou fale connosco pelo WhatsApp.",
    requiredNote: "Os campos marcados com * são obrigatórios. Resposta em menos de 24 horas úteis.",
  },

  servicos: {
    heroEyebrow: "O que oferecemos",
    heroTitle: ["Cada evento,", "uma história", "por contar."],
    heroLead:
      "Especializados em casamentos, eventos corporativos e celebrações privadas — soluções personalizadas adaptadas ao seu estilo, gosto e orçamento.",
    imgCorporativos: "Corporativos",
    imgCelebracoes: "Celebrações",
    nav: ["Empresas", "Celebrações"],
    verMais: "Ver mais",
    verDetalhes: "Ver detalhes",
    band1: ["Eventos Corporativos", "Casamentos", "Celebrações"],
    band2: ["Corporativo", "Casamentos", "Celebrações"],
    categories: [
      {
        label: "Empresas",
        subtitle: "Para empresas",
        desc: "Elevamos a imagem da sua marca através de eventos que transformam equipas e celebram conquistas.",
        services: [
          {
            title: "Conferências & Congressos",
            desc: "Organização completa de conferências empresariais, da logística ao audiovisual.",
          },
          {
            title: "Teambuilding",
            desc: "Actividades e experiências que unem equipas e fortalecem a cultura organizacional.",
          },
          {
            title: "Lançamentos de Produto",
            desc: "Eventos de impacto para apresentar novos produtos ao mercado com criatividade.",
          },
          {
            title: "Jantares de Empresa",
            desc: "Desde jantares de Natal a gala awards, criamos momentos de celebração memoráveis.",
          },
        ],
      },
      {
        label: "Celebrações",
        subtitle: "Para particulares",
        desc: "Os momentos mais importantes da sua vida, planeados ao pormenor com cuidado e elegância.",
        services: [
          {
            title: "Casamentos",
            desc: "O vosso dia mais especial, planeado ao pormenor. Da escolha do espaço ao último detalhe.",
          },
          {
            title: "Batizados & Comunhões",
            desc: "Celebrações familiares íntimas e cheias de significado, organizadas com carinho.",
          },
          {
            title: "Festas de Aniversário",
            desc: "Festas temáticas ou clássicas para todas as idades. Cada aniversário é uma história.",
          },
          {
            title: "Jantares de Gala",
            desc: "Eventos sociais de prestígio com ambiente sofisticado e coordenação impecável.",
          },
        ],
      },
    ],
    seoEyebrow: "Onde atuamos",
    seoTitle: "Lisboa e todo o Portugal",
    seoText:
      "Casamentos, eventos corporativos e celebrações — do conceito à execução, com a sensibilidade do Alentejo e a exigência de uma equipa profissional.",
    ctaEyebrow: "Próximo passo",
    ctaTitleLine1: "Tem um evento",
    ctaTitleMoss: "em mente?",
    ctaText:
      "Fale connosco. Sem compromisso, sem custo. Ouvimos a sua ideia e apresentamos uma proposta à sua medida.",
    ctaGaleria: "Ver a galeria",
  },

  confirmacao: {
    loading: "A carregar…",
    statusLabels: {
      pendente: "Pedido Recebido",
      em_revisao: "Em Revisão",
      cotado: "Proposta Enviada",
      aceite: "Aceite",
      rejeitado: "Rejeitado",
    },
    successEyebrow: "Pedido enviado com sucesso",
    titleLine1: "Recebemos o",
    titleMoss: "vosso pedido.",
    lead: "A nossa equipa irá analisar o pedido e entrar em contacto em menos de 24 horas úteis com uma proposta personalizada.",
    refLabel: "Referência do Pedido",
    categoria: "Categoria",
    tipo: "Tipo",
    pacote: "Pacote",
    convidados: "Convidados",
    data: "Data",
    local: "Local",
    adicionais: "Serviços Adicionais",
    noDataNote:
      "Guarde a referência acima. Enviámos os detalhes para a nossa equipa e entraremos em contacto consigo brevemente.",
    footerNote: "Proposta formal enviada após análise do pedido pela nossa equipa.",
    proximosPassos: "Próximos passos",
    steps: [
      { label: "Análise do pedido", desc: "A nossa equipa analisa todos os detalhes." },
      { label: "Proposta personalizada", desc: "Enviamos uma proposta detalhada por email." },
      { label: "Reunião de briefing", desc: "Marcamos uma reunião para alinhar a visão." },
      { label: "Produção do evento", desc: "Tomamos conta de tudo para si." },
    ],
    contactIntro: "Para qualquer questão, pode contactar-nos diretamente:",
    voltarInicio: "Voltar ao Início",
    novoPedido: "Novo Pedido",
    dateLocale: "pt-PT",
  },

  servicoDetalhe: {
    includesTitle: "O que inclui",
    faqTitle: "Perguntas frequentes",
    relatedTitle: "Outros serviços",
    ctaTitle: "Vamos planear o seu evento?",
  },

  proposta: {
    linkInvalidTitle: "Link inválido ou expirado",
    linkInvalidBody:
      "Este link de proposta já não é válido. Contacte-nos e enviamos-lhe um novo com todo o gosto.",
    notFoundTitle: "Proposta não encontrada",
    notFoundBody:
      "Não conseguimos encontrar esta proposta. Se acha que é um engano, fale connosco.",
    eyebrow: "Proposta para o seu evento",
    greeting: "Olá",
    intro:
      "Preparámos esta proposta com todo o cuidado para o seu evento. Reveja os detalhes e responda-nos aqui mesmo — será um prazer avançar consigo.",
    tableDescricao: "Descrição",
    tableQt: "Qt",
    tableValor: "Valor",
    subtotal: "Subtotal",
    iva: "IVA",
    total: "Total",
    validoAte: "Válida até",
    footerNote: "Alguma questão ou ajuste? Responda a este e-mail ou contacte-nos —",
    dateLocale: "pt-PT",
    response: {
      confirmRecusar: "Tem a certeza que pretende recusar a proposta?",
      aceiteTitle: "Proposta aceite — obrigado!",
      aceiteBody:
        "Que alegria avançar consigo. A nossa equipa entra em contacto em breve com os próximos passos.",
      rejeitadaTitle: "Resposta registada.",
      rejeitadaBody:
        "Obrigado por nos dizer. Se mudar de ideias ou quiser ajustar algo, estamos sempre ao dispor.",
      jaRegistado: "Já tínhamos registado a sua resposta a esta proposta.",
      aceitar: "Aceitar proposta →",
      aceitarSending: "A registar…",
      recusar: "Recusar",
      recusarSending: "…",
      errorFallback: "Não foi possível registar a sua resposta.",
      errorGeneric: "Erro. Tente novamente.",
      errorSuffix: "Em alternativa,",
      errorLink: "escreva-nos",
    },
  },

  errors: {
    notFoundEyebrow: "Página não encontrada",
    notFoundTitle: "Este caminho não existe.",
    notFoundText:
      "A página que procura pode ter sido movida ou já não está disponível. Mas o seu próximo evento ainda está à espera de ser criado.",
    errorEyebrow: "Algo correu mal",
    errorTitle: "Ocorreu um erro inesperado.",
    errorText:
      "Pedimos desculpa pelo incómodo. Tente novamente — se o problema persistir, contacte-nos diretamente e teremos todo o gosto em ajudar.",
    retry: "Tentar novamente",
    loading: "A carregar",
  },

  footer: {
    sloganLine1: "Organizamos eventos,",
    sloganLine2: "eternizamos memórias.",
    disponivel: "Disponível para novos eventos",
    paginas: "Páginas",
    contacto: "Contacto",
    country: "Portugal",
    pedirOrcamento: "Pedir orçamento",
    rights: "Todos os direitos reservados",
  },
};

export type Dict = typeof pt;
