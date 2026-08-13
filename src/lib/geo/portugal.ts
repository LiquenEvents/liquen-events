/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONDE FICAM AS COISAS — GEOGRAFIA MÍNIMA, SEM REDE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dois sítios do back office precisam de saber a que distância fica um evento:
 * o aviso de data ocupada (dá para fazer os dois no mesmo fim de semana?) e a
 * linha de deslocação da proposta (quanto se cobra para lá chegar).
 *
 * ── PORQUE É UMA TABELA E NÃO UM SERVIÇO DE MAPAS ──────────────────────────
 * Um serviço de mapas dava estradas a sério, mas trazia três coisas que este
 * ecrã não pode ter: uma chave de API para gerir, uma chamada de rede no meio
 * de escrever uma proposta, e um sítio onde a morada de cada cliente passa a
 * ser enviada a um terceiro. O ganho seria uma dezena de quilómetros de
 * precisão num número que serve para DECIDIR, não para faturar ao metro.
 *
 * ── O QUE ESTES NÚMEROS SÃO E O QUE NÃO SÃO ────────────────────────────────
 * As coordenadas são aproximadas — o centro da localidade, com a precisão de
 * um ou dois quilómetros. A distância é em LINHA RETA. Estradas não são retas:
 * `kmPorEstrada` multiplica por 1,25, que é a folga habitual em Portugal
 * continental, e arredonda aos 5 km para o número não fingir uma exatidão que
 * não tem. Para as ilhas não se aplica factor nenhum, porque não há estrada
 * entre elas e o continente — e por isso `kmPorEstrada` devolve `null` quando
 * a viagem cruza mar.
 *
 * Um número aproximado dito como aproximado vale mais do que nenhum. Um número
 * aproximado dito como exato é que é uma armadilha — daí o `≈` em todo o lado
 * onde isto aparece no ecrã.
 *
 * ── QUANDO NÃO SE SABE ─────────────────────────────────────────────────────
 * `localizar` devolve `null` para o que não reconhece, e quem chama TEM de
 * lidar com isso mostrando menos, nunca inventando. "Portugal" escrito no
 * campo do local é exatamente esse caso: não é uma morada, é a ausência de
 * uma — e é também o sinal de que o casamento pode ser à distância.
 */

export interface Lugar {
  /** O nome como se escreve, para aparecer no ecrã. */
  nome: string;
  lat: number;
  lon: number;
  /** Continente, Madeira ou Açores — quem decide se há estrada pelo meio. */
  massa: "continente" | "madeira" | "acores";
}

/**
 * As localidades que aparecem nos pedidos: as dezoito capitais de distrito, as
 * duas regiões autónomas, e as terras onde há casamentos a sério (as herdades
 * do Alentejo, a Comporta, a linha de Cascais e Sintra, o Douro, o Algarve).
 *
 * A chave é a forma normalizada do nome (sem acentos, minúsculas) — ver
 * `chave()`. Acrescentar uma terra é acrescentar uma linha; nada mais depende
 * da ordem nem do tamanho desta tabela.
 */
