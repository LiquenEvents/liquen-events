import type { Locale } from "@/lib/i18n/config";
import { POLOS, getPolo, conteudoPolo, type Polo } from "@/lib/ads/polos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS VARIANTES SOCIAIS — FONTE ÚNICA DE VERDADE DO RAMO /s/
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma variante = uma página de destino para anúncios do Instagram e do
 * Facebook. NÃO são as páginas do Google com um parâmetro no URL: são páginas
 * próprias, com URL próprio, para os números de uma fonte nunca contaminarem
 * os da outra.
 *
 * ── A DIFERENÇA QUE COMANDA TUDO ───────────────────────────────────────────
 * Quem chega do Google escreveu o que queria. Quem chega da Meta estava a ver
 * stories e foi interrompido. A primeira pessoa lê; a segunda decide em três
 * segundos se fica. Daí, nesta rota:
 *
 *   • uma frase, uma fotografia, um botão no primeiro ecrã;
 *   • a prova social IMEDIATAMENTE a seguir, não a meio da página;
 *   • formulário de quatro campos, não de seis;
 *   • WhatsApp como acção principal, com barra fixa sempre visível;
 *   • sem menu, sem rodapé, sem transições.
 *
 * ── DE ONDE VEM O CONTEÚDO ─────────────────────────────────────────────────
 * As fotografias, os espaços e a geografia vêm de `src/lib/ads/polos.ts` — o
 * mesmo catálogo que alimenta as páginas do Google, o sitemap e os CSV do Ads
 * Editor. Isto NÃO é uma cópia: uma fotografia trocada lá muda aqui também.
 *
 * O que é próprio daqui é só o que TEM de ser: o gancho (a frase dos três
 * segundos) e a fotografia de capa, que tem de ser a MESMA do anúncio.
 *
 * ── PARA ACRESCENTAR UMA VARIANTE, SEM ME CHAMAR ───────────────────────────
 * Acrescenta uma entrada a VARIANTES com:
 *   slug   — o segmento de URL. Fica em `/s/<slug>` (gancho A) e `/s/<slug>-b`
 *            (gancho B). Estável: entra nos URL dos anúncios.
 *   polo   — o `slug` de um polo de polos.ts, de onde vêm fotografias e
 *            espaços. Deixa em `undefined` para a variante nacional.
 *   capa   — a fotografia do primeiro ecrã. TEM de ser a mesma do anúncio.
 *   ganchos— DUAS versões da mesma promessa, para o teste A/B. Nunca uma só:
 *            uma variante com um gancho só não se pode optimizar.
 *
 * Não é preciso tocar em mais nada. A página, os parâmetros estáticos, o mapa
 * de UTM e o guião de medição passam todos a incluí-la, e os testes verificam
 * que a entrada está completa.
 *
 * ── O QUE NÃO ESTÁ AQUI, E PORQUÊ ──────────────────────────────────────────
 * NÃO há uma variante por polo. São treze polos e cinco variantes, porque o
 * orçamento não dá para mais: com 50 €/mês, treze conjuntos de anúncios
 * repartem o dinheiro por treze aprendizagens que nenhuma chega a fazer — é o
 * mesmo erro que `campanhas.ts` documenta para o Google. As cinco cobrem o
 * país inteiro por afinidade de mercado, não por distrito.
 */

/** Uma das duas versões da promessa. O que muda entre A e B é SÓ o gancho. */
export interface Gancho {
  /** "a" ou "b". Entra no `utm_content` e no slug da página B. */
  id: "a" | "b";
  /**
   * A frase dos três segundos. Uma linha, no máximo duas no telemóvel.
   * Sem exclamações e sem "!!!": o tom da marca é contido.
   */
  titulo: string;
  /** Uma linha de apoio, imediatamente abaixo. Pode ser vazia. */
  apoio: string;
}

export interface ConteudoVariante {
  /** <title>. Não é indexado (noindex), serve o separador do browser. */
  metaTitle: string;
  metaDescription: string;
  ganchos: [Gancho, Gancho];
  /** Três linhas curtas do que se faz. Não parágrafos — linhas. */
  oQueFazemos: string[];
  /** Frase única de prova, ao lado da avaliação. */
  prova: string;
  /** Texto do botão principal (WhatsApp). */
  ctaWhatsApp: string;
  /** Mensagem pré-preenchida do WhatsApp. */
  mensagemWhatsApp: string;
}

