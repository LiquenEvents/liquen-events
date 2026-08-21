import type { ProposalDoc } from "./proposal-doc";
import {
  blocosFixosNaLingua,
  camposDoEventoNaLingua,
  rotuloDoTotalNaLingua,
  textosDaProposta,
  type IdiomaDaProposta,
} from "./proposal-doc-textos";
import { ordemDeSaida } from "./proposal-ordem";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS QUE A PROPOSTA VAI TER, PELA ORDEM EM QUE SAEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O defeito que isto existe para fechar ─────────────────────────────────
 *
 * Palavras dela: «"Todas" mostra 7 páginas quando o PDF tem cerca de 14 — a
 * contagem tem de bater certo».
 *
 * E não batia porque não eram a mesma coisa. A «Vista de conjunto» recebia um
 * único dado — os mood boards — e mostrava-os todos; o PDF tem os mood boards
 * MAIS a capa, a apresentação, os serviços, o orçamento, as condições, as
 * observações e a contracapa. Não era um contador partido: era um reordenador
 * de páginas de inspiração com o nome de «Todas».
 *
 * O preço disso é o que ela diz a seguir, e é o que interessa: «uma
 * pré-visualização parcial dá falsa confiança». Foi nas páginas que ela NÃO
 * via que estavam os erros que chegaram a clientes.
 *
 * ── Secções, e não folhas ─────────────────────────────────────────────────
 *
 * Uma lista de FOLHAS exactas não se pode calcular sem desenhar o PDF: os
 * serviços, o orçamento e as condições transbordam conforme o texto que lá
 * está, e o transbordo decide-se com a fonte, a medida e a altura da folha.
 * Prometer «página 9 de 14» e depois sair 15 é voltar ao mesmo defeito com
 * outro número.
 *
 * O que se enumera aqui são as SECÇÕES, que são exactas — cada uma existe ou
 * não existe, e a ordem é a do gerador. Quantas folhas cada uma ocupa em média
 * está no `FOLHAS_TIPICAS`, MEDIDO, e é o que dá o «cerca de».
 *
 * ── Porque é que a ordem não é uma lista escrita à mão ────────────────────
 *
 * Os mood boards saem pela `ordemDeSaida` — a mesma função que o gerador do
 * PDF usa, e que respeita os capítulos dos serviços. Escrever aqui uma segunda
 * ordem era garantir que um dia divergiam, e a divergência apareceria como
 * «a miniatura 3 abre a página 5».
 */

export type EspecieDePagina =
  | "capa"
  | "apresentacao"
  | "cronograma"
  | "moodboard"
  | "orcamento"
  | "condicoes"
  | "observacoes"
  | "contracapa";

export interface PaginaDaProposta {
  especie: EspecieDePagina;
  /** Como se lhe chama no índice e por baixo da miniatura. */
  titulo: string;
  /** O índice REAL no `doc.moodBoards` — só nas páginas de inspiração. */
  bi?: number;
  /**
   * A secção do formulário que produz esta página.
   *
   * É o que permite o que ela pediu: «clicar numa miniatura salta para a
   * secção do formulário que a produz. Hoje vê-se um problema na página 5 e
   * tem de se procurar onde ele nasce.» Os ids são os mesmos do
   * `estadoDasSeccoes`, para o salto usar o índice que já existe.
   */
  seccao: string;
}

/**
 * Quantas FOLHAS cada secção costuma ocupar.
 *
 * MEDIDO, e não estimado: geraram-se PDFs de propostas com 0, 1 e 3 mood
 * boards e contaram-se as folhas — 7, 8 e 10. Sete fixas, mais uma por página
 * de inspiração. Estes números são a repartição dessas sete pelas secções que
 * as ocupam.
 *
 * Um texto muito longo (condições reescritas à mão, uma lista de serviços
 * enorme) empurra uma secção para a folha seguinte, e é por isso que o que se
 * mostra a partir daqui diz «cerca de». É um piso honesto, não uma promessa.
 */
