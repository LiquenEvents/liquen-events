/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROTECÇÃO DE ORÇAMENTO — AS PALAVRAS QUE NUNCA DEVEM COMPRAR UM CLIQUE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Isto entra ANTES de a primeira campanha arrancar, não depois de se ver o
 * relatório de termos de pesquisa. A ordem importa: uma conta nova sem
 * negativas gasta a maior parte do primeiro mês a pagar por curiosos, e o
 * dinheiro do primeiro mês é o mais caro que há — é o que ainda não tem dados
 * a compensá-lo.
 *
 * ── AS SEIS FAMÍLIAS ───────────────────────────────────────────────────────
 *
 *  1. PREÇO — "grátis", "barato", "low cost", "preços". Quem escreve isto está
 *     a comparar tabelas, não a contratar decoração à medida. Não é um juízo
 *     sobre a pessoa: é que o serviço não é esse, e o clique custa igual.
 *
 *  2. EMPREGO E FORMAÇÃO — "curso", "formação", "emprego", "vagas", "estágio".
 *     Enorme volume, zero intenção de compra. É a família que mais dinheiro
 *     queima numa conta nova porque as palavras coincidem quase todas.
 *
 *  3. FAZER EM CASA — "DIY", "faça você mesmo", "como fazer", "tutorial",
 *     "passo a passo", "molde". Quem procura isto decidiu explicitamente NÃO
 *     contratar ninguém.
 *
 *  4. INSPIRAÇÃO E CONSULTA — "imagens", "fotos", "ideias", "significado",
 *     "frases", "mensagens". Volume gigantesco, e a pessoa está a passear.
 *
 *  5. ALUGUER DE MATERIAL — "aluguer de mesas", "aluguer de cadeiras",
 *     "aluguer de tendas". É outro negócio. Quem quer alugar dez cadeiras não
 *     quer conceito nem cenografia, e vai embora quando vir o orçamento.
 *
 *  6. OUTROS OFÍCIOS DO SECTOR — "fotógrafo", "vídeo", "catering", "DJ",
 *     "bolo", "convites", "vestido", "fato". Aparecem imenso em pesquisas de
 *     casamento e não são o que se vende.
 *
 * ── PORQUÊ "FRASE" E NÃO "EXACTA" ──────────────────────────────────────────
 * Uma negativa em frase apanha a expressão dentro de qualquer pesquisa
 * ("decoração casamento barata em Évora"); uma negativa exacta só apanharia a
 * pesquisa que seja EXACTAMENTE aquilo. Para exclusões quer-se o alcance
 * largo, ao contrário das keywords que compram, onde se quer o contrário.
 *
 * ── UMA COISA QUE ESTA LISTA NÃO FAZ, DE PROPÓSITO ─────────────────────────
 * Não exclui "wedding planner". Um planner é PÚBLICO-ALVO — traz vários
 * casamentos por ano e o custo de o conquistar paga-se uma vez. Há um grupo de
 * anúncios inteiro dedicado a eles na campanha nacional.
 */

import { POLOS } from "./polos";

export interface Negativa {
  texto: string;
  correspondencia: "frase" | "exata";
}

const frase = (texto: string): Negativa => ({ texto, correspondencia: "frase" });

/**
 * A lista partilhada ao nível da conta. Aplica-se a TODAS as campanhas, PT e
 * EN. Está ordenada por família para poder ser lida e discutida, não por
 * alfabeto.
 */