const LUGARES: Record<string, Lugar> = {
  // ── Capitais de distrito ────────────────────────────────────────────────
  evora: { nome: "Évora", lat: 38.5714, lon: -7.9135, massa: "continente" },
  lisboa: { nome: "Lisboa", lat: 38.7223, lon: -9.1393, massa: "continente" },
  porto: { nome: "Porto", lat: 41.1579, lon: -8.6291, massa: "continente" },
  faro: { nome: "Faro", lat: 37.0194, lon: -7.9304, massa: "continente" },
  setubal: { nome: "Setúbal", lat: 38.5244, lon: -8.8882, massa: "continente" },
  beja: { nome: "Beja", lat: 38.015, lon: -7.8632, massa: "continente" },
  portalegre: { nome: "Portalegre", lat: 39.2967, lon: -7.4285, massa: "continente" },
  santarem: { nome: "Santarém", lat: 39.2369, lon: -8.6857, massa: "continente" },
  leiria: { nome: "Leiria", lat: 39.7436, lon: -8.8071, massa: "continente" },
  coimbra: { nome: "Coimbra", lat: 40.2033, lon: -8.4103, massa: "continente" },
  aveiro: { nome: "Aveiro", lat: 40.6405, lon: -8.6538, massa: "continente" },
  viseu: { nome: "Viseu", lat: 40.6566, lon: -7.9125, massa: "continente" },
  guarda: { nome: "Guarda", lat: 40.5373, lon: -7.2676, massa: "continente" },
  "castelo branco": { nome: "Castelo Branco", lat: 39.8222, lon: -7.4931, massa: "continente" },
  braga: { nome: "Braga", lat: 41.5454, lon: -8.4265, massa: "continente" },
  braganca: { nome: "Bragança", lat: 41.8071, lon: -6.7568, massa: "continente" },
  "viana do castelo": { nome: "Viana do Castelo", lat: 41.6918, lon: -8.8344, massa: "continente" },
  "vila real": { nome: "Vila Real", lat: 41.3006, lon: -7.7441, massa: "continente" },
  funchal: { nome: "Funchal", lat: 32.6669, lon: -16.9241, massa: "madeira" },
  "ponta delgada": { nome: "Ponta Delgada", lat: 37.7412, lon: -25.6756, massa: "acores" },
  "angra do heroismo": {
    nome: "Angra do Heroísmo",
    lat: 38.6558,
    lon: -27.2153,
    massa: "acores",
  },
  horta: { nome: "Horta", lat: 38.5342, lon: -28.6272, massa: "acores" },

  // ── Alentejo: é aqui que fica a maior parte do trabalho ─────────────────
  arraiolos: { nome: "Arraiolos", lat: 38.7231, lon: -7.9847, massa: "continente" },
  estremoz: { nome: "Estremoz", lat: 38.8425, lon: -7.5872, massa: "continente" },
  borba: { nome: "Borba", lat: 38.8067, lon: -7.4569, massa: "continente" },
  "vila vicosa": { nome: "Vila Viçosa", lat: 38.7794, lon: -7.4139, massa: "continente" },
  redondo: { nome: "Redondo", lat: 38.6472, lon: -7.5464, massa: "continente" },
  "reguengos de monsaraz": {
    nome: "Reguengos de Monsaraz",
    lat: 38.4256,
    lon: -7.5347,
    massa: "continente",
  },
  monsaraz: { nome: "Monsaraz", lat: 38.4433, lon: -7.3806, massa: "continente" },
  alandroal: { nome: "Alandroal", lat: 38.7022, lon: -7.4022, massa: "continente" },
  elvas: { nome: "Elvas", lat: 38.8814, lon: -7.1628, massa: "continente" },
  "montemor-o-novo": { nome: "Montemor-o-Novo", lat: 38.6483, lon: -8.2153, massa: "continente" },
  "vendas novas": { nome: "Vendas Novas", lat: 38.6772, lon: -8.4581, massa: "continente" },
  mora: { nome: "Mora", lat: 38.9394, lon: -8.1608, massa: "continente" },
  avis: { nome: "Avis", lat: 39.0561, lon: -7.8917, massa: "continente" },
  "ponte de sor": { nome: "Ponte de Sor", lat: 39.2489, lon: -8.0111, massa: "continente" },
  marvao: { nome: "Marvão", lat: 39.3936, lon: -7.3767, massa: "continente" },
  "castelo de vide": { nome: "Castelo de Vide", lat: 39.4158, lon: -7.4553, massa: "continente" },
  crato: { nome: "Crato", lat: 39.2872, lon: -7.6444, massa: "continente" },
  mourao: { nome: "Mourão", lat: 38.3833, lon: -7.3436, massa: "continente" },
  portel: { nome: "Portel", lat: 38.3072, lon: -7.7011, massa: "continente" },
  "viana do alentejo": {
    nome: "Viana do Alentejo",
    lat: 38.3336,
    lon: -8.0028,
    massa: "continente",
  },
  alvito: { nome: "Alvito", lat: 38.2531, lon: -7.9986, massa: "continente" },
  serpa: { nome: "Serpa", lat: 37.9433, lon: -7.5981, massa: "continente" },
  moura: { nome: "Moura", lat: 38.14, lon: -7.4489, massa: "continente" },

  // ── Costa alentejana e Comporta ─────────────────────────────────────────
  comporta: { nome: "Comporta", lat: 38.3833, lon: -8.7833, massa: "continente" },
  melides: { nome: "Melides", lat: 38.1333, lon: -8.7667, massa: "continente" },
  grandola: { nome: "Grândola", lat: 38.1758, lon: -8.5672, massa: "continente" },
  "alcacer do sal": { nome: "Alcácer do Sal", lat: 38.3728, lon: -8.5122, massa: "continente" },
  troia: { nome: "Troia", lat: 38.4833, lon: -8.8833, massa: "continente" },
  sines: { nome: "Sines", lat: 37.9558, lon: -8.8694, massa: "continente" },
  odemira: { nome: "Odemira", lat: 37.5983, lon: -8.6386, massa: "continente" },
  "vila nova de milfontes": {
    nome: "Vila Nova de Milfontes",
    lat: 37.7256,
    lon: -8.7833,
    massa: "continente",
  },

  // ── Península de Setúbal ────────────────────────────────────────────────
  palmela: { nome: "Palmela", lat: 38.5686, lon: -8.9014, massa: "continente" },
  azeitao: { nome: "Azeitão", lat: 38.5167, lon: -9.0167, massa: "continente" },
  sesimbra: { nome: "Sesimbra", lat: 38.4444, lon: -9.1014, massa: "continente" },
  almada: { nome: "Almada", lat: 38.679, lon: -9.1569, massa: "continente" },
  seixal: { nome: "Seixal", lat: 38.6403, lon: -9.1017, massa: "continente" },
  montijo: { nome: "Montijo", lat: 38.7064, lon: -8.9744, massa: "continente" },

  // ── Grande Lisboa e Oeste ───────────────────────────────────────────────
  cascais: { nome: "Cascais", lat: 38.6979, lon: -9.4215, massa: "continente" },
  sintra: { nome: "Sintra", lat: 38.8029, lon: -9.3817, massa: "continente" },
  oeiras: { nome: "Oeiras", lat: 38.6979, lon: -9.3117, massa: "continente" },
  mafra: { nome: "Mafra", lat: 38.9375, lon: -9.3272, massa: "continente" },
  ericeira: { nome: "Ericeira", lat: 38.9633, lon: -9.4172, massa: "continente" },
  alenquer: { nome: "Alenquer", lat: 39.0525, lon: -9.0092, massa: "continente" },
  "torres vedras": { nome: "Torres Vedras", lat: 39.0919, lon: -9.2586, massa: "continente" },
  obidos: { nome: "Óbidos", lat: 39.3606, lon: -9.1568, massa: "continente" },
  "caldas da rainha": { nome: "Caldas da Rainha", lat: 39.4072, lon: -9.1358, massa: "continente" },
  peniche: { nome: "Peniche", lat: 39.3558, lon: -9.3811, massa: "continente" },
  nazare: { nome: "Nazaré", lat: 39.6019, lon: -9.0703, massa: "continente" },
  alcobaca: { nome: "Alcobaça", lat: 39.5486, lon: -8.9772, massa: "continente" },

  // ── Ribatejo e centro ───────────────────────────────────────────────────
  coruche: { nome: "Coruche", lat: 38.9578, lon: -8.5281, massa: "continente" },
  golega: { nome: "Golegã", lat: 39.4033, lon: -8.4842, massa: "continente" },
  tomar: { nome: "Tomar", lat: 39.6039, lon: -8.4103, massa: "continente" },
  fatima: { nome: "Fátima", lat: 39.6169, lon: -8.6714, massa: "continente" },
  batalha: { nome: "Batalha", lat: 39.6586, lon: -8.825, massa: "continente" },

  // ── Norte e Douro ───────────────────────────────────────────────────────
  guimaraes: { nome: "Guimarães", lat: 41.4425, lon: -8.2918, massa: "continente" },
  amarante: { nome: "Amarante", lat: 41.2711, lon: -8.0819, massa: "continente" },
  lamego: { nome: "Lamego", lat: 41.0956, lon: -7.8103, massa: "continente" },
  "peso da regua": { nome: "Peso da Régua", lat: 41.1631, lon: -7.7897, massa: "continente" },
  pinhao: { nome: "Pinhão", lat: 41.1908, lon: -7.5433, massa: "continente" },
  "vila nova de gaia": {
    nome: "Vila Nova de Gaia",
    lat: 41.1239,
    lon: -8.6118,
    massa: "continente",
  },
  matosinhos: { nome: "Matosinhos", lat: 41.1826, lon: -8.6892, massa: "continente" },
  chaves: { nome: "Chaves", lat: 41.7404, lon: -7.4711, massa: "continente" },
  "ponte de lima": { nome: "Ponte de Lima", lat: 41.7679, lon: -8.5828, massa: "continente" },

  // ── Algarve ─────────────────────────────────────────────────────────────
  lagos: { nome: "Lagos", lat: 37.1028, lon: -8.6742, massa: "continente" },
  portimao: { nome: "Portimão", lat: 37.1364, lon: -8.5378, massa: "continente" },
  albufeira: { nome: "Albufeira", lat: 37.0891, lon: -8.2503, massa: "continente" },
  loule: { nome: "Loulé", lat: 37.1378, lon: -8.0203, massa: "continente" },
  vilamoura: { nome: "Vilamoura", lat: 37.0781, lon: -8.1181, massa: "continente" },
  silves: { nome: "Silves", lat: 37.1892, lon: -8.4386, massa: "continente" },
  tavira: { nome: "Tavira", lat: 37.1275, lon: -7.6486, massa: "continente" },
  sagres: { nome: "Sagres", lat: 37.0086, lon: -8.9403, massa: "continente" },
};