const FOLHAS_TIPICAS: Record<EspecieDePagina, number> = {
  capa: 1,
  apresentacao: 2,
  cronograma: 1,
  moodboard: 1,
  orcamento: 1,
  condicoes: 1,
  observacoes: 1,
  contracapa: 1,
};

const temTexto = (v: unknown) => typeof v === "string" && v.trim() !== "";

/**
 * As fases do cronograma que chegam a ter página.
 *
 * A mesma regra do gerador, e escrita lá com a razão: «uma fase sem tarefas é
 * um título sozinho», e um cronograma inteiro em branco abria uma folha só com
 * o cabeçalho.
 */
function fasesComTarefas(doc: Pick<ProposalDoc, "cronograma">) {
  return (doc.cronograma ?? []).filter((fase) =>
    (fase.items ?? []).some((it) => temTexto(it ?? "")),
  );
}

/**
 * As páginas de inspiração que chegam a sair, pela ordem em que saem.
 *
 * Um board sem fotografias não produz folha nenhuma — o gerador salta-o de
 * propósito, para nunca mostrar a um cliente uma página vazia. (Desde o P0,
 * um board com título e sem fotos também trava o envio: é um erro a corrigir,
 * não uma página a desenhar.)
 */
export function boardsQueSaem(doc: ProposalDoc): number[] {
  const boards = doc.moodBoards ?? [];
  return ordemDeSaida(doc, boards, (b) => b.title ?? "").filter(
    (bi) => (boards[bi]?.images ?? []).length > 0,
  );
}

/** As secções do documento, pela ordem em que o PDF as desenha. */
export function paginasDaProposta(doc: ProposalDoc): PaginaDaProposta[] {
  const org = doc.template === "organizacao";
  const paginas: PaginaDaProposta[] = [
    { especie: "capa", titulo: "Capa", seccao: "capas" },
    { especie: "apresentacao", titulo: "Apresentação e serviços", seccao: "servicos" },
  ];

  if (fasesComTarefas(doc).length > 0) {
    paginas.push({ especie: "cronograma", titulo: "Cronograma", seccao: "cronograma" });
  }

  for (const bi of boardsQueSaem(doc)) {
    paginas.push({
      especie: "moodboard",
      titulo: (doc.moodBoards[bi]?.title ?? "").trim() || `Inspiração ${bi + 1}`,
      bi,
      seccao: "moodboards",
    });
  }

  paginas.push(
    { especie: "orcamento", titulo: "Orçamento", seccao: "orcamento" },
    { especie: "condicoes", titulo: "Condições gerais", seccao: "total" },
    { especie: "observacoes", titulo: "Observações e contactos", seccao: "total" },
    { especie: "contracapa", titulo: "Contracapa", seccao: "capas" },
  );

  // A capa e a contracapa espelham-se, e as duas vivem das mesmas fotografias:
  // por isso a secção é a mesma. O `org` fica lido para o dia em que o modelo
  // de organização deixar de partilhar esta espinha.
  void org;

  return paginas;
}

/**
 * Quantas FOLHAS a proposta deve ter, aproximadamente.
 *
 * É este número que aparece no «PDF com cerca de N páginas» — e é o mesmo que
 * a vista de conjunto tem de contar, senão voltamos a ter dois números sobre o
 * mesmo documento.
 */