export interface Variante {
  slug: string;
  /** `slug` de um polo de polos.ts. `undefined` = variante nacional. */
  polo?: string;
  /**
   * Fotografia do primeiro ecrã. TEM de ser a mesma imagem que o anúncio
   * mostrou — a quebra de continuidade visual entre o anúncio e a página é a
   * primeira causa de ressalto em tráfego social, e nenhuma optimização de
   * velocidade a compensa.
   *
   * Em paisagem e abaixo de 100 KB na versão de 1536 px, como os heróis das
   * páginas do Google (o teste `variantes.test.ts` verifica).
   */
  capa: string;
  /**
   * Vídeo curto em ciclo, mudo, com poster leve. `undefined` enquanto não
   * houver material: NÃO se inventa um caminho para um ficheiro que não
   * existe. Hoje o repositório não tem vídeo nenhum (`find public -name
   * "*.mp4"` devolve zero), portanto está tudo a `undefined` e a secção não é
   * desenhada. Ver /meta-ads/criativos.md para o que é preciso filmar.
   */
  video?: { src: string; poster: string; duracaoS: number };
  /** Idiomas. A variante internacional só serve em inglês (ver `soEm`). */
  pt: ConteudoVariante;
  en: ConteudoVariante;
  /** Restringe a variante a um idioma. `undefined` = os dois. */
  soEm?: Locale;
}

