import {
  DEFAULT_VAT_RATE,
  detectVatMode,
  totalAmountParaBase,
  type ProposalDoc,
  type VatMode,
} from "./proposal-doc";
import { eur } from "./money";
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

/**
 * Campos que a interface tem de destacar — depois de copiar, e também depois de
 * SEMEAR a partir do pedido.
 *
 * São os mesmos nos dois casos porque a pergunta é a mesma: «isto veio de outro
 * lado, confirma». O que muda é a origem (uma proposta antiga, ou o formulário
 * que o casal preencheu), e nenhuma das duas é a palavra final.
 */
export type CampoAMudar =
  | "clientNames"
  | "eventType"
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

/**
 * "Maria & Zé" a partir dos nomes que o casal deu, ou "" se não deu nenhum.
 *
 * A MESMA regra do `initialDoc` do estúdio, e pela mesma razão que lá está
 * escrita: o `quote.name` é de quem PREENCHEU o formulário — pode ser a mãe da
 * noiva ou uma wedding planner — e uma proposta endereçada a essa pessoa em vez
 * de a quem casa lê-se como um erro de quem a mandou. A cópia escrevia o
 * `quote.name` e desfazia, em silêncio, o cuidado que o estúdio tem quando
 * abre uma proposta de raiz.
 *
 * Com um só nome escrito devolve esse: meio par continua a ser melhor.
 */
function nomesDoCasal(quote: Quote): string {
  return [quote.partnerA, quote.partnerB]
    .map((n) => n?.trim())
    .filter(Boolean)
    .join(" & ");
}

/**
 * As Condições Gerais da origem, com o que era do OUTRO casal outra vez em
 * marcadores.
 *
 * `withProposalDefaults` substitui `{DATA}` e `{CONVIDADOS}` no SERVIDOR antes
 * de gravar. Por isso o documento de uma proposta ENVIADA — que é de onde se
 * copia — já não tem marcadores nenhuns: tem "…só é válida para o evento a
 * realizar no dia 3 de julho de 2027" e "…válida para o número de 150 pax
 * convidados", escritos por extenso. Copiadas tal e quais, essas frases iam
 * inteiras para o documento do casal novo, e não havia lá marcador nenhum para
 * o servidor voltar a preencher: o PDF da Rita saía a dizer que só era válido
 * para o casamento da Ana.
 *
 * Desfaz-se a substituição em vez de se deitar fora o bloco todo, porque a
 * redacção pode ter sido mudada (num modelo, numa reposição de cópia de
 * segurança) e essa redacção é dela. O que se troca é só o que era do outro
 * casamento. A partir daqui o caminho normal volta a funcionar: qualquer
 * pré-visualização ou envio passa por `withProposalDefaults`, que preenche os
 * marcadores com a data e os convidados DESTE pedido.
 *
 * Quando a origem não tinha data nem convidados, as frases dela não têm dado
 * nenhum lá dentro para trocar: são a OUTRA redacção da cláusula, a que fala da
 * data «que vier a ser confirmada por escrito» (ver `CONDICOES_SEM_DADO` em
 * `proposal-doc.ts`). Copiadas assim, continuam a ser frases verdadeiras para o
 * casal novo — e se ele já tiver data, é uma condição a rever à mão, como
 * qualquer outra que ela tenha reescrito.
 */
