/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS POLOS DE CASAMENTOS — FONTE ÚNICA DE VERDADE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro é lido por TRÊS consumidores que têm de concordar entre si:
 *
 *   1. As landing pages  (src/app/[lang]/casamentos/[polo]/page.tsx)
 *   2. Os CSV de importação para o Google Ads Editor (scripts/gen-ads.mjs)
 *   3. O sitemap
 *
 * Está tudo no mesmo sítio de PROPÓSITO. A falha clássica de uma conta de Ads
 * é o anúncio apontar para um URL que já não existe, ou a campanha do Algarve
 * mandar tráfego para a página do Alentejo. Aqui isso é impossível por
 * construção: o URL final do anúncio é DERIVADO do `slug` que gera a página.
 * Se a página desaparecer, o CSV deixa de a nomear.
 *
 * ── PARA ACRESCENTAR UM POLO NOVO ──────────────────────────────────────────
 * Acrescenta uma entrada a POLOS. Não é preciso tocar em mais nada: a página,
 * o sitemap e os CSV passam a incluí-la. O teste `polos.test.ts` verifica que
 * a entrada está completa (fotografias que existem mesmo, textos nos dois
 * idiomas, peso de orçamento declarado).
 *
 * ── O QUE ESTÁ MEDIDO E O QUE NÃO ESTÁ ─────────────────────────────────────
 * `peso` é uma decisão de repartição de orçamento, argumentada em
 * /ads-output/estrutura.md. NÃO é volume de pesquisa — esses números só saem
 * do Keyword Planner da conta dela, e não os inventamos aqui. Ver
 * /ads-output/keywords-seed.csv, que é feito para ser colado no Planner.
 *
 * `espacos` são espaços de casamento REAIS da zona, recolhidos em pesquisa
 * pública (casamentos.pt, zankyou.pt, sites dos próprios espaços). Servem
 * dois fins: são as keywords do grupo "Espaços" (quem procura o nome de uma
 * quinta está a montante, ainda não escolheu decoração) e dão à landing page
 * a prova local de que se conhece a zona. NÃO implicam parceria nem trabalho
 * feito lá — a página nunca o afirma.
 */

import type { Locale } from "@/lib/i18n/config";

/** Conteúdo da landing page de um polo, num idioma. */
export interface PoloConteudo {
  /** Nome da região tal como aparece nos títulos dos anúncios e no H1. */
  regiao: string;
  /** H1 da página. Nomeia sempre a região — é o que separa esta página de uma genérica. */
  h1: string;
  /** <title>. Até ~60 caracteres para não ser cortado na SERP. */
  metaTitle: string;
  metaDescription: string;
  /** Sobrancelha acima do H1. */
  eyebrow: string;
  /** Dois a três parágrafos. Tom contido, sem exclamações. */
  intro: string[];
  /** Frase curta que introduz a lista de espaços. */
  espacosIntro: string;
  /** Prova social local — o que a página afirma sobre trabalho feito na zona. */
  prova: string;
}

export interface Polo {
  /** Segmento de URL. Estável — faz parte dos URL finais dos anúncios. */
  slug: string;
  /**
   * Peso na repartição do orçamento (soma dos pesos = 100). Justificado em
   * /ads-output/estrutura.md a partir de: dimensão do mercado, quota de
   * destination weddings, densidade de concorrência e custo de servir a zona
   * a partir de Évora.
   */
  peso: number;
  /**
   * Fase de arranque. NÃO abrir as oito ao mesmo tempo: orçamento diluído por
   * oito campanhas não junta sinal em nenhuma e passam-se três meses a pagar
   * sem aprender. Ver /ads-output/arranque.md.
   */
  fase: 1 | 2 | 3;
  /** Localizações a segmentar no Google Ads, pelo nome canónico da Google. */
  geo: string[];
  /** Cidades usadas para expandir keywords locais ("decoração casamento {cidade}"). */
  cidades: string[];
  /** Espaços de casamento reais da zona (keywords do grupo "Espaços" + página). */
  espacos: string[];
  /**
   * Fotografias do portefólio para esta página. TODAS em paisagem — a página
   * usa-as em faixas largas, e uma vertical seria cortada a um risco do meio
   * (foi o defeito corrigido no mosaico de /clientes).
   *
   * ⚠ Estão semeadas com fotografias do conjunto geral porque o repositório
   * não guarda a região de cada fotografia. Trocar estas listas pelas fotos
   * REAIS de cada zona é a alteração isolada que mais converte nesta entrega:
   * um casal que vai casar no Douro reconhece o Douro.
   */
  fotos: string[];
  /** Fotografia principal, acima da dobra. Também em paisagem. */
  hero: string;
  pt: PoloConteudo;
  en: PoloConteudo;
}