/**
 * Regiões inteiras escritas no campo do local ("Alentejo", "Algarve").
 *
 * Não são lugares: são áreas do tamanho de um distrito ou maior. Resolvem-se
 * para um ponto central só para haver uma ordem de grandeza, e quem chama fica
 * a saber que foi isso que aconteceu através de `aproximado`.
 */
const REGIOES: Record<string, string> = {
  alentejo: "evora",
  "alto alentejo": "portalegre",
  "baixo alentejo": "beja",
  "alentejo litoral": "grandola",
  algarve: "faro",
  ribatejo: "santarem",
  douro: "peso da regua",
  minho: "braga",
  "tras-os-montes": "braganca",
  beiras: "viseu",
  "costa vicentina": "odemira",
  "serra da estrela": "guarda",
  geres: "braga",
  madeira: "funchal",
  acores: "ponta delgada",
  "lisboa e vale do tejo": "lisboa",
  "grande lisboa": "lisboa",
  oeste: "caldas da rainha",
};

/** Minúsculas, sem acentos, sem pontuação, espaços colapsados. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Localizacao {
  lugar: Lugar;
  /** Foi uma região inteira ("Alentejo") e não uma terra? Então é um ponto
   *  central, não o sítio do evento. */
  aproximado: boolean;
}

/**
 * O lugar que está escrito neste texto livre, se o conhecermos.
 *
 * O campo do local é escrito à mão pelo casal — chega "Herdade da Malhadinha,
 * Albernoa", "Évora", "Quinta X - Palmela", "Portugal". A estratégia é simples
 * e por essa ordem: nome inteiro conhecido, depois qualquer lugar nomeado
 * dentro do texto, depois qualquer região. O que sobrar é `null`.
 *
 * O nome mais LONGO ganha, para "Vila Nova de Milfontes" não ser lido como
 * "Vila Nova de Gaia" pela palavra "vila", nem "Castelo de Vide" como
 * "Castelo Branco".
 */