export const NEGATIVAS_CONTA: Negativa[] = [
  // 1. Preço
  "grátis",
  "gratis",
  "gratuito",
  "barato",
  "barata",
  "baratos",
  "baratas",
  "low cost",
  "económico",
  "economico",
  "em conta",
  "preço por pessoa",
  "quanto custa",
  "tabela de preços",
  "cheap",
  "budget",
  "free",
  "price list",

  // 2. Emprego e formação
  "emprego",
  "empregos",
  "vagas",
  "vaga",
  "recrutamento",
  "contrata",
  "contrata-se",
  "estágio",
  "estagio",
  "curso",
  "cursos",
  "formação",
  "formacao",
  "workshop",
  "certificação",
  "aprender",
  "salário",
  "salario",
  "ordenado",
  "job",
  "jobs",
  "career",
  "internship",
  "course",
  "training",

  // 3. Fazer em casa
  "diy",
  "faça você mesmo",
  "faca voce mesmo",
  "como fazer",
  "como decorar",
  "passo a passo",
  "tutorial",
  "molde",
  "moldes",
  "caseiro",
  "caseira",
  "em casa",
  "how to make",
  "step by step",

  // 4. Inspiração e consulta
  "imagens",
  "imagem",
  "fotos de",
  "fotografias de",
  "ideias",
  "ideias de",
  "inspiração",
  "inspiracao",
  "significado",
  "frases",
  "mensagens",
  "poemas",
  "wikipedia",
  "pinterest",
  "youtube",
  "vídeos",
  "videos",
  "download",
  "pdf",
  "grelha",
  "template",
  "ideas",
  "pictures",
  "quotes",

  // 5. Aluguer de material
  "aluguer de mesas",
  "aluguer de cadeiras",
  "aluguer de tendas",
  "aluguer de louça",
  "aluguer de toalhas",
  "aluguer de material",
  "venda de material",
  "comprar",
  "loja",
  "segunda mão",
  "segunda mao",
  "olx",
  "rental",
  "hire chairs",
  "buy",

  // 6. Outros ofícios do sector
  "fotógrafo",
  "fotografo",
  "fotografia de casamento",
  "videógrafo",
  "videografo",
  "catering",
  "menu",
  "ementa",
  "bolo",
  "doces",
  "dj",
  "banda",
  "música",
  "musica",
  "convites",
  "vestido",
  "vestidos",
  "fato",
  "alianças",
  "aliancas",
  "lua de mel",
  "carro",
  "limousine",
  "photographer",
  "videographer",
  "dress",
  "cake",
  "honeymoon",

  // 7. Fora de âmbito (não é casamento, ou não é este país)
  "batizado",
  "baptizado",
  "aniversário infantil",
  "aniversario infantil",
  "festa infantil",
  "funeral",
  "brasil",
  "espanha",
  "spain",
  "italy",
  "greece",
].map(frase);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEGATIVAS CRUZADAS ENTRE POLOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O PROBLEMA QUE ISTO RESOLVE, que é invisível e caro:
 *
 * A campanha de Lisboa tem "decoração de casamento Lisboa" em correspondência
 * de frase. A campanha do Porto tem a dela. Alguém em Lisboa pesquisa
 * "decoração de casamento no Porto" — está em Lisboa, portanto a segmentação
 * por PRESENÇA deixa a campanha de Lisboa entrar no leilão, e a keyword de
 * frase de Lisboa não impede nada porque a pesquisa nem contém "Lisboa"…
 * excepto que contém, em muitas variantes reais ("casamento Lisboa Porto",
 * "quinta perto de Lisboa ou Porto"). O resultado é as duas campanhas a
 * licitarem uma contra a outra, o que sobe o custo por clique DE AMBAS e faz o
 * relatório mentir sobre qual região está a funcionar.
 *
 * A correcção é cada campanha excluir as cidades de todas as outras. É
 * mecânico, e por isso é gerado em vez de escrito à mão — uma lista assim
 * escrita à mão fica desactualizada na primeira vez que se acrescenta um polo.
 */
export function negativasCruzadas(nomeCampanha: string): Negativa[] {
  const slug = nomeCampanha.replace(/^PT · /, "");
  const proprio = POLOS.find((p) => p.slug === slug);
  if (!proprio) return []; // nacional e internacionais não levam cruzadas

  // As cidades dos OUTROS polos, menos as que este polo também reclama (uma
  // cidade de fronteira pode legitimamente aparecer em dois — excluí-la seria
  // cortar tráfego bom).
  const minhas = new Set(proprio.cidades.map((c) => c.toLowerCase()));
  const alheias = new Set<string>();
  for (const outro of POLOS) {
    if (outro.slug === proprio.slug) continue;
    for (const cidade of outro.cidades) {
      if (!minhas.has(cidade.toLowerCase())) alheias.add(cidade);
    }
  }
  return [...alheias].sort().map(frase);
}

/**
 * Exclusões de colocações. Só se aplicam se alguma vez se ligar a rede de
 * parceiros de pesquisa ou Demand Gen — as campanhas geradas usam apenas
 * "Google search", onde não há colocações. Fica escrito porque a tentação de
 * ligar "Search partners" aparece sempre por volta do segundo mês, quando o
 * volume parece pouco, e nessa altura convém já cá estar.
 */
export const PLACEMENTS_EXCLUIDOS = [
  "youtube.com",
  "m.youtube.com",
  "*.blogspot.com",
  "*.wordpress.com",
  "olx.pt",
  "custojusto.pt",
  "coolinarika.com",
  "wattpad.com",
  // Aplicações e jogos — origem clássica de cliques acidentais em telemóvel,
  // com taxa de conversão praticamente nula em serviços de ticket alto.
  "mobileappcategory::game",
  "mobileappcategory::entertainment",
];