export const VARIANTES: Variante[] = [
  // ───────────────────────────────────────────────────────────────────────
  // 1. COMPORTA — o mercado de ticket mais alto, e o mais visual de todos.
  //    É a variante com que se ARRANCA: a estética da Comporta é a que
  //    melhor sobrevive a ser vista num ecrã de telemóvel com o som
  //    desligado, que é a condição real de um anúncio no Instagram.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "comporta",
    polo: "comporta",
    // Era `M&F0508.jpg` — um grande plano de uma caixa com um monograma sobre
    // toalha de xadrez. Vi-a desenhada e CONTRADIZ o seu próprio gancho: a
    // frase promete "o areal, a sombra e a mesa posta antes de o sol descer" e
    // a fotografia mostra um objecto pousado, sem escala, sem lugar e sem
    // ninguém. Num anúncio de Instagram um grande plano de detalhe não faz
    // parar o dedo de ninguém.
    capa: "/imagens/EW1_1330.jpg",
    pt: {
      metaTitle: "Casamentos na Comporta | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos na Comporta e em Melides. Fale connosco por WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Decoração de casamentos na Comporta",
          apoio: "O areal, a sombra, e a mesa posta antes de o sol descer.",
        },
        {
          id: "b",
          titulo: "Casamentos na Comporta, com equipa própria",
          apoio: "Decoração, flores e cenografia. O vento entra na conta desde o desenho.",
        },
      ],
      oQueFazemos: [
        "Conceito e design floral",
        "Cenografia e mobiliário",
        "Coordenação do dia inteiro",
      ],
      prova: "Casamentos produzidos de norte a sul do país, com equipa e material próprios.",
      ctaWhatsApp: "Falar por WhatsApp",
      mensagemWhatsApp:
        "Olá! Vi o vosso anúncio e queria saber sobre decoração de casamento na Comporta.",
    },
    en: {
      metaTitle: "Weddings in Comporta | Líquen Events",
      metaDescription:
        "Wedding design and production in Comporta and Melides. Message us on WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Wedding design in Comporta",
          apoio: "The sand, the shade, and the table set before the sun drops.",
        },
        {
          id: "b",
          titulo: "Comporta weddings, with our own team",
          apoio: "Design, florals and set. The wind is in the plan from the first drawing.",
        },
      ],
      oQueFazemos: ["Concept and floral design", "Set design and furniture", "Full day-of running"],
      prova: "Weddings produced across Portugal, with our own team and our own stock.",
      ctaWhatsApp: "Message on WhatsApp",
      mensagemWhatsApp: "Hello! I saw your ad and would like to ask about a wedding in Comporta.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 2. ALENTEJO — herdades. O maior volume de casamentos com escala grande,
  //    e a zona onde a concorrência dedicada é mais fraca.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "alentejo",
    polo: "alentejo",
    capa: "/imagens/EW1_1392.jpg",
    pt: {
      metaTitle: "Casamentos em herdades do Alentejo | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em herdades e quintas do Alentejo. Fale connosco por WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Decoração de casamentos no Alentejo",
          apoio: "Uma herdade dá espaço a mais e sombra a menos. É aí que começa o desenho.",
        },
        {
          id: "b",
          titulo: "Casamentos em herdades, montados na véspera",
          apoio: "Decoração, flores e cenografia. De sessenta convidados a trezentos.",
        },
      ],
      oQueFazemos: [
        "Conceito e design floral",
        "Cenografia e mobiliário",
        "Coordenação do dia inteiro",
      ],
      prova: "Visita técnica ao espaço antes de qualquer encomenda. Sempre.",
      ctaWhatsApp: "Falar por WhatsApp",
      mensagemWhatsApp:
        "Olá! Vi o vosso anúncio e queria saber sobre decoração de casamento no Alentejo.",
    },
    en: {
      metaTitle: "Weddings in Alentejo estates | Líquen Events",
      metaDescription:
        "Wedding design and production in Alentejo estates and quintas. Message us on WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Wedding design in the Alentejo",
          apoio: "An estate gives you too much space and too little shade. Design starts there.",
        },
        {
          id: "b",
          titulo: "Estate weddings, built the day before",
          apoio: "Design, florals and set. From sixty guests to three hundred.",
        },
      ],
      oQueFazemos: ["Concept and floral design", "Set design and furniture", "Full day-of running"],
      prova: "A technical visit to the venue before anything is ordered. Always.",
      ctaWhatsApp: "Message on WhatsApp",
      mensagemWhatsApp:
        "Hello! I saw your ad and would like to ask about a wedding in the Alentejo.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 3. LISBOA, CASCAIS E SINTRA — o maior volume absoluto do país, e o
  //    público mais habituado a comprar por Instagram.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "lisboa",
    polo: "lisboa",
    capa: "/imagens/J&A-243.jpg",
    pt: {
      metaTitle: "Casamentos em Lisboa, Cascais e Sintra | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em quintas de Lisboa, Cascais e Sintra. Fale connosco por WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Decoração de casamentos em Lisboa",
          apoio: "Uma quinta a vinte minutos de casa, montada como se fosse longe de tudo.",
        },
        {
          id: "b",
          titulo: "Casamentos em quintas de Cascais e Sintra",
          apoio: "Cada quinta pede uma montagem diferente. Visita técnica antes de encomendar.",
        },
      ],
      oQueFazemos: [
        "Conceito e design floral",
        "Cenografia e mobiliário",
        "Coordenação do dia inteiro",
      ],
      prova: "Equipa e material próprios, sem subcontratar a montagem a quem estiver livre.",
      ctaWhatsApp: "Falar por WhatsApp",
      mensagemWhatsApp:
        "Olá! Vi o vosso anúncio e queria saber sobre decoração de casamento na zona de Lisboa.",
    },
    en: {
      metaTitle: "Weddings in Lisbon, Cascais and Sintra | Líquen Events",
      metaDescription:
        "Wedding design and production in quintas around Lisbon, Cascais and Sintra. Message us on WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Wedding design near Lisbon",
          apoio: "A venue twenty minutes from home, built as though it were miles from anywhere.",
        },
        {
          id: "b",
          titulo: "Weddings in Cascais and Sintra venues",
          apoio:
            "Each venue asks for a different build. A technical visit before anything is ordered.",
        },
      ],
      oQueFazemos: ["Concept and floral design", "Set design and furniture", "Full day-of running"],
      prova: "Our own team and our own stock. The setup is never subcontracted to whoever is free.",
      ctaWhatsApp: "Message on WhatsApp",
      mensagemWhatsApp: "Hello! I saw your ad and would like to ask about a wedding near Lisbon.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 4. ALGARVE — a zona com maior quota de casais estrangeiros a casar em
  //    Portugal, e a única onde vale a pena servir as duas línguas.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "algarve",
    polo: "algarve",
    capa: "/imagens/DaniGui_Preview79.jpg",
    pt: {
      metaTitle: "Casamentos no Algarve | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em quintas e resorts do Algarve. Fale connosco por WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Decoração de casamentos no Algarve",
          apoio: "O jantar começa quando o calor acaba. Tudo se desenha a partir dessa hora.",
        },
        {
          id: "b",
          titulo: "Casamentos no Algarve que aguentam o calor",
          apoio: "Flor escolhida para seis horas de sol. Decoração, cenografia e coordenação.",
        },
      ],
      oQueFazemos: [
        "Conceito e design floral",
        "Cenografia e mobiliário",
        "Coordenação do dia inteiro",
      ],
      prova: "Flor escolhida para aguentar seis horas de calor sem murchar à vista de todos.",
      ctaWhatsApp: "Falar por WhatsApp",
      mensagemWhatsApp:
        "Olá! Vi o vosso anúncio e queria saber sobre decoração de casamento no Algarve.",
    },
    en: {
      metaTitle: "Weddings in the Algarve | Líquen Events",
      metaDescription:
        "Wedding design and production in Algarve quintas and resorts. Message us on WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Wedding design in the Algarve",
          apoio: "Dinner starts when the heat stops. Everything is designed around that hour.",
        },
        {
          id: "b",
          titulo: "Algarve weddings built for the heat",
          apoio: "Flowers chosen for six hours of sun. Design, set and coordination.",
        },
      ],
      oQueFazemos: ["Concept and floral design", "Set design and furniture", "Full day-of running"],
      prova: "Flowers chosen to hold six hours of heat without wilting in front of everyone.",
      ctaWhatsApp: "Message on WhatsApp",
      mensagemWhatsApp:
        "Hello! I saw your ad and would like to ask about a wedding in the Algarve.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 5. INTERNACIONAL — casais que vivem fora e casam em Portugal. Só em
  //    inglês: uma versão portuguesa desta página seria a página nacional
  //    outra vez, e duas páginas a dizer o mesmo repartem o sinal.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "portugal",
    capa: "/imagens/J&A-442.jpg",
    soEm: "en",
    pt: {
      // Não servida (ver `soEm`). Fica preenchida porque o tipo o exige e
      // porque uma entrada meia-vazia é um convite a que alguém a sirva sem
      // dar por isso.
      metaTitle: "Casamentos em Portugal | Líquen Events",
      metaDescription: "Decoração e produção de casamentos em todo o país.",
      ganchos: [
        {
          id: "a",
          titulo: "Decoração de casamentos em Portugal",
          apoio: "Conceito, flores, cenografia e coordenação, em todo o país.",
        },
        {
          id: "b",
          titulo: "Casamentos em Portugal, chave na mão",
          apoio: "Uma equipa no terreno, do primeiro fornecedor ao último caixote.",
        },
      ],
      oQueFazemos: [
        "Conceito e design floral",
        "Cenografia e mobiliário",
        "Coordenação do dia inteiro",
      ],
      prova: "Equipa e material próprios, em todo o país.",
      ctaWhatsApp: "Falar por WhatsApp",
      mensagemWhatsApp: "Olá! Vi o vosso anúncio e queria saber sobre um casamento em Portugal.",
    },
    en: {
      metaTitle: "Getting married in Portugal | Líquen Events",
      metaDescription:
        "Wedding design and production across Portugal for couples living abroad. Message us on WhatsApp.",
      ganchos: [
        {
          id: "a",
          titulo: "Wedding design across Portugal",
          apoio: "Most of our couples see the venue once. Some not at all. Planned from home.",
        },
        {
          id: "b",
          titulo: "Your Portugal wedding, quoted in English",
          apoio: "Design, florals and production. Built by the people who designed it.",
        },
      ],
      oQueFazemos: [
        "Concept and floral design, agreed over video",
        "Our own team and stock on the ground",
        "Travel and transport quoted up front",
      ],
      prova: "English throughout: the quote, the contract, and the suppliers on the day.",
      ctaWhatsApp: "Message on WhatsApp",
      mensagemWhatsApp:
        "Hello! I saw your ad and would like to ask about getting married in Portugal.",
    },
  },
];