/**
 * Os oito polos, por ordem de peso de orçamento (não alfabética).
 *
 * A ordem importa: é a ordem por que aparecem na navegação interna e nos
 * documentos, e reflecte onde o dinheiro rende mais primeiro.
 */
export const POLOS: Polo[] = [
  // ───────────────────────────────────────────────────────────────────────
  // 1. ALENTEJO E COMPORTA — a casa. O polo com melhor economia da conta.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "alentejo",
    peso: 24,
    fase: 1,
    geo: ["Alentejo, Portugal", "Setúbal District, Portugal"],
    cidades: ["Évora", "Estremoz", "Arraiolos", "Beja", "Comporta", "Melides", "Grândola", "Elvas"],
    espacos: [
      "Herdade Vale Lameira",
      "Quinta do Louredo",
      "Herdade da Valeira",
      "Quinta do Cerrado",
      "Herdade do Sabroso",
      "Sublime Comporta",
      "Quinta da Pureza",
    ],
    hero: "/imagens/EW1_1392.jpg",
    fotos: [
      "/imagens/EW1_1393.jpg",
      "/imagens/EW1_1394.jpg",
      "/imagens/EW1_1395.jpg",
      "/imagens/EW1_1396.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1401.jpg",
    ],
    pt: {
      regiao: "Alentejo",
      h1: "Decoração de casamentos no Alentejo",
      metaTitle: "Decoração de Casamentos no Alentejo | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos no Alentejo e na Comporta. Sediados em Évora, com equipa própria em herdades e quintas da região.",
      eyebrow: "Alentejo e Comporta",
      intro: [
        "Somos de Évora. O Alentejo não é para nós uma zona de deslocação — é onde a equipa vive, onde conhecemos os acessos das herdades, a hora a que a luz cai em Setembro e quais os espaços onde o vento obriga a repensar uma montagem ao ar livre.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia. Trabalhamos em herdades, quintas, montes e espaços privados, do casamento de sessenta pessoas ao de trezentas.",
      ],
      espacosIntro: "Espaços da região onde este tipo de produção se monta bem:",
      prova:
        "Base em Évora desde 2018. Equipa e material próprios, sem custo de deslocação na região.",
    },
    en: {
      regiao: "the Alentejo",
      h1: "Wedding design and production in the Alentejo",
      metaTitle: "Alentejo Wedding Designer & Producer | Líquen Events",
      metaDescription:
        "Wedding design, florals and production across the Alentejo and Comporta. Based in Évora, with our own team and stock in the region.",
      eyebrow: "Alentejo and Comporta",
      intro: [
        "We are based in Évora. The Alentejo is not a region we travel to — it is where the team lives, where we know the estate access roads, how the light falls in September, and which venues make an outdoor setup a question of wind rather than taste.",
        "We handle concept, floral design, set design and day-of coordination, in estates, quintas and private properties, from sixty guests to three hundred.",
      ],
      espacosIntro: "Venues in the region where this kind of production works well:",
      prova:
        "Based in Évora since 2018. Our own team and stock, with no travel cost within the region.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 2. LISBOA, CASCAIS E SINTRA — maior volume, maior concorrência, e a uma
  //    hora e meia da base. É o polo que paga mais caro por clique.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "lisboa",
    peso: 22,
    fase: 1,
    geo: ["Lisbon, Portugal", "Lisbon District, Portugal"],
    cidades: ["Lisboa", "Cascais", "Sintra", "Oeiras", "Estoril", "Mafra", "Palmela"],
    espacos: [
      "Penha Longa Resort",
      "Quinta dos Lobos",
      "Quinta da Barreta",
      "Quinta de São Francisco",
      "Quinta dos Alfinetes",
      "Quinta Marquês da Serra",
      "Quinta Cascata dos Sonhos",
    ],
    hero: "/imagens/J&A-243.jpg",
    fotos: [
      "/imagens/J&A-242.jpg",
      "/imagens/J&A-442.jpg",
      "/imagens/J&A-52.jpg",
      "/imagens/J&A-59.jpg",
      "/imagens/J&A-68.jpg",
      "/imagens/J&A-9.jpg",
    ],
    pt: {
      regiao: "Lisboa",
      h1: "Decoração de casamentos em Lisboa, Cascais e Sintra",
      metaTitle: "Decoração de Casamentos em Lisboa e Cascais | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em Lisboa, Cascais e Sintra. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Lisboa, Cascais e Sintra",
      intro: [
        "Lisboa, Cascais e Sintra têm uma exigência própria: espaços com regras de montagem apertadas, janelas de acesso curtas e fornecedores que trabalham a horas contadas. A produção conta tanto como o desenho.",
        "Levamos equipa e material próprios. Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, palácios, hotéis e espaços privados da zona.",
      ],
      espacosIntro: "Espaços da zona onde montamos com regularidade este tipo de produção:",
      prova:
        "Equipa própria em deslocação a partir de Évora, com montagem na véspera sempre que o espaço o permite.",
    },
    en: {
      regiao: "Lisbon",
      h1: "Wedding design in Lisbon, Cascais and Sintra",
      metaTitle: "Wedding Designer in Lisbon & Cascais | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in Lisbon, Cascais and Sintra. Concept, floral design, set design and day-of coordination.",
      eyebrow: "Lisbon, Cascais and Sintra",
      intro: [
        "Lisbon, Cascais and Sintra have a logic of their own: venues with strict setup rules, short access windows and suppliers working to the minute. Production matters as much as design.",
        "We bring our own team and stock, and handle concept, floral design, set design and day-of coordination in quintas, palaces, hotels and private venues across the area.",
      ],
      espacosIntro: "Venues in the area where we regularly build this kind of production:",
      prova:
        "Our own team travels from Évora, with setup the day before wherever the venue allows it.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 3. ALGARVE — o polo internacional. Maior ticket, e o site bilingue já é
  //    vantagem sobre a maioria dos concorrentes locais.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "algarve",
    peso: 18,
    fase: 2,
    geo: ["Algarve, Portugal"],
    cidades: ["Lagos", "Albufeira", "Loulé", "Vilamoura", "Tavira", "Portimão", "Quinta do Lago"],
    espacos: [
      "Quinta dos Vales",
      "Quinta Bonita",
      "Quinta das Oliveiras",
      "Monte do Serrinho",
      "Quinta do Lago",
      "Vila Vita Parc",
    ],
    hero: "/imagens/teresinhaeze-1434.jpg",
    fotos: [
      "/imagens/J&P-DJI_20250628174247_0187_D.jpg",
      "/imagens/J&P-DJI_20250628174304_0188_D.jpg",
      "/imagens/J&P-IMGL3188.jpg",
      "/imagens/J&P-IMGL4767.jpg",
      "/imagens/J&P-IMGL4769.jpg",
      "/imagens/J&P-IMGL4770.jpg",
    ],
    pt: {
      regiao: "Algarve",
      h1: "Decoração de casamentos no Algarve",
      metaTitle: "Decoração de Casamentos no Algarve | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos no Algarve, para casais portugueses e estrangeiros. Conceito, flores, cenografia e coordenação.",
      eyebrow: "Algarve",
      intro: [
        "O Algarve recebe casais de todo o lado, e uma boa parte do trabalho faz-se à distância, com um ou dois dias no terreno. Isso muda o método: o que noutra região se resolve numa visita, aqui resolve-se com desenho, plantas e decisões tomadas antes de sair de casa.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, hotéis e casas privadas de todo o Algarve.",
      ],
      espacosIntro: "Espaços da região com produções deste tipo:",
      prova:
        "Trabalhamos em português e inglês, com apresentação de conceito à distância e visita técnica ao espaço antes da montagem.",
    },
    en: {
      regiao: "the Algarve",
      h1: "Wedding design and production in the Algarve",
      metaTitle: "Algarve Wedding Designer & Stylist | Líquen Events",
      metaDescription:
        "Wedding design, florals and production across the Algarve for Portuguese and international couples. Concept, styling and coordination.",
      eyebrow: "Algarve",
      intro: [
        "The Algarve draws couples from everywhere, and much of the work happens remotely, with a day or two on site. That changes the method: what another region settles in a visit, here is settled with drawings, floor plans and decisions made before anyone travels.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, hotels and private villas across the Algarve.",
      ],
      espacosIntro: "Venues in the region that host productions of this kind:",
      prova:
        "We work in Portuguese and English, presenting the concept remotely and walking the venue before setup.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 4. PORTO E DOURO — mercado grande, concorrência local forte e enraizada.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "porto-douro",
    peso: 14,
    fase: 2,
    geo: ["Porto, Portugal", "Porto District, Portugal", "Vila Real District, Portugal"],
    cidades: ["Porto", "Vila Nova de Gaia", "Peso da Régua", "Lamego", "Amarante", "Matosinhos"],
    espacos: [
      "Quinta da Torrebella",
      "Quinta dos Bambus",
      "Quinta da Morgadinha",
      "Quinta dos Românticos",
      "Quinta de Santo António",
      "Quinta de Mosteirô",
    ],
    hero: "/imagens/DaniGui_Preview79.jpg",
    fotos: [
      "/imagens/DaniGui_Preview20.jpg",
      "/imagens/DaniGui_Preview79.jpg",
      "/imagens/DaniGui_JantarFesta_11.jpg",
      "/imagens/DaniGui_JantarFesta_26.jpg",
      "/imagens/DaniGui_JantarFesta_39.jpg",
      "/imagens/DaniGui_Adois_58.jpg",
    ],
    pt: {
      regiao: "Porto e Douro",
      h1: "Decoração de casamentos no Porto e no Douro",
      metaTitle: "Decoração de Casamentos no Porto e Douro | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos no Porto e no Vale do Douro. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Porto e Vale do Douro",
      intro: [
        "No Douro a paisagem já é cenografia, e o erro mais comum é competir com ela. O trabalho é quase sempre de subtracção: menos volume, materiais que aguentam o calor das encostas e uma paleta que não discuta com as vinhas.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas do Douro e espaços do Grande Porto.",
      ],
      espacosIntro: "Espaços da região onde este tipo de produção assenta:",
      prova: "Deslocação com equipa e material próprios, com montagem na véspera.",
    },
    en: {
      regiao: "Porto and the Douro",
      h1: "Wedding design in Porto and the Douro Valley",
      metaTitle: "Porto & Douro Wedding Designer | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in Porto and the Douro Valley. Concept, floral design, set design and coordination.",
      eyebrow: "Porto and the Douro Valley",
      intro: [
        "In the Douro the landscape is already set design, and the common mistake is competing with it. The work is mostly subtraction: less volume, materials that survive the heat of the terraces, and a palette that does not argue with the vines.",
        "We handle concept, floral design, set design and day-of coordination, in Douro quintas and venues around Porto.",
      ],
      espacosIntro: "Venues in the region where this kind of production sits well:",
      prova: "We travel with our own team and stock, setting up the day before.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 5. MINHO E BRAGA — maior densidade de quintas do país, mercado muito
  //    local e sensível a preço. Entra tarde de propósito.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "minho",
    peso: 8,
    fase: 3,
    geo: ["Braga District, Portugal", "Viana do Castelo District, Portugal"],
    cidades: ["Braga", "Guimarães", "Barcelos", "Ponte de Lima", "Viana do Castelo"],
    espacos: [
      "Quinta D'Ávila",
      "Solar das Bouças",
      "Quinta Vila Marita",
      "Quinta de Sabroso",
      "Quinta das Carpas",
      "Quinta do Retiro",
      "Quinta do Outeiro",
    ],
    hero: "/imagens/M&F0508.jpg",
    fotos: [
      "/imagens/EW1_0689.jpg",
      "/imagens/EW1_0690.jpg",
      "/imagens/EW1_0697.jpg",
      "/imagens/EW1_0576.jpg",
      "/imagens/EW1_0580.jpg",
      "/imagens/EW1_0362.jpg",
    ],
    pt: {
      regiao: "Minho",
      h1: "Decoração de casamentos no Minho e em Braga",
      metaTitle: "Decoração de Casamentos no Minho e Braga | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos no Minho, Braga e Guimarães. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Minho, Braga e Guimarães",
      intro: [
        "O triângulo entre Braga, Guimarães e Barcelos tem a maior densidade de quintas de casamento do país, e com ela um formato muito estabelecido. Quem nos procura aqui costuma querer sair desse formato sem perder a escala.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas e solares da região.",
      ],
      espacosIntro: "Espaços da região com produções deste tipo:",
      prova:
        "Deslocação com equipa e material próprios, orçamentada à partida e sem extras no fim.",
    },
    en: {
      regiao: "the Minho",
      h1: "Wedding design in the Minho and Braga",
      metaTitle: "Minho & Braga Wedding Designer | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in the Minho, Braga and Guimarães. Concept, floral design, set design and coordination.",
      eyebrow: "Minho, Braga and Guimarães",
      intro: [
        "The triangle between Braga, Guimarães and Barcelos holds the highest density of wedding quintas in the country, and with it a very settled format. Couples who come to us here usually want out of that format without losing the scale.",
        "We handle concept, floral design, set design and day-of coordination, in quintas and manor houses across the region.",
      ],
      espacosIntro: "Venues in the region hosting productions of this kind:",
      prova: "We travel with our own team and stock, quoted up front with no extras at the end.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 6. COIMBRA E CENTRO — mercado disperso, sem polo dominante.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "centro",
    peso: 6,
    fase: 3,
    geo: ["Coimbra District, Portugal", "Aveiro District, Portugal", "Leiria District, Portugal"],
    cidades: ["Coimbra", "Aveiro", "Leiria", "Viseu", "Óbidos", "Figueira da Foz"],
    espacos: [],
    hero: "/imagens/EW1_0580.jpg",
    fotos: [
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1333.jpg",
      "/imagens/EW1_1337.jpg",
      "/imagens/EW1_1342.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/EW1_1405.jpg",
    ],
    pt: {
      regiao: "Centro",
      h1: "Decoração de casamentos em Coimbra e no Centro",
      metaTitle: "Decoração de Casamentos em Coimbra | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em Coimbra, Aveiro e no Centro do país. Conceito, design floral, cenografia e coordenação.",
      eyebrow: "Coimbra, Aveiro e Centro",
      intro: [
        "O Centro não tem um polo único: os casamentos espalham-se por Coimbra, Aveiro, Leiria e Viseu, muitas vezes em espaços que recebem poucos por ano. Isso dá liberdade de desenho e obriga a mais trabalho de produção.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, solares e espaços privados da região.",
      ],
      espacosIntro: "Espaços da região:",
      prova: "Deslocação com equipa e material próprios, com visita técnica prévia ao espaço.",
    },
    en: {
      regiao: "central Portugal",
      h1: "Wedding design in Coimbra and central Portugal",
      metaTitle: "Coimbra Wedding Designer | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in Coimbra, Aveiro and central Portugal. Concept, styling and coordination.",
      eyebrow: "Coimbra, Aveiro and the Centre",
      intro: [
        "Central Portugal has no single hub: weddings spread across Coimbra, Aveiro, Leiria and Viseu, often in venues that host only a handful each year. That buys design freedom and costs production effort.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, manor houses and private venues across the region.",
      ],
      espacosIntro: "Venues in the region:",
      prova: "We travel with our own team and stock, walking the venue before setup.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 7. MADEIRA — mercado pequeno, ticket alto, estratégia oficial de captação
  //    de destination weddings lançada em 2025. Insular: logística é o tema.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "madeira",
    peso: 4,
    fase: 3,
    geo: ["Madeira, Portugal"],
    cidades: ["Funchal", "Câmara de Lobos", "Santa Cruz", "Porto Santo"],
    espacos: [],
    hero: "/imagens/EW1_0365.jpg",
    fotos: [
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1505.jpg",
      "/imagens/EW1_1100.jpg",
      "/imagens/EW1_0363.jpg",
      "/imagens/EW1_0365.jpg",
      "/imagens/20_10_2025_0244.jpg",
    ],
    pt: {
      regiao: "Madeira",
      h1: "Decoração de casamentos na Madeira",
      metaTitle: "Decoração de Casamentos na Madeira | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos na Madeira. Conceito, design floral e coordenação, com logística de ilha resolvida à partida.",
      eyebrow: "Madeira",
      intro: [
        "Numa ilha, a logística decide o desenho. O que se leva tem de caber num voo ou num contentor com semanas de antecedência, e o que se compra no destino depende do que a ilha tem nessa época. Dizemos isto à partida, porque é o que separa um orçamento honesto de uma surpresa.",
        "Fazemos o conceito, o design floral e a coordenação do dia, com fornecimento local sempre que faz sentido.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Logística de ilha planeada com semanas de antecedência e orçamentada à partida, transporte incluído.",
    },
    en: {
      regiao: "Madeira",
      h1: "Wedding design in Madeira",
      metaTitle: "Madeira Wedding Designer | Líquen Events",
      metaDescription:
        "Wedding design, florals and coordination in Madeira, with island logistics planned and priced from the start.",
      eyebrow: "Madeira",
      intro: [
        "On an island, logistics decide the design. Whatever travels has to fit a flight or a container weeks ahead, and whatever is bought locally depends on what the island has that season. We say so up front, because it is what separates an honest quote from a surprise.",
        "We handle concept, floral design and day-of coordination, sourcing locally wherever it makes sense.",
      ],
      espacosIntro: "Venues in the region:",
      prova: "Island logistics planned weeks ahead and priced up front, transport included.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 8. AÇORES — o ticket médio mais alto do país segundo a imprensa do sector,
  //    e o mercado mais pequeno. Último a abrir.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "acores",
    peso: 4,
    fase: 3,
    geo: ["Azores, Portugal"],
    cidades: ["Ponta Delgada", "Angra do Heroísmo", "Horta", "Ilha de São Miguel"],
    espacos: [],
    hero: "/imagens/EW1_0363.jpg",
    fotos: [
      "/imagens/DJI_20250913190640_0121_D.jpg",
      "/imagens/DaniGui_JantarFesta_130.jpg",
      "/imagens/DaniGui_JantarFesta_48.jpg",
      "/imagens/DaniGui_JantarFesta_6.jpg",
      "/imagens/DaniGui_PreparacaoDani_33.jpg",
      "/imagens/EW1_1100.jpg",
    ],
    pt: {
      regiao: "Açores",
      h1: "Decoração de casamentos nos Açores",
      metaTitle: "Decoração de Casamentos nos Açores | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos nos Açores. Conceito, design floral e coordenação, com logística inter-ilhas planeada.",
      eyebrow: "Açores",
      intro: [
        "Nos Açores conta-se com o tempo a mudar no próprio dia, e um plano que não tenha alternativa coberta não é um plano. Desenhamos sempre as duas versões, e a segunda não é a primeira mais pobre.",
        "Fazemos o conceito, o design floral e a coordenação do dia, com logística inter-ilhas planeada com antecedência.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Duas versões de montagem desenhadas à partida — interior e exterior — sem custo adicional pela alternativa.",
    },
    en: {
      regiao: "the Azores",
      h1: "Wedding design in the Azores",
      metaTitle: "Azores Wedding Designer | Líquen Events",
      metaDescription:
        "Wedding design, florals and coordination in the Azores, with inter-island logistics planned ahead.",
      eyebrow: "Azores",
      intro: [
        "In the Azores the weather changes within the day, and a plan without a covered alternative is not a plan. We design both versions from the start, and the second is not a poorer copy of the first.",
        "We handle concept, floral design and day-of coordination, with inter-island logistics planned well ahead.",
      ],
      espacosIntro: "Venues in the region:",
      prova:
        "Two setups designed from the outset — indoor and outdoor — with no extra charge for the alternative.",
    },
  },
];

/** Procura um polo pelo segmento de URL. */
export function getPolo(slug: string): Polo | undefined {
  return POLOS.find((p) => p.slug === slug);
}

/** Conteúdo do polo no idioma pedido. */
export function conteudoPolo(polo: Polo, locale: Locale): PoloConteudo {
  return locale === "en" ? polo.en : polo.pt;
}

/** Caminho da landing page (sem prefixo de idioma). */
export function caminhoPolo(slug: string): string {
  return `/casamentos/${slug}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTILOS — o segundo eixo de landing pages.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quem procura "casamento boho" ou "casamento minimalista" está a decidir a
 * ESTÉTICA, não o fornecedor, e ainda não tem data marcada. Mandar essa pessoa
 * para uma página regional é mandá-la responder a uma pergunta que ela ainda
 * não se fez. Daí páginas próprias, com formulário na mesma — mas com o texto
 * calibrado para quem ainda está a namorar a ideia.
 */
export interface Estilo {
  slug: string;
  fotos: string[];
  hero: string;
  pt: { nome: string; h1: string; metaTitle: string; metaDescription: string; intro: string[] };
  en: { nome: string; h1: string; metaTitle: string; metaDescription: string; intro: string[] };
}

export const ESTILOS: Estilo[] = [
  {
    slug: "minimalista",
    hero: "/imagens/EW1_1342.jpg",
    fotos: [
      "/imagens/EW1_1337.jpg",
      "/imagens/EW1_1333.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1330.jpg",
    ],
    pt: {
      nome: "Minimalista",
      h1: "Casamentos minimalistas",
      metaTitle: "Casamento Minimalista: Decoração | Líquen Events",
      metaDescription:
        "Decoração de casamentos minimalistas: paleta curta, materiais honestos e volume onde conta. Conceito, flores e produção.",
      intro: [
        "Um casamento minimalista não é um casamento com menos coisas — é um casamento onde cada coisa aguenta ser vista de perto. Poucas peças, materiais honestos, e volume concentrado onde as pessoas efectivamente olham.",
        "É o estilo mais difícil de fazer bem e o mais fácil de fazer barato, porque não há onde esconder um acabamento mal resolvido.",
      ],
    },
    en: {
      nome: "Minimalist",
      h1: "Minimalist weddings",
      metaTitle: "Minimalist Wedding Design | Líquen Events",
      metaDescription:
        "Minimalist wedding design: a short palette, honest materials, and volume where it counts. Concept, florals and production.",
      intro: [
        "A minimalist wedding is not a wedding with fewer things — it is one where every thing survives being looked at closely. Few pieces, honest materials, and volume concentrated where people actually look.",
        "It is the hardest style to do well and the easiest to do cheaply, because there is nowhere to hide a badly resolved finish.",
      ],
    },
  },
  {
    slug: "boho",
    hero: "/imagens/J&A-52.jpg",
    fotos: [
      "/imagens/J&A-59.jpg",
      "/imagens/J&A-68.jpg",
      "/imagens/J&A-9.jpg",
      "/imagens/J&A-243.jpg",
    ],
    pt: {
      nome: "Boho",
      h1: "Casamentos boho",
      metaTitle: "Casamento Boho: Decoração e Produção | Líquen Events",
      metaDescription:
        "Decoração de casamentos boho: têxteis, madeiras e flor solta, com a produção resolvida por trás do desenho descontraído.",
      intro: [
        "O boho vive de parecer que aconteceu sozinho. Não acontece: os têxteis têm de aguentar vento, as madeiras têm de estar niveladas em chão de terra e a flor solta tem de sobreviver a seis horas de calor.",
        "Fazemos o desenho e a produção que o sustenta, para que a leveza seja o efeito e não a preparação.",
      ],
    },
    en: {
      nome: "Boho",
      h1: "Boho weddings",
      metaTitle: "Boho Wedding Design & Production | Líquen Events",
      metaDescription:
        "Boho wedding design: textiles, timber and loose florals, with the production resolved behind the relaxed look.",
      intro: [
        "Boho lives on looking like it happened by itself. It does not: the textiles have to hold in wind, the timber has to sit level on bare ground, and loose florals have to survive six hours of heat.",
        "We do the design and the production that holds it up, so the lightness is the effect and not the preparation.",
      ],
    },
  },
  {
    slug: "campo",
    hero: "/imagens/EW1_1392.jpg",
    fotos: [
      "/imagens/EW1_1393.jpg",
      "/imagens/EW1_1395.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1401.jpg",
    ],
    pt: {
      nome: "No campo",
      h1: "Casamentos no campo",
      metaTitle: "Casamento no Campo: Decoração | Líquen Events",
      metaDescription:
        "Decoração de casamentos no campo, em herdades e quintas. Conceito, design floral, cenografia e coordenação do dia.",
      intro: [
        "Um casamento no campo tem duas contas que não se vêem nas fotografias: a electricidade e o chão. Resolvidas essas, quase tudo o resto é escolha.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação, em herdades, quintas e propriedades privadas por todo o país.",
      ],
    },
    en: {
      nome: "Countryside",
      h1: "Countryside weddings",
      metaTitle: "Countryside Wedding Design | Líquen Events",
      metaDescription:
        "Wedding design for countryside estates and quintas. Concept, floral design, set design and day-of coordination.",
      intro: [
        "A countryside wedding has two costs that never show in the photographs: power and ground. Solve those and almost everything else is a choice.",
        "We handle concept, floral design, set design and coordination, in estates, quintas and private properties across the country.",
      ],
    },
  },
];

export function getEstilo(slug: string): Estilo | undefined {
  return ESTILOS.find((e) => e.slug === slug);
}
