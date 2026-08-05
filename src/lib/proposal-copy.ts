import type { ProposalDoc } from "./proposal-doc";
import type { Quote } from "./orcamento/types";

/**
 * CRIAR UMA PROPOSTA A PARTIR DE OUTRA.
 *
 * ── Porque é que isto é a maior alavanca ──────────────────────────────────
 * Medido em `PROPOSTA-BEFORE.md`: montar do zero a proposta média da Líquen
 * custa 16 cliques e 23 campos escritos à mão (e isso ainda sem as fotos).
 * Quase todas as propostas são uma variação de uma anterior — os serviços, as
 * condições, o faseamento e a validade repetem-se quase sempre. O que muda é
 * de quem é o casamento.
 *
 * ── A regra ───────────────────────────────────────────────────────────────
 * Copia-se TUDO menos aquilo que é de OUTRA pessoa. Os campos que identificam
 * o casal — nome, data, local, convidados, e o valor — não se copiam: passam a
 * ser os do pedido novo, e são devolvidos numa lista para a interface os poder
 * destacar. Copiá-los seria a única forma de esta funcionalidade fazer mal em
 * vez de bem: uma proposta enviada com a data do casamento de outro casal.
 *
 * ── O que NÃO se decide aqui ──────────────────────────────────────────────
 * As FOTOS. Os caminhos das imagens vivem no Storage debaixo do pedido de
 * origem (ver `isProposalPath`), e copiar o caminho deixaria a proposta nova a
 * apontar para a pasta de outro pedido — se esse for apagado, esta fica sem
 * imagens, em silêncio e provavelmente já enviada. Esta função devolve os
 * caminhos em `fotosParaRecopiar` e quem tem acesso ao Storage trata deles.
 */

/** Campos que a interface tem de destacar depois de copiar. */
export type CampoAMudar =
  | "clientNames"
  | "eventDate"
  | "location"
  | "guests"
  | "ceremony"
  | "time"
  | "totalAmount";

export interface ResultadoDaCopia {
  doc: ProposalDoc;
  /** O que ficou por confirmar, para a interface marcar a atenção dela. */
  camposAMudar: CampoAMudar[];
  /**
   * Caminhos de imagem que continuam a apontar para o pedido de ORIGEM. Quem
   * chama trata de os recopiar para a pasta do pedido novo; enquanto isso não
   * acontecer, o documento é utilizável mas está acoplado ao outro pedido.
   */
  fotosParaRecopiar: string[];
}

/** Uma cópia funda e simples — os documentos são JSON puro. */
function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const PT_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2027-09-18" → "18 de setembro de 2027". Igual ao que o estúdio já faz. */
export function dataPorExtenso(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return iso;
  return `${Number(m[3])} de ${PT_MESES[mes - 1]} de ${m[1]}`;
}

/** Todos os caminhos de imagem de um documento, sem repetições. */
export function fotosDoDocumento(doc: ProposalDoc): string[] {
  const todas = [
    ...(doc.coverImages ?? []),
    ...(doc.moodBoards ?? []).flatMap((b) => b.images ?? []),
  ];
  // Só interessam os caminhos do Storage. Uma imagem em `data:` (coladas à mão
  // nos documentos mais antigos) viaja no próprio documento e não precisa de
  // ser recopiada — nem PODE ser, não está em lado nenhum.
  return [
    ...new Set(todas.filter((p) => typeof p === "string" && p !== "" && !p.startsWith("data:"))),
  ];
}

/**
 * O documento de origem, adaptado ao pedido novo.
 *
 * `origem` é o documento a copiar (de uma proposta anterior ou de um modelo).
 * `quote` é o pedido para quem a proposta nova vai ser feita.
 */
export function copiarParaPedido(origem: ProposalDoc, quote: Quote): ResultadoDaCopia {
  const doc = clonar(origem);
  const camposAMudar: CampoAMudar[] = [];

  // ── A identidade do evento passa a ser a do pedido novo ──────────────
  // Cada campo segue a mesma regra: se o pedido sabe a resposta, usa-se a dele
  // e assinala-se para ela confirmar; se o pedido não sabe, esvazia-se — nunca
  // se deixa lá o valor do casamento anterior.
  const substituir = (campo: CampoAMudar, valor: string) => {
    (doc as unknown as Record<string, unknown>)[campo] = valor;
    camposAMudar.push(campo);
  };

  substituir("clientNames", quote.name ?? "");
  substituir("eventDate", dataPorExtenso(quote.date));
  substituir("location", quote.location ?? "");
  substituir("guests", quote.guests ? `${quote.guests} pax` : "");

  // Cerimónia e hora são do dia de outra pessoa e o pedido não os traz. Ficam
  // vazios e marcados: melhor uma caixa por preencher do que "Civil, simbólica"
  // herdado de um casamento que não é este.
  if (doc.ceremony) substituir("ceremony", "");
  if (doc.time) substituir("time", "");

  // ── O dinheiro ───────────────────────────────────────────────────────
  // O valor da proposta anterior nunca serve. Se o pedido novo já tem um preço
  // final, é esse; se não tem, fica vazio. O modo de IVA e a taxa COPIAM-SE —
  // são a forma de trabalhar dela, não um dado do casal.
  delete doc.totalAmount;
  doc.totalText = "";
  doc.totalEstimatedText = "";
  if (typeof quote.quotedPrice === "number" && quote.quotedPrice > 0) {
    doc.totalAmount = quote.quotedPrice;
  }
  camposAMudar.push("totalAmount");

  // ── O título interno ─────────────────────────────────────────────────
  // Deriva do resto e o estúdio volta a gerá-lo. Deixá-lo com o nome do casal
  // anterior era a forma mais fácil de enviar um PDF com o nome errado no
  // cabeçalho de todas as páginas.
  doc.ref = "";

  // ── A validade ───────────────────────────────────────────────────────
  // Os DIAS copiam-se (é a política dela); uma data fixa não, porque é do
  // calendário da proposta antiga e provavelmente já passou.
  delete doc.validUntil;

  return { doc, camposAMudar, fotosParaRecopiar: fotosDoDocumento(doc) };
}

/**
 * Troca os caminhos das fotos pelos novos, depois de o Storage as ter
 * copiado.
 *
 * O que NÃO estiver no mapa fica como estava — de propósito. Uma cópia que
 * falhou deixa a proposta nova a partilhar a foto com a antiga, o que é um
 * acoplamento indesejado mas VISÍVEL (a foto aparece); trocar por vazio seria
 * apagar uma imagem que ela escolheu, e ela só daria por isso no PDF.
 */
export function trocarFotos(doc: ProposalDoc, mapa: Map<string, string>): ProposalDoc {
  if (mapa.size === 0) return doc;
  const troca = (p: string) => mapa.get(p) ?? p;
  return {
    ...doc,
    // As capas mantêm SEMPRE as duas posições: é a posição que decide o lado
    // onde a foto é impressa, por isso o array nunca se compacta.
    coverImages: (doc.coverImages ?? []).map((p) => (p ? troca(p) : p)),
    moodBoards: (doc.moodBoards ?? []).map((b) => ({ ...b, images: (b.images ?? []).map(troca) })),
  };
}