/** Conteúdo da variante no idioma pedido. */
export function conteudoVariante(v: Variante, locale: Locale): ConteudoVariante {
  return locale === "en" ? v.en : v.pt;
}

/** O polo de onde esta variante tira fotografias e espaços (se tiver). */
export function poloDaVariante(v: Variante): Polo | undefined {
  return v.polo ? getPolo(v.polo) : undefined;
}

/**
 * As fotografias de apoio da variante.
 *
 * Vêm do polo quando há polo; sem polo (variante nacional) usa-se um conjunto
 * espalhado por vários polos, que é o que a página internacional quer mostrar
 * — o país, não uma zona.
 */
export function fotosDaVariante(v: Variante): string[] {
  const polo = poloDaVariante(v);
  if (polo) return polo.fotos.slice(0, 4);
  return POLOS.slice(0, 4).map((p) => p.fotos[0]);
}

/** Espaços da zona, para a prova local. Vazio na variante nacional. */
export function espacosDaVariante(v: Variante): string[] {
  return poloDaVariante(v)?.espacos.slice(0, 5) ?? [];
}

/** Nome da região, tal como as páginas do Google o escrevem. */
export function regiaoDaVariante(v: Variante, locale: Locale): string {
  const polo = poloDaVariante(v);
  if (polo) return conteudoPolo(polo, locale).regiao;
  return locale === "en" ? "Portugal" : "Portugal";
}