export function folhasAproximadas(doc: ProposalDoc): number {
  return paginasDaProposta(doc).reduce((n, p) => n + FOLHAS_TIPICAS[p.especie], 0);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTÁ ESCRITO EM CADA FOLHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Porque é que isto não é «o PDF em pequenino» ──────────────────────────
 *
 * Porque não pode ser, e prometê-lo era o mesmo defeito outra vez. As folhas de
 * texto transbordam conforme a fonte e a medida, e só se sabe onde partem
 * depois de desenhadas. Uma miniatura que fingisse a paginação exacta estaria
 * errada precisamente nos casos em que a paginação importa.
 *
 * O que aqui se promete é outra coisa, e é verificável: **as palavras são as da
 * folha**. Os campos do evento vêm de `camposDoEventoNaLingua`, as condições de
 * `blocosFixosNaLingua`, os títulos de `textosDaProposta` — as mesmas funções
 * que o gerador chama. Se um `{{marcador}}` ficou por substituir, ou se a
 * secção está vazia, ou se o inglês não saiu, isso vê-se aqui porque está
 * mesmo lá.
 *
 * ── E é por isso que vale a pena ──────────────────────────────────────────
 *
 * «Uma pré-visualização parcial dá falsa confiança.» Foi nas páginas que ela
 * NÃO via que estavam os erros que chegaram a clientes — e nenhum deles era um
 * erro de paginação: eram secções vazias, marcadores por substituir e texto na
 * língua errada. São exactamente os que isto mostra.
 */
export interface ResumoDaPagina {
  /** «O que propomos» — o mesmo sobretítulo que o gerador escreve. */
  sobretitulo: string;
  /** «Serviços». */
  titulo: string;
  /** As linhas de texto que a folha leva, pela ordem em que as leva. */
  linhas: string[];
  /**
   * A folha não tem conteúdo nenhum.
   *
   * Não é o mesmo que «ainda não escrevi»: é uma folha que vai ser IMPRESSA
   * com um cabeçalho e mais nada por baixo, e é isso que chega ao cliente.
   */
  vazia: boolean;
}

/** «Rótulo: valor», e só quando há valor. */
function campoEscrito(rotulo: string, valor: string | undefined): string | null {
  const v = (valor ?? "").trim();
  return v ? `${rotulo}: ${v}` : null;
}

const semVazias = (linhas: (string | null | undefined)[]) =>
  linhas.filter((l): l is string => !!l && l.trim() !== "").map((l) => l.trim());

/**
 * O que está escrito na folha de uma página, na língua em que ela vai sair.
 *
 * As páginas de inspiração não passam por aqui para serem desenhadas — essas
 * têm a `PreviaDaPagina`, que as desenha à escala com as fotografias lá dentro.
 * Respondem na mesma, para quem quiser o texto de uma página qualquer sem ter
 * de saber de que espécie ela é.
 */
export function resumoDaPagina(
  doc: ProposalDoc,
  pagina: PaginaDaProposta,
  idioma: IdiomaDaProposta = "pt",
): ResumoDaPagina {
  const t = textosDaProposta(idioma);
  const evento = camposDoEventoNaLingua(doc, idioma);
  const fixos = blocosFixosNaLingua(doc, idioma);
  const org = doc.template === "organizacao";
  const feito = (sobretitulo: string, titulo: string, linhas: (string | null | undefined)[]) => {
    const limpas = semVazias(linhas);
    return { sobretitulo, titulo, linhas: limpas, vazia: limpas.length === 0 };
  };

  switch (pagina.especie) {
    case "capa":
    case "contracapa":
      // A capa desenha-se, não se lê: o que aqui vai é o que está escrito no
      // painel escuro, por baixo do nome do casal.
      return feito(org ? t.capaOrganizacao : t.capaDecoracao, (doc.clientNames ?? "").trim(), [
        [evento.eventType, evento.eventDate]
          .map((s) => (s ?? "").trim())
          .filter(Boolean)
          .join("   ·   "),
        doc.location,
      ]);

    case "apresentacao": {
      // A MESMA lista de campos do gerador, pela mesma ordem e com as mesmas
      // omissões: um «Hora:» seguido de nada é um erro impresso, e não uma
      // linha por preencher.
      const campos = semVazias([
        campoEscrito(org ? t.campos.cliente : t.campos.noivos, doc.clientNames),
        org ? null : campoEscrito(t.campos.evento, evento.eventType),
        campoEscrito(t.campos.data, evento.eventDate),
        campoEscrito(t.campos.local, doc.location),
        campoEscrito(t.campos.convidados, evento.guests),
        campoEscrito(t.campos.servico, doc.servico),
        org ? null : campoEscrito(t.campos.cerimonia, evento.ceremony),
        org ? null : campoEscrito(t.campos.hora, evento.time),
      ]);
      // Os serviços saem na mesma folha, debaixo do seu próprio cabeçalho —
      // por isso a página tem os dois e não se conta duas vezes.
      const servicos: string[] = [];
      for (const g of doc.serviceGroups ?? []) {
        const titulo = [g.letter, idioma === "en" ? (g.titleEn ?? g.title) : g.title]
          .map((s) => (s ?? "").trim())
          .filter(Boolean)
          .join(" ");
        if (titulo) servicos.push(titulo);
        for (const it of g.items ?? []) {
          const rotulo = idioma === "en" ? (it.labelEn ?? it.label) : it.label;
          if ((rotulo ?? "").trim()) servicos.push(rotulo.trim());
        }
      }
      return feito(t.sobretituloApresentacao, t.tituloApresentacao, [
        ...campos,
        ...(servicos.length ? [`— ${t.tituloServicos} —`, ...servicos] : []),
      ]);
    }

    case "cronograma":
      return feito(
        t.sobretituloCronograma,
        t.tituloCronograma,
        fasesComTarefas(doc).flatMap((fase) => [
          (fase.title ?? "").trim(),
          ...(fase.items ?? []).map((it) => (it ?? "").trim()),
        ]),
      );

    case "moodboard": {
      const b = pagina.bi === undefined ? undefined : doc.moodBoards?.[pagina.bi];
      return feito(t.sobretituloInspiracao ?? "", pagina.titulo, [b?.subtitulo, b?.annotation]);
    }

    case "orcamento": {
      const linhas = (doc.budgetItems ?? []).map((item, i) =>
        idioma === "en" ? (doc.budgetItemsEn?.[i] ?? item) : item,
      );
      const rotulo = rotuloDoTotalNaLingua(doc, idioma);
      const total = (org ? (doc.totalEstimatedText ?? "") : (doc.totalText ?? "")).trim();
      return feito(t.sobretituloOrcamento, t.tituloOrcamento, [
        ...linhas,
        // O total desenha-se mesmo sem valor: a folha leva o rótulo e um «—», e
        // é essa a folha que se tem de poder ver antes de a mandar.
        `${rotulo}: ${total || "—"}`,
        // As notas importantes e as condições de reserva viajam nesta folha,
        // por baixo do quadro — ver «AS DUAS RUBRICAS VIAJAM JUNTAS» no gerador.
        ...(fixos.notasImportantes?.length ? [`— ${t.notasImportantes} —`] : []),
        ...(fixos.notasImportantes ?? []),
      ]);
    }

    case "condicoes":
      return feito(t.sobretituloCondicoes, t.tituloCondicoes, fixos.condicoesGerais ?? []);

    case "observacoes":
      // A folha do fecho: os próximos passos, as observações, o faseamento do
      // pagamento e o cancelamento. Não leva sobretítulo numerado — abre
      // directamente na rubrica, como o gerador a desenha.
      return feito("", t.proximosPassos, [
        ...(fixos.observacoesGerais?.length ? [`— ${t.observacoesGerais} —`] : []),
        ...(fixos.observacoesGerais ?? []),
        ...(fixos.faseamento?.length ? [`— ${t.faseamentoDoPagamento} —`] : []),
        ...(fixos.faseamento ?? []),
        ...(fixos.cancelamento?.length ? [`— ${t.cancelamento} —`] : []),
        ...(fixos.cancelamento ?? []),
      ]);
  }
}

/**
 * A rubrica de uma linha do resumo, ou `null` se for texto corrente.
 *
 * O gerador desenha «Serviços», «Faseamento do Pagamento» e as outras rubricas
 * como sub-cabeçalhos, e a folha lê-se por elas. No resumo vêm marcadas com
 * travessões — e é aqui, num sítio só, que se diz o que essa marca quer dizer:
 * quem desenha a miniatura não tem de conhecer a convenção, pergunta.
 */
export function rubricaDaLinha(linha: string): string | null {
  return /^—\s*(.+?)\s*—$/.exec(linha)?.[1] ?? null;
}