function remarcarCondicoes(condicoes: string[] | undefined, origem: ProposalDoc): string[] {
  if (!condicoes || condicoes.length === 0) return condicoes ?? [];
  const trocas: [string, string][] = [];
  const data = (origem.eventDate ?? "").trim();
  const convidados = (origem.guests ?? "").trim();
  // Um valor curto de mais (um "8", um "—") apareceria a meio de palavras e
  // deixaria as frases piores do que estavam.
  if (data.length >= 4) trocas.push([data, "{DATA}"]);
  if (convidados.length >= 3) trocas.push([convidados, "{CONVIDADOS}"]);
  if (trocas.length === 0) return condicoes;
  return condicoes.map((frase) => trocas.reduce((s, [de, para]) => s.split(de).join(para), frase));
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

  substituir("clientNames", nomesDoCasal(quote) || (quote.name ?? ""));
  substituir("eventDate", dataPorExtenso(quote.date));
  substituir("location", quote.location ?? "");
  substituir("guests", quote.guests ? `${quote.guests} pax` : "");

  // Cerimónia e hora são do dia de outra pessoa e o pedido não os traz. Ficam
  // vazios e marcados: melhor uma caixa por preencher do que "Civil, simbólica"
  // herdado de um casamento que não é este.
  if (doc.ceremony) substituir("ceremony", "");
  if (doc.time) substituir("time", "");

  // ── As Condições Gerais voltam a falar do casal certo ────────────────
  doc.condicoesGerais = remarcarCondicoes(doc.condicoesGerais, origem);

  // ── O que é privado do OUTRO negócio não viaja ───────────────────────
  // "Cliente da AMARA, cuidado com o prazo." "Já recusaram uma proposta em 2025
  // por preço." São frases escritas sobre um casal e sobre uma negociação, e
  // não sobre o serviço — a regra deste módulo («copia-se tudo menos aquilo que
  // é de outra pessoa») aplica-se-lhes inteira. Não saem no PDF, mas ficavam
  // coladas ao casal errado no estúdio e na cópia de segurança, e é assim que
  // uma nota sobre um cliente acaba lida em voz alta na reunião do seguinte.
  delete doc.notasInternas;
  delete doc.notasPorSeccao;

  // ── O que FICA de propósito, e porquê ────────────────────────────────
  // `budgetCosts` — o que cada linha custa à Líquen. É do SERVIÇO, não do
  //   casal, e as linhas e os preços vêm todos na cópia: tirar só os custos
  //   deixava a margem a dizer 100%, que é um número ERRADO em vez de um
  //   número em falta. Continua a nunca sair no PDF (há teste).
  // `fotosDeBiblioteca` — de que fotos da biblioteca saíram estas. Existe para
  //   avisar que uma foto já foi para outro casamento, e uma proposta copiada é
  //   precisamente o caso que ele tem de apanhar: as fotos são as mesmas. Sem
  //   isto, o aviso ficava cego no único sítio onde era certo.

  // ── O dinheiro ───────────────────────────────────────────────────────
  // O valor da proposta anterior nunca serve. Se o pedido novo já tem um preço
  // final, é esse; se não tem, fica vazio. O modo de IVA e a taxa COPIAM-SE —
  // são a forma de trabalhar dela, não um dado do casal.
  //
  // ── DUAS COISAS QUE ISTO TEM DE FAZER E NÃO FAZIA ────────────────────
  // 1. ESCREVER O TEXTO. O PDF imprime o TEXTO do total (`totalStr || "—"`),
  //    mas quem decide se a proposta pode seguir lê o `totalAmount`. Repor só o
  //    número dava um documento com «Valor Total —» e, três linhas abaixo,
  //    «Sinal 30% 2.988,90 €»: uma percentagem de um número que a folha não
  //    mostra, com o botão de enviar ligado.
  // 2. RESPEITAR O MODO DE IVA. `quote.quotedPrice` é o «Preço final (SEM
  //    IVA)» — é a BASE. Mas `totalAmount` só é a base no modo «acrescer»; em
  //    «IVA incluído» é o BRUTO. Copiar uma proposta em «IVA incluído» e pôr lá
  //    o líquido fazia a base cair 23% em silêncio, e o número parecia bem.
  const modo: VatMode =
    origem.totalVatMode ?? detectVatMode(origem.totalText || origem.totalEstimatedText);
  const taxa =
    typeof origem.vatRate === "number" && origem.vatRate >= 0 ? origem.vatRate : DEFAULT_VAT_RATE;
  delete doc.totalAmount;
  doc.totalText = "";
  doc.totalEstimatedText = "";
  if (typeof quote.quotedPrice === "number" && quote.quotedPrice > 0) {
    // A mesma conta que o estúdio faz ao escrever o «Preço final (sem IVA)» —
    // uma função só, para as duas não poderem divergir.
    const valor = totalAmountParaBase(quote.quotedPrice, modo, taxa);
    const texto = modo === "acrescer" ? `${eur(valor)} + IVA` : eur(valor);
    doc.totalAmount = valor;
    // O modo passa a estar ESCRITO. Vinha por omissão do texto da origem, que
    // acabámos de apagar — sem isto, o documento novo ficava a ser lido como
    // "IVA incluído" só porque já não havia "+ IVA" em lado nenhum.
    doc.totalVatMode = modo;
    if (doc.template === "organizacao") doc.totalEstimatedText = texto;
    else doc.totalText = texto;
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
