/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM PEDE E QUEM SE CASA — DUAS PESSOAS QUE O ECRÃ NÃO PODE TROCAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A 14/10 ela mandou o email de um pedido novo com «Maria Silva» em grande e,
 * mais abaixo, «Casal: Luana Silva & Afonso Duarte»: «atenção, uma coisa grave
 * que se passa… o nome da noiva não tem nada a ver com o nome».
 *
 * Não era um nome trocado pelo sistema: o formulário tem o campo de QUEM ESCREVE
 * (`name` — pode ser alguém da família, uma wedding planner, um dos dois) e os
 * dois nomes do CASAL (`partnerA`/`partnerB`), e no campo de quem escreve
 * estava «Maria Silva». Quem é a Maria não se sabe daqui. O defeito é o email
 * pôr em grande a pessoa errada sem dizer que são duas.
 *
 * A decisão dela: quando há casal e quem escreveu NÃO é um dos dois, em grande
 * vai o casal, e quem escreveu passa a uma linha («Pedido feito por …»).
 */

/** Sem acentos, sem maiúsculas, espaços simples. */
function achatar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** «Luana Silva & Afonso Duarte», ou "" quando o casal não deu nomes. */
export function nomesDoCasal(partnerA?: string, partnerB?: string): string {
  return [partnerA, partnerB]
    .map((n) => n?.trim())
    .filter(Boolean)
    .join(" & ");
}

/**
 * Quem escreveu é um dos noivos?
 *
 * Basta o PRIMEIRO nome de um deles aparecer como palavra no nome de quem
 * escreveu: «Luana», «Luana Silva», «Luana e Afonso» são todos o casal. O
 * apelido não conta, e é de propósito — «Maria Silva» partilha o apelido com
 * a «Luana Silva» e não é ela.
 */
export function eUmDosNoivos(nome: string, partnerA?: string, partnerB?: string): boolean {
  const palavras = new Set(achatar(nome).split(" ").filter(Boolean));
  return [partnerA, partnerB].some((p) => {
    const primeiro = achatar(p ?? "").split(" ")[0];
    return !!primeiro && palavras.has(primeiro);
  });
}

export interface QuemPedeEOCasal {
  /** O que vai em grande: o casal, ou quem escreveu quando não há outro. */
  titulo: string;
  /** Quem escreveu, quando não é um dos noivos — vai numa linha à parte. */
  feitoPor: string | null;
  /** «Luana Silva & Afonso Duarte», ou "". */
  casal: string;
}

export function quemPedeEOCasal(q: {
  name?: string;
  partnerA?: string;
  partnerB?: string;
}): QuemPedeEOCasal {
  const nome = (q.name ?? "").trim();
  const casal = nomesDoCasal(q.partnerA, q.partnerB);
  if (casal && nome && !eUmDosNoivos(nome, q.partnerA, q.partnerB)) {
    return { titulo: casal, feitoPor: nome, casal };
  }
  return { titulo: nome || casal, feitoPor: null, casal };
}
