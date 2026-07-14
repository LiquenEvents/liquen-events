import type { Dict } from "./pt";

/**
 * English dictionary — typed against the Portuguese shape (`Dict`), so any
 * missing/extra key is a compile error. Keep it in sync with pt.ts.
 */
export const en: Dict = {
  skipLink: "Skip to content",

  testimonials: [
    {
      name: "António Bettencourt",
      role: "Corporate Event",
      quote:
        "The atmosphere your team created elevated the image of our event. We were impressed by the sophistication of the décor.",
    },
    {
      name: "Alexandra Teixeira",
      role: "Social Event",
      quote:
        "The team's dedication to creating magical settings, with impeccable décor and flawless coordination, let us enjoy the event without a single worry.",
    },
    {
      name: "Stephanie & Mizio",
      role: "Private Event",
      quote: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
    },
    {
      name: "Teresinha Malta",
      role: "Social Event",
      quote:
        "Outstanding service, with great care and availability from the whole team. They exceeded every expectation.",
    },
  ],

  langToggle: {
    label: "Language",
    pt: "PT",
    en: "EN",
    switchToPt: "Switch to Portuguese",
    switchToEn: "Switch to English",
  },

  nav: {
    inicio: "Home",
    menuLabel: "Menu",
    sobre: "About",
    servicos: "Services",
    galeria: "Gallery",
    clientes: "Clients",
    contacto: "Contact",
    orcamento: "Quote",
    pedirOrcamento: "Request a Quote",
  },

  common: {
    pedirOrcamento: "Request a Quote",
    verGaleria: "View gallery",
    verServicos: "View services",
    entrarContacto: "Get in Touch",
    falarConnosco: "Talk to us",
    voltarInicio: "Back to home",
    abrirWhatsApp: "Open WhatsApp",
    enviarEmail: "Send e-mail",
    contactWhatsApp: "Contact us on WhatsApp",
    clientsSay: "What our clients say",
    reviewsLabel: "reviews",
    testemunhoLabel: "Testimonial",
    whatsappPrefill: "Hi, I'd like to know more about your event planning services.",
  },

  meta: {
    ogLocale: "en_US",
    homeTitle: "Event & Wedding Planning in Évora, Portugal | Líquen Events",
    homeDescription:
      "Event planning based in Évora: weddings, corporate events and celebrations across the Alentejo and Portugal. Bespoke solutions — request a quote.",
    sobreTitle: "Event Planning Company in the Alentejo",
    sobreDescription:
      "Líquen Events, an event planning company in Évora. Over 100 weddings, corporate events and celebrations across the Alentejo and Portugal.",
    servicosTitle: "Weddings and Corporate Events in the Alentejo",
    servicosDescription:
      "Planning of weddings, corporate events, conferences and private parties in Évora, the Alentejo and across Portugal. Bespoke solutions for your event.",
    galeriaTitle: "Wedding & Event Gallery — Alentejo",
    galeriaDescription:
      "Photo gallery of events organised by Líquen Events in the Alentejo and across Portugal — weddings, corporate events, conferences and celebrations.",
    clientesTitle: "Companies and Institutions That Trust Us",
    clientesDescription:
      "Companies and institutions that trust Líquen Events: University of Évora, Évora City Council, José de Mello, Aernnova, Mainova and many more.",
    contactoTitle: "Contact — Request Your Event Quote",
    contactoDescription:
      "Contact Líquen Events to plan your event in Évora, the Alentejo or across Portugal. We reply within 24 hours with a tailored proposal.",
    orcamentoTitle: "Request a Quote — Weddings & Events",
    orcamentoDescription:
      "Request your quote from Líquen Events. Tell us the event type, date and number of guests — we'll reply with a tailored proposal in under 24 hours.",
  },

  // JSON-LD structured data (StructuredData.tsx) — kept in the dictionary so
  // the markup's language always matches the visible page's.
  jsonld: {
    hasOfferCatalogName: "Event planning services",
    services: [
      "Wedding planning",
      "Corporate events and conferences",
      "Private parties and celebrations",
      "Gala dinners and social events",
    ],
  },

  home: {
    eyebrow: "Event planning · Évora · Alentejo",
    heroLines: [
      { words: ["Events", "that"] },
      { words: ["stay", "with"] },
      { words: ["you."], moss: true },
    ],
    scroll: "Scroll",
    wallEyebrow: "Our work",
    wallTitle: "Unforgettable moments",
    servicesEyebrow: "What we do",
    services: [
      { tag: "Companies", title: "Corporate" },
      { tag: "Celebrations", title: "Weddings" },
      { tag: "Celebrations", title: "Private" },
    ],
    ctaEyebrow: "Next step",
    ctaTitleLine1: "Have an event",
    ctaTitleLine2: "in mind?",
    ctaText:
      "Tell us your idea. No commitment — we reply with a tailored proposal in under 24 hours.",
  },

  sobre: {
    heroEyebrow: "Who we are",
    heroTitlePre: "About ",
    heroTitleMoss: "Líquen.",
    scroll: "Scroll",
    manifestoEyebrow: "Our essence",
    manifestoTitleLine1: "We craft events.",
    manifestoTitleLine2: "We immortalise memories.",
    manifestoText: "Since 2018 we've turned visions into experiences — across Portugal.",
    statementLead: "We don't just plan events.",
    statementRest: " We design experiences that last forever.",
    founderEyebrow: "The people",
    founderQuote:
      "Every event is a chance to create something extraordinary. That's what drives us.",
    founderName: "Catarina Gaspar",
    founderRole: "Founder & CEO",
    ctaEyebrow: "Let's create together",
    ctaTitleLine1: "Shall we work",
    ctaTitleMoss: "together?",
    ctaText: "From the first conversation to the last toast, we handle every detail of your event.",
  },

  galeria: {
    headerLabel: "Our moments",
    headerTitle: "Gallery",
    headerDesc: "Weddings, corporate events and celebrations — captured in detail.",
    instaEyebrow: "Social media",
    instaTitle: "Follow us on Instagram",
    instaText: "We share behind-the-scenes from our events and daily inspiration.",
    verMais: "View more",
    de: "of",
    labels: {
      Todos: "All",
      Casamento: "Wedding",
      Corporativo: "Corporate",
      Conferência: "Conference",
      Aéreo: "Aerial",
      Evento: "Event",
    },
    alt: {
      Casamento: "Wedding organised by Líquen Events in the Alentejo",
      Corporativo: "Corporate event organised by Líquen Events",
      Conferência: "Conference organised by Líquen Events",
      Aéreo: "Aerial view of a Líquen Events event",
      Evento: "Event organised by Líquen Events in Portugal",
    },
    lbGallery: "Gallery",
    lbPhoto: "photo",
    lbOf: "of",
    lbPlay: "Start slideshow",
    lbPause: "Pause slideshow",
    lbClose: "Close",
    lbPrev: "Previous photo",
    lbNext: "Next photo",
    viewWedding: "View this wedding",
    backToGallery: "All photos",
    photosLabel: "photos",
    backToTop: "Back to top",
  },

  clientes: {
    heroEyebrow: "Who trusts us",
    heroTitleLine1: "Our",
    heroTitleMoss: "Clients.",
    heroLead:
      "Companies, institutions and families who chose us for their most special moments — and who honour us with their trust.",
    scroll: "Scroll",
    leadPre:
      "From large companies to family celebrations, dozens entrust Líquen Events with their most important moments — and we answer that trust with ",
    leadMoss: "rigour, creativity and dedication",
    leadPost: " in every detail.",
    desde: "Since",
    logosEyebrow: "Companies & institutions",
    logosTitle: "Brands that trust us",
    clientesCount: "clients",
    featuredEyebrow: "Testimonials",
    featuredQuote:
      "The team's dedication to creating magical settings, with impeccable décor and flawless coordination, let us enjoy the event without a single worry.",
    featuredName: "Alexandra Teixeira",
    featuredRole: "Social Event",
    gridTitle: "Words from those who trusted us.",
    testimonials: [
      {
        name: "António Bettencourt",
        text: "The atmosphere your team created elevated the image of our event. We were impressed by the sophistication of the décor.",
        event: "Corporate Event",
      },
      {
        name: "Stephanie & Mizio",
        text: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
        event: "Private Event",
      },
      {
        name: "Teresinha Malta",
        text: "Outstanding service, with great care and availability from the whole team. They exceeded every expectation.",
        event: "Social Event",
      },
      {
        name: "Ana Pinho",
        text: "Excellent — I recommend them without reservation. A team you can trust from start to finish.",
        event: "Private Event",
      },
    ],
    mosaicEyebrow: "Moments from our events",
    mosaicLabels: ["Corporate", "Wedding", "Gala", "Wedding", "Dinner", "Gala", "Institutional"],
    ctaEyebrow: "Next event",
    ctaTitleLine1: "Join our",
    ctaTitleLine2: "clients.",
    ctaText: "Tell us your idea and we'll show you how we can turn it into a memorable event.",
  },

  contacto: {
    direct: {
      ctaEyebrow: "Ready to begin?",
      ctaTitleLine1: "Request your",
      ctaTitleMoss: "quote.",
      ctaText:
        "Tell us about your event — we reply with a tailored proposal within 24 business hours. For a quick question, use one of the channels alongside.",
      ctaButton: "Request a quote",
    },
    testimonialsEyebrow: "What our clients say",
    nextEyebrow: "What happens next",
    steps: [
      {
        title: "We receive your request",
        desc: "We review your request and prepare a tailored response.",
      },
      { title: "We get in touch", desc: "Within 24 hours, we set up a conversation." },
      { title: "Tailored proposal", desc: "A detailed proposal with transparent pricing." },
      { title: "We start creating", desc: "We handle every detail for an unforgettable event." },
    ],
    faqEyebrow: "Frequently asked questions",
    faqTitleLine1: "Got",
    faqTitleLine2: "questions?",
    faqSub: "If you can't find the answer you're looking for, contact us directly.",
    whatsappEyebrow: "Instant reply",
    whatsappTitleLine1: "Prefer to talk",
    whatsappTitleLine2: "right now?",
    whatsappText: "Talk to us directly on WhatsApp. We're available Monday to Friday, 9am to 6pm.",
    form: {
      heroEyebrow: "Get in touch",
      heroTitleLine1: "Let's create something",
      heroTitleMoss: "extraordinary.",
      infoEyebrow: "Find us",
      emailLabel: "E-mail",
      emailSub: "We reply within 24 hours",
      phoneLabel: "Phone",
      phoneSub: "Mon–Fri, 9am–6pm",
      locationLabel: "Location",
      locationValue: "Évora, Alentejo — across Portugal",
      locationSub: "In-person meetings available",
      quoteLink: "Request a quote for your event",
      whatsappLink: "Chat on WhatsApp",
      googleLink: "See on Google · Leave a review",
      promise: "We reply to every request within 24 business hours, with a personalised proposal.",
      promiseSign: "— The Líquen Events team",
      stepLabels: ["Event", "Details", "Specifics", "Message"],
      eventCards: [
        { value: "Corporate", desc: "Conferences, team-building, dinners" },
        { value: "Wedding", desc: "The most special day of your life" },
        { value: "Birthday", desc: "Memorable parties and celebrations" },
        { value: "Gala Dinner", desc: "Prestige social events" },
        { value: "Other", desc: "A custom event, tailored to you" },
      ],
      guestRanges: ["Up to 30", "30–80", "80–150", "150–300", "300+"],
      budgetRanges: ["< €5,000", "€5,000–15,000", "€15,000–30,000", "€30,000+", "To be defined"],
      step1Title1: "What kind of event",
      step1Title2: "are you planning?",
      step1Sub: "Select the option that best describes your event.",
      step2Title: "Tell us who you are.",
      step2Sub: "Your contact details so we can reach you.",
      step3Title: "Event details.",
      step3Sub: "Help us understand the scale and the timing.",
      step4Title: "Your vision.",
      step4Sub: "Describe the event of your dreams. The more detail, the better.",
      labelNome: "Name *",
      labelEmail: "E-mail *",
      labelTelefone: "Phone",
      labelData: "Preferred Date",
      labelConvidados: "No. of Guests",
      labelOrcamento: "Budget (optional)",
      labelMensagem: "Message *",
      phName: "Your full name",
      phEmail: "email@example.com",
      phPhone: "+351 9XX XXX XXX",
      msgPrefix: "Event type: ",
      phMensagem: "Preferred venue, theme, inspirations, special details...",
      summaryEvento: "Event",
      summaryConvidados: "Guests",
      summaryOrcamento: "Budget",
      summaryData: "Date",
      continuar: "Continue",
      voltar: "Back",
      enviar: "Send Request",
      enviando: "Sending…",
      resposta24: "Reply within 24h",
      errNome: "Please enter your name",
      errEmail: "Invalid email",
      error: "We couldn't send your message. Please try again or contact us on WhatsApp.",
      successEyebrow: "Sent successfully",
      successTitle1: "Message",
      successTitle2: "received.",
      successThanks: "Thank you",
      successText: ". We'll be in touch shortly to move forward with your event together.",
      successSteps: [
        { n: "01", t: "We review your request", d: "In the next few hours" },
        { n: "02", t: "We get in touch", d: "Within 24 hours" },
        { n: "03", t: "We send a tailored proposal", d: "Personalised for you" },
      ],
      successWhatsApp: "Follow up on WhatsApp",
    },
    faqs: [
      {
        q: "How far in advance should I get in touch?",
        a: "For weddings we recommend at least 12 months in advance. For corporate events, 3 to 6 months is ideal. For simpler celebrations, 4 to 8 weeks is usually enough.",
      },
      {
        q: "Do you work across the whole country?",
        a: "Yes. We work throughout mainland Portugal and the islands. We have a wide network of suppliers and partners across many regions.",
      },
      {
        q: "Can you handle only part of the organisation?",
        a: "Absolutely. We can take care of everything — from concept to execution — or just specific areas such as décor, day-of coordination, catering or audiovisual. We tailor the service to what you need.",
      },
      {
        q: "How does the quoting process work?",
        a: "After the first contact and an initial conversation (no commitment), we prepare a detailed proposal with transparent pricing. No surprises, no hidden costs.",
      },
      {
        q: "Do you work with different budgets?",
        a: "Yes. We have solutions for different sizes and budgets. Our commitment is always to deliver the best possible result within your means, without compromising on quality.",
      },
      {
        q: "Do you handle events with international guests?",
        a: "Yes, we have experience with events involving international logistics and guests, including simultaneous translation, accommodation and transfers.",
      },
    ],
  },

  orcamento: {
    back: "Líquen Events",
    eyebrow: "Quote request",
    titleLine1: "Tell us",
    titleMoss: "your idea.",
    lead: "No commitment. We reply with a tailored proposal in under 24 hours.",
    eventTypeLabels: [
      "Wedding",
      "Corporate",
      "Birthday",
      "Christening / Communion",
      "Gala Dinner",
      "Other",
    ],
    labelTipo: "Event type *",
    labelData: "Event date",
    labelPessoas: "No. of people",
    labelNome: "Name *",
    labelEmail: "Email *",
    labelTelefone: "Phone",
    labelMensagem: "Message",
    phPessoas: "e.g. 120",
    phNome: "Your name",
    phEmail: "email@example.com",
    phTelefone: "+351 9XX XXX XXX",
    phMensagem:
      "Tell us what you have in mind for your event — venue, atmosphere, special details…",
    errNome: "Please enter your name",
    errEmail: "Invalid email",
    enviar: "Send request",
    enviando: "Sending…",
    ouWhatsApp: "or via WhatsApp",
    error: "We couldn't send your request. Please try again or reach us on WhatsApp.",
    requiredNote: "Fields marked with * are required. Reply within 24 business hours.",
  },

  servicos: {
    heroEyebrow: "What we offer",
    heroTitle: ["Every event,", "a story", "to tell."],
    heroLead:
      "Specialised in weddings, corporate events and private celebrations — bespoke solutions adapted to your style, taste and budget.",
    nav: ["Companies", "Celebrations"],
    verMais: "View more",
    verDetalhes: "View details",
    categories: [
      {
        label: "Companies",
        subtitle: "For companies",
        desc: "We elevate your brand's image through events that transform teams and celebrate achievements.",
        services: [
          {
            title: "Conferences & Congresses",
            desc: "Full organisation of corporate conferences, from logistics to audiovisual.",
          },
          {
            title: "Team Building",
            desc: "Activities and experiences that unite teams and strengthen company culture.",
          },
          {
            title: "Product Launches",
            desc: "High-impact events to present new products to the market with creativity.",
          },
          {
            title: "Company Dinners",
            desc: "From Christmas dinners to gala awards, we create memorable moments of celebration.",
          },
        ],
      },
      {
        label: "Celebrations",
        subtitle: "For individuals",
        desc: "The most important moments of your life, planned in detail with care and elegance.",
        services: [
          {
            title: "Weddings",
            desc: "Your most special day, planned to the last detail. From choosing the venue to the final touch.",
          },
          {
            title: "Christenings & Communions",
            desc: "Intimate, meaningful family celebrations, organised with care.",
          },
          {
            title: "Birthday Parties",
            desc: "Themed or classic parties for all ages. Every birthday is a story.",
          },
          {
            title: "Gala Dinners",
            desc: "Prestige social events with a sophisticated atmosphere and impeccable coordination.",
          },
        ],
      },
    ],
    seoEyebrow: "Where we work",
    seoTitle: "From Évora to all of Portugal",
    seoText:
      "Weddings, corporate events and celebrations — from concept to execution. Based in Évora, in the heart of the Alentejo, we bring our team and our network of suppliers to the entire country.",
    ctaEyebrow: "Next step",
    ctaTitleLine1: "Have an event",
    ctaTitleMoss: "in mind?",
    ctaText:
      "Talk to us. No commitment, no cost. We listen to your idea and present a proposal tailored to you.",
    ctaGaleria: "View the gallery",
  },

  confirmacao: {
    loading: "Loading…",
    statusLabels: {
      pendente: "Request Received",
      em_revisao: "Under Review",
      cotado: "Proposal Sent",
      aceite: "Accepted",
      rejeitado: "Declined",
    },
    successEyebrow: "Request sent successfully",
    titleLine1: "We've received",
    titleMoss: "your request.",
    lead: "Our team will review your request and get in touch within 24 business hours with a personalised proposal.",
    refLabel: "Request Reference",
    categoria: "Category",
    tipo: "Type",
    pacote: "Package",
    convidados: "Guests",
    data: "Date",
    local: "Location",
    adicionais: "Additional Services",
    noDataNote:
      "Save the reference above. We've sent the details to our team and will be in touch shortly.",
    footerNote: "A formal proposal is sent after our team reviews your request.",
    proximosPassos: "Next steps",
    steps: [
      { label: "Request review", desc: "Our team reviews every detail." },
      { label: "Personalised proposal", desc: "We send a detailed proposal by email." },
      { label: "Briefing meeting", desc: "We set up a meeting to align on the vision." },
      { label: "Event production", desc: "We take care of everything for you." },
    ],
    contactIntro: "For any questions, you can contact us directly:",
    voltarInicio: "Back to Home",
    novoPedido: "New Request",
    dateLocale: "en-GB",
  },

  servicoDetalhe: {
    includesTitle: "What's included",
    galleryEyebrow: "Portfolio",
    galleryTitle: "Moments we've created",
    faqTitle: "Frequently asked questions",
    relatedTitle: "Other services",
    ctaTitle: "Shall we plan your event?",
  },

  proposta: {
    linkInvalidTitle: "Invalid or expired link",
    linkInvalidBody:
      "This proposal link is no longer valid. Get in touch and we'll gladly send you a new one.",
    notFoundTitle: "Proposal not found",
    notFoundBody: "We couldn't find this proposal. If you think this is a mistake, get in touch.",
    eyebrow: "Proposal for your event",
    greeting: "Hello",
    intro:
      "We've carefully prepared this proposal for your event. Review the details and respond right here — we'd be delighted to move forward with you.",
    tableDescricao: "Description",
    tableQt: "Qty",
    tableValor: "Amount",
    subtotal: "Subtotal",
    iva: "VAT",
    total: "Total",
    validoAte: "Valid until",
    footerNote: "Any questions or changes? Reply to this email or contact us —",
    dateLocale: "en-GB",
    response: {
      confirmRecusar: "Are you sure you want to decline the proposal?",
      aceiteTitle: "Proposal accepted — thank you!",
      aceiteBody:
        "We're delighted to move forward with you. Our team will be in touch shortly with next steps.",
      rejeitadaTitle: "Response recorded.",
      rejeitadaBody:
        "Thank you for letting us know. If you change your mind or want to adjust anything, we're always here.",
      jaRegistado: "We had already recorded your response to this proposal.",
      aceitar: "Accept proposal →",
      aceitarSending: "Recording…",
      recusar: "Decline",
      recusarSending: "…",
      errorFallback: "We couldn't record your response.",
      errorGeneric: "Error. Please try again.",
      errorSuffix: "Alternatively,",
      errorLink: "email us",
    },
  },

  errors: {
    notFoundEyebrow: "Page not found",
    notFoundTitle: "This path doesn't exist.",
    notFoundText:
      "The page you're looking for may have been moved or is no longer available. But your next event is still waiting to be created.",
    errorEyebrow: "Something went wrong",
    errorTitle: "An unexpected error occurred.",
    errorText:
      "We're sorry for the inconvenience. Please try again — if the problem persists, contact us directly and we'll be glad to help.",
    retry: "Try again",
    loading: "Loading",
  },

  footer: {
    sloganLine1: "We craft events,",
    sloganLine2: "we immortalise memories.",
    disponivel: "Available for new events",
    paginas: "Pages",
    servicosTitulo: "Services",
    serviceLinks: [
      "Wedding Planning",
      "Corporate Events",
      "Parties & Celebrations",
      "Gala Dinners",
    ],
    contacto: "Contact",
    country: "Évora, Alentejo, Portugal",
    pedirOrcamento: "Request a quote",
    rights: "All rights reserved",
    legal: "Legal",
    privacidade: "Privacy",
    termos: "Terms",
  },
};