/**
 * Todos os caminhos servidos: gancho A em `/s/<slug>`, gancho B em
 * `/s/<slug>-b`.
 *
 * PORQUE É QUE O GANCHO É UM SLUG E NÃO UM PARÂMETRO NO URL. Um `?v=b` não
 * dá página estática distinta, não dá URL distinto no gestor de anúncios, e
 * — o que decide — a Meta trata `/s/comporta` e `/s/comporta?v=b` como o
 * mesmo destino em parte dos relatórios. Dois slugs são dois destinos, e
 * medem-se sozinhos.
 */
export function caminhosDaVariante(v: Variante): { slug: string; gancho: "a" | "b" }[] {
  return [
    { slug: v.slug, gancho: "a" },
    { slug: `${v.slug}-b`, gancho: "b" },
  ];
}

/** Todos os pares slug/gancho de todas as variantes. */
export function todosOsCaminhos(): { slug: string; gancho: "a" | "b"; variante: Variante }[] {
  return VARIANTES.flatMap((v) => caminhosDaVariante(v).map((c) => ({ ...c, variante: v })));
}

/**
 * Resolve um segmento de URL para a variante e o gancho.
 *
 * Devolve `null` para um slug desconhecido — a página faz `notFound()`. É
 * deliberado que `/s/comporta-b` resolva e `/s/comporta-c` não: um erro de
 * dedo no URL de um anúncio tem de dar 404 e ser visível, e não abrir uma
 * página com o gancho errado que ninguém nota durante um mês.
 */
export function resolverVariante(slug: string): { variante: Variante; gancho: Gancho } | null {
  for (const v of VARIANTES) {
    for (const c of caminhosDaVariante(v)) {
      if (c.slug !== slug) continue;
      const gancho = v.pt.ganchos.find((g) => g.id === c.gancho);
      return gancho ? { variante: v, gancho } : null;
    }
  }
  return null;
}

/** O gancho no idioma pedido (o `resolverVariante` devolve o português). */
export function ganchoNoIdioma(v: Variante, id: "a" | "b", locale: Locale): Gancho {
  const c = conteudoVariante(v, locale);
  return c.ganchos.find((g) => g.id === id) ?? c.ganchos[0];
}

/** Caminho público da variante (sem prefixo de idioma). */
export function caminhoVariante(slug: string): string {
  return `/s/${slug}`;
}
