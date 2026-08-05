import type { ProposalDoc } from "./proposal-doc";
import { somaDosItens } from "./proposal-budget";

/**
 * ONDE ESTOU, O QUE JÁ ESTÁ FEITO, E O QUE FALTA PARA PODER ENVIAR.
 *
 * ── Porque é que isto é um módulo e não umas condições no JSX ─────────────
 * A mesma verdade é precisa em três sítios: na navegação lateral (que marca as
 * secções já preenchidas), no aviso do que falta, e na decisão de deixar ou
 * não carregar em «Enviar». Escrita três vezes, mais cedo ou mais tarde
 * discordava de si própria — o aviso dizia que faltava o valor e o botão
 * deixava enviar na mesma.
 *
 * ── O que conta como «preenchida» ─────────────────────────────────────────
 * Ter conteúdo com significado, não ter a estrutura montada. Um grupo de
 * serviços com o título vazio e um item vazio é o estado com que o estúdio
 * ABRE — contá-lo como feito punha um visto verde numa secção onde não há
 * nada escrito, que é a forma mais rápida de um indicador destes deixar de
 * merecer confiança.
 */

export interface EstadoSeccao {
  id: string;
  titulo: string;
  preenchida: boolean;
  /** O que dizer ao lado do nome — "2 grupos", "por preencher". */
  resumo: string;
}

const temTexto = (v: unknown) => typeof v === "string" && v.trim() !== "";

export function estadoDasSeccoes(doc: ProposalDoc): EstadoSeccao[] {
  const deco = doc.template !== "organizacao";

  // Um grupo só conta se tiver título OU pelo menos um item com nome.
  const grupos = (doc.serviceGroups ?? []).filter(
    (g) => temTexto(g.title) || (g.items ?? []).some((i) => temTexto(i.label)),
  );
  const boards = (doc.moodBoards ?? []).filter(
    (b) => temTexto(b.title) || (b.images ?? []).length > 0,
  );
  const linhas = (doc.budgetItems ?? []).filter(temTexto);
  const capas = (doc.coverImages ?? []).filter(temTexto);
  const fases = (doc.cronograma ?? []).filter(
    (f) => temTexto(f.title) || (f.items ?? []).some(temTexto),
  );

  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

  const seccoes: EstadoSeccao[] = [
    {
      id: "evento",
      titulo: "Evento",
      // O evento tem muitos campos, mas só três decidem se a proposta faz
      // sentido: de quem é, quando, e onde.
      preenchida: temTexto(doc.clientNames) && temTexto(doc.eventDate) && temTexto(doc.location),
      resumo: temTexto(doc.clientNames) ? doc.clientNames.trim() : "por preencher",
    },
  ];

  if (deco) {
    seccoes.push({
      id: "capas",
      titulo: "Capas",
      preenchida: capas.length > 0,
      resumo: capas.length === 0 ? "sem fotos" : plural(capas.length, "foto", "fotos"),
    });
  }

  seccoes.push({
    id: "servicos",
    titulo: "Serviços",
    preenchida: grupos.length > 0,
    resumo: grupos.length === 0 ? "por preencher" : plural(grupos.length, "grupo", "grupos"),
  });

  if (deco) {
    seccoes.push({
      id: "moodboards",
      titulo: "Mood boards",
      preenchida: boards.length > 0,
      resumo: boards.length === 0 ? "nenhum" : plural(boards.length, "board", "boards"),
    });
  } else {
    seccoes.push({
      id: "cronograma",
      titulo: "Cronograma",
      preenchida: fases.length > 0,
      resumo: fases.length === 0 ? "por preencher" : plural(fases.length, "fase", "fases"),
    });
  }

  seccoes.push(
    {
      id: "orcamento",
      titulo: "Orçamento",
      preenchida: linhas.length > 0,
      resumo: linhas.length === 0 ? "por preencher" : plural(linhas.length, "linha", "linhas"),
    },
    {
      id: "total",
      titulo: "Total e validade",
      preenchida: (doc.totalAmount ?? 0) > 0,
      resumo: (doc.totalAmount ?? 0) > 0 ? "definido" : "por definir",
    },
  );

  return seccoes;
}

export interface Impedimento {
  /** A secção onde está o problema, para o link poder lá saltar. */
  seccao: string;
  texto: string;
  /** Um impedimento TRAVA o envio; um reparo é só um conselho. */
  trava: boolean;
}

/**
 * O que falta para a proposta poder ser enviada.
 *
 * Os que TRAVAM são exactamente os que o botão de enviar já exigia — se um dia
 * divergirem, é aqui que se corrige, e num sítio só. Os outros são conselhos:
 * uma proposta sem mood boards pode ser enviada, mas provavelmente não devia.
 */
export function oQueFaltaParaEnviar(doc: ProposalDoc, totalBruto: number): Impedimento[] {
  const faltas: Impedimento[] = [];
  const deco = doc.template !== "organizacao";

  if (!temTexto(doc.clientNames)) {
    faltas.push({ seccao: "evento", texto: "Falta o nome dos clientes", trava: true });
  }
  if (!temTexto(doc.ref)) {
    // Aparece no topo de todas as páginas do PDF. Gera-se sozinho a partir do
    // resto, por isso estar vazio quer dizer que o resto também está.
    faltas.push({ seccao: "evento", texto: "Falta o título interno", trava: true });
  }
  if (totalBruto <= 0) {
    // Uma proposta a €0 seria enviada e poluiria os indicadores (total
    // enviado, taxa de aceitação) com um negócio vazio.
    faltas.push({ seccao: "total", texto: "Falta o valor", trava: true });
  }

  if (!temTexto(doc.eventDate)) {
    faltas.push({ seccao: "evento", texto: "Sem data do evento", trava: false });
  }
  if (!temTexto(doc.location)) {
    faltas.push({ seccao: "evento", texto: "Sem local", trava: false });
  }
  if ((doc.serviceGroups ?? []).every((g) => !temTexto(g.title))) {
    faltas.push({ seccao: "servicos", texto: "Nenhum grupo de serviços", trava: false });
  }
  if (deco && (doc.coverImages ?? []).every((c) => !temTexto(c))) {
    faltas.push({ seccao: "capas", texto: "Sem imagens de capa", trava: false });
  }
  if (deco && (doc.moodBoards ?? []).length === 0) {
    faltas.push({ seccao: "moodboards", texto: "Sem mood boards", trava: false });
  }
  // O aviso do orçamento vive na secção do total, que é onde ela o resolve.
  const soma = somaDosItens(doc);
  if (soma !== null && Math.abs(soma - (doc.totalAmount ?? 0)) > 0.01) {
    faltas.push({ seccao: "total", texto: "O total não bate com a soma das linhas", trava: false });
  }

  return faltas;
}

/** Pode enviar? A MESMA fonte que a lista acima, para não poderem discordar. */
export function podeEnviar(doc: ProposalDoc, totalBruto: number): boolean {
  return !oQueFaltaParaEnviar(doc, totalBruto).some((f) => f.trava);
}
