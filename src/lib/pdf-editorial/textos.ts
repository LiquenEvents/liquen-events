import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type { Grupo } from "./grupos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE O DESENHO NOVO DIZ POR SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só os RÓTULOS que o desenho novo traz e o antigo não tinha: o índice, os
 * nomes dos capítulos, o rodapé, as etiquetas curtas dos factos. Tudo o resto —
 * a capa, o «Obrigada», o lema, as notas, as condições, os textos legais — vem
 * de `textosDaProposta` e de `blocosFixosNaLingua`, tal e qual, e não se repete
 * aqui: duas verdades para a mesma frase discordavam no dia em que alguém
 * mudasse uma.
 *
 * As etiquetas dos factos são as CURTAS do exemplo dela («Data», «Convidados»),
 * e não as do quadro antigo («Data do Evento», «Número de Convidados»): numa
 * grelha de quatro colunas com letra espaçada, as compridas não cabem numa
 * linha.
 */
export interface TextosEditoriais {
  indice: string;
  tituloIndice: string;
  /** A entrada do índice para a página «A proposta» (o sobretítulo é da casa). */
  aProposta: string;
  /** O título da página «A proposta», com os primeiros nomes do casal. */
  tituloDaProposta: (nomes: string | null, organizacao: boolean) => string;
  factos: {
    evento: string;
    data: string;
    local: string;
    convidados: string;
    noivos: string;
    cliente: string;
    cerimonia: string;
    servicos: string;
    validaAte: string;
  };
  inspiracao: string;
  grupos: Readonly<Record<Grupo, string>>;
  /** A linha do rodapé depois da marca: «Proposta de decoração». */
  rodapeModelo: (organizacao: boolean) => string;
}

const PT: TextosEditoriais = {
  indice: "Índice",
  tituloIndice: "Conteúdo da proposta",
  aProposta: "A proposta",
  tituloDaProposta: (nomes, org) => {
    const oQue = org ? "Uma organização pensada" : "Uma decoração pensada";
    return nomes ? `${oQue} para o dia de ${nomes}` : `${oQue} para o vosso dia`;
  },
  factos: {
    evento: "Evento",
    data: "Data",
    local: "Local",
    convidados: "Convidados",
    noivos: "Noivos",
    cliente: "Cliente",
    cerimonia: "Cerimónia",
    servicos: "Serviços",
    validaAte: "Válida até",
  },
  inspiracao: "Inspiração",
  grupos: {
    cerimonia: "Cerimónia",
    cocktail: "Cocktail",
    jantar: "Jantar",
    complementos: "Complementos",
    ambiente: "Ambiente",
  },
  rodapeModelo: (org) => (org ? "Proposta de organização" : "Proposta de decoração"),
};

const EN: TextosEditoriais = {
  indice: "Contents",
  tituloIndice: "In this proposal",
  aProposta: "The proposal",
  tituloDaProposta: (nomes, org) => {
    const oQue = org ? "A celebration planned" : "A decoration designed";
    return nomes ? `${oQue} for ${nomes}’s day` : `${oQue} for your day`;
  },
  factos: {
    evento: "Event",
    data: "Date",
    local: "Venue",
    convidados: "Guests",
    noivos: "Couple",
    cliente: "Client",
    cerimonia: "Ceremony",
    servicos: "Services",
    validaAte: "Valid until",
  },
  inspiracao: "Inspiration",
  grupos: {
    cerimonia: "Ceremony",
    cocktail: "Cocktail",
    jantar: "Dinner",
    complementos: "Bridal details",
    ambiente: "Atmosphere",
  },
  rodapeModelo: (org) => (org ? "Planning proposal" : "Decoration proposal"),
};

export function textosEditoriais(idioma: IdiomaDaProposta): TextosEditoriais {
  return idioma === "en" ? EN : PT;
}

/**
 * Os primeiros nomes do casal, para o título: «Mafalda Santos & João Barros e
 * Cunha» → «Mafalda e João» (em inglês, «Mafalda and João»).
 *
 * Só o «&» separa o casal. O «e» não pode: «João Barros e Cunha» é UM nome.
 * Sem «&» (um cliente que é uma empresa, ou um só nome) devolve `null` e o
 * título diz «o vosso dia» — tirar a primeira palavra de «Quinta do Vale, Lda.»
 * dava «para o dia de Quinta».
 */
export function primeirosNomes(nomes: string, idioma: IdiomaDaProposta): string | null {
  const partes = nomes
    .split("&")
    .map((s) => s.trim())
    .filter(Boolean);
  if (partes.length !== 2) return null;
  const [a, b] = partes.map((p) => p.split(/\s+/)[0]);
  return `${a} ${idioma === "en" ? "and" : "e"} ${b}`;
}