export function localizar(texto: string | null | undefined): Localizacao | null {
  if (!texto) return null;
  const k = chave(texto);
  if (!k) return null;

  const directo = LUGARES[k];
  if (directo) return { lugar: directo, aproximado: false };

  const regiaoExacta = REGIOES[k];
  if (regiaoExacta) return { lugar: LUGARES[regiaoExacta], aproximado: true };

  // "Portugal" sozinho não é uma morada — é a falta de uma. Dizer que é Évora
  // (o centro geográfico mais próximo que temos) seria inventar um facto.
  if (k === "portugal") return null;

  const contem = (nome: string) => new RegExp(`(^|[^a-z0-9])${nome}([^a-z0-9]|$)`).test(k);

  const lugares = Object.keys(LUGARES)
    .filter(contem)
    .sort((a, b) => b.length - a.length);
  if (lugares[0]) return { lugar: LUGARES[lugares[0]], aproximado: false };

  const regioes = Object.keys(REGIOES)
    .filter(contem)
    .sort((a, b) => b.length - a.length);
  if (regioes[0]) return { lugar: LUGARES[REGIOES[regioes[0]]], aproximado: true };

  return null;
}

/** Distância em linha reta, em quilómetros (haversine). */
export function distanciaKm(a: Lugar, b: Lugar): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Quilómetros de ESTRADA, estimados, arredondados aos 5.
 *
 * `null` quando a viagem cruza mar (continente ↔ ilhas, ou entre arquipélagos):
 * ali a pergunta não é quantos quilómetros são, é que voo se apanha, e um
 * número de estrada seria uma resposta errada a uma pergunta que não foi feita.
 */
export function kmPorEstrada(a: Lugar, b: Lugar): number | null {
  if (a.massa !== b.massa) return null;
  const recta = distanciaKm(a, b);
  return Math.round((recta * 1.25) / 5) * 5;
}

/** Atalho para o caso mais comum: a que distância de casa fica isto. */
export const EVORA: Lugar = LUGARES.evora;

/**
 * Distância de Évora ao que estiver escrito neste texto.
 *
 * `null` quando não se reconhece o sítio — e nesse caso quem chama mostra
 * menos, nunca um número inventado.
 */
export function kmDeEvora(texto: string | null | undefined): number | null {
  const l = localizar(texto);
  if (!l) return null;
  return kmPorEstrada(EVORA, l.lugar);
}

/** Só para os testes e para quem queira listar o que é conhecido. */
export function lugaresConhecidos(): string[] {
  return Object.keys(LUGARES);
}
