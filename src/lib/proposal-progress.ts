import { type ProposalDoc } from "./proposal-doc";
import { desalinhamento, dinheiroDaProposta } from "./proposal-budget";
import { camposPorTraduzir } from "./proposal-doc-bilingue";
import { camposDoDocumento, lerCampo } from "./proposal-ortografia";

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CADA SECÇÃO TEM — contado UMA vez, para as duas listas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro tinha duas contagens da mesma coisa, e elas discordavam.
 *
 * O índice lateral contava um grupo de serviços se ele tivesse título OU um
 * item com nome — que é a regra certa, porque um grupo com três serviços
 * escritos e o título ainda por pôr é um grupo com trabalho lá dentro. A lista
 * do que falta contava só o TÍTULO. Resultado, no ecrã dela: «Talvez queira:
 * Nenhum grupo de serviços» por cima de um grupo de serviços visível.
 *
 * ── E O ORÇAMENTO ESTAVA A SER MEDIDO NO SÍTIO ERRADO ────────────────────
 *
 * As linhas do orçamento vivem em `budgetItems` no modelo Decoração e em
 * `budgetRows` (as linhas estimadas) no modelo Organização. A contagem olhava
 * só para o primeiro: numa proposta de Organização de 3.862,20 € o índice
 * dizia «Orçamento · por preencher», com o orçamento preenchido no ecrã.
 *
 * Um índice que mente sobre o que está feito é pior do que não haver índice:
 * ensina a não confiar nele, e a partir daí ele deixa de poupar o scroll que
 * existe para poupar.
 */
function oQueTemODocumento(doc: ProposalDoc) {
  const deco = doc.template !== "organizacao";
  return {
    deco,
    /** Um grupo conta com título OU com um item com nome. */
    grupos: (doc.serviceGroups ?? []).filter(
      (g) => temTexto(g.title) || (g.items ?? []).some((i) => temTexto(i.label)),
    ),
    boards: (doc.moodBoards ?? []).filter((b) => temTexto(b.title) || (b.images ?? []).length > 0),
    /** As linhas do orçamento, no campo que ESTE modelo usa. */
    linhas: deco
      ? (doc.budgetItems ?? []).filter(temTexto)
      : (doc.budgetRows ?? []).filter((r) => temTexto(r?.item)),
    capas: (doc.coverImages ?? []).filter(temTexto),
    fases: (doc.cronograma ?? []).filter(
      (f) => temTexto(f.title) || (f.items ?? []).some(temTexto),
    ),
  };
}

export function estadoDasSeccoes(doc: ProposalDoc): EstadoSeccao[] {
  const { deco, grupos, boards, linhas, capas, fases } = oQueTemODocumento(doc);

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
  /**
   * Identidade estável do ASSUNTO, e não desta frase.
   *
   * A Conferência — que é a lista única do passo de envio — já tem palavras
   * suas para metade destes assuntos, e melhores: sabe comparar com o pedido e
   * diz «A proposta diz "X" e o pedido pedia Y». Sem uma identidade partilhada,
   * juntar as duas listas produzia duas linhas sobre o nome dos clientes, uma
   * delas mais pobre — que é a maneira de se aprender a não ler nenhuma.
   *
   * Com ela, quem já tem frase fica com a frase e ganha só a marca de TRAVA;
   * quem não tem entra na lista tal como está escrito aqui.
   */
  id: string;
  /** A secção onde está o problema, para o link poder lá saltar. */
  seccao: string;
  /**
   * O `data-campo` do controlo, quando ele existe.
   *
   * É o que transforma «Falta o nome dos clientes» num link que põe o cursor
   * dentro da caixa. Sem controlo próprio (as capas, os mood boards) fica por
   * preencher e o salto cai na SECÇÃO — que é onde a resposta está.
   */
  campo?: string;
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
/**
 * O que o DOCUMENTO não sabe de si próprio, e sem o qual metade dos bloqueios
 * não se pode decidir.
 *
 * A separação já existia neste ficheiro e mantém-se: aqui olha-se para o
 * documento, e o que é estado da sessão — as fotos que ainda vão a caminho —
 * fica no estúdio. Estas três são do meio: nascem fora do documento mas
 * decidem se ele pode sair, portanto entram como argumento em vez de duplicarem
 * a lista do lado de lá.
 */
export interface ContextoDoEnvio {
  /** A língua em que a proposta vai sair. */
  idioma?: "pt" | "en";
  /**
   * Caminhos de imagem do documento que NÃO resolvem para um endereço.
   *
   * Quem sabe isto é o estúdio, que tem o mapa dos `assetUrls`. Uma foto que
   * não resolve não é uma foto em falta no documento — está lá escrita, e é
   * por isso que ninguém dá por ela até o PDF sair com um buraco.
   */
  imagensQueFaltam?: readonly string[];
  /** O email do cliente. Sem ele gera-se, mas não se envia. */
  emailDoCliente?: string;
}

/** Um `{{marcador}}` que sobreviveu até ao texto final. */
const TEM_CHAVETAS = /\{\{/;

export function oQueFaltaParaEnviar(
  doc: ProposalDoc,
  totalBruto: number,
  ctx: ContextoDoEnvio = {},
): Impedimento[] {
  const faltas: Impedimento[] = [];
  // A MESMA contagem do índice lateral. Ver `oQueTemODocumento`: eram duas, e
  // discordavam sobre o mesmo documento.
  const { deco, grupos, boards, capas } = oQueTemODocumento(doc);

  if (!temTexto(doc.clientNames)) {
    faltas.push({
      id: "nome",
      seccao: "evento",
      campo: "clientNames",
      texto: "Falta o nome dos clientes",
      trava: true,
    });
  }
  if (!temTexto(doc.ref)) {
    // Aparece no topo de todas as páginas do PDF. Gera-se sozinho a partir do
    // resto, por isso estar vazio quer dizer que o resto também está.
    faltas.push({
      id: "titulo-interno",
      seccao: "evento",
      campo: "ref",
      texto: "Falta o título interno",
      trava: true,
    });
  }
  if (totalBruto <= 0) {
    // Uma proposta a €0 seria enviada e poluiria os indicadores (total
    // enviado, taxa de aceitação) com um negócio vazio.
    faltas.push({
      id: "valor",
      seccao: "total",
      campo: "totalAmount",
      texto: "Falta o valor",
      trava: true,
    });
  }

  if (!temTexto(doc.eventDate)) {
    faltas.push({
      id: "data",
      seccao: "evento",
      campo: "eventDate",
      texto: "Sem data do evento",
      trava: false,
    });
  }
  if (!temTexto(doc.location)) {
    faltas.push({
      id: "local",
      seccao: "evento",
      campo: "location",
      texto: "Sem local",
      trava: false,
    });
  }
  if (grupos.length === 0) {
    /**
     * ── A LINHA QUE DEIXOU SAIR UMA PROPOSTA VAZIA ────────────────────────
     *
     * Isto esteve escrito como conselho (`trava: false`) e uma proposta foi
     * enviada com a secção de Serviços em branco. O índice lateral dizia
     * «Serviços · por preencher» — estava certo, e era a única coisa no ecrã a
     * dizer a verdade —, e o botão verde ao lado deixou passar na mesma.
     *
     * O critério dela é o que manda aqui: se o cliente receber algo que parece
     * um erro, bloqueia. Uma proposta de decoração sem nenhum serviço listado é
     * exactamente isso.
     */
    faltas.push({
      id: "servicos",
      seccao: "servicos",
      texto: "A secção Serviços está vazia",
      trava: true,
    });
  }

  /**
   * Uma PÁGINA de inspiração sem fotografias.
   *
   * Diferente de «sem mood boards», que é uma escolha legítima: isto é uma
   * página com título, que conta para a contagem, que ocupa uma folha do PDF —
   * e que sai em branco. Quem a criou queria lá pôr fotos.
   */
  const boardsVazios = (doc.moodBoards ?? []).filter(
    (b) => temTexto(b.title) && (b.images ?? []).length === 0,
  );
  if (boardsVazios.length > 0) {
    const quais = boardsVazios
      .map((b) => `«${b.title.trim()}»`)
      .slice(0, 2)
      .join(" e ");
    faltas.push({
      id: "moodboard-vazio",
      seccao: "moodboards",
      texto:
        boardsVazios.length === 1
          ? `A página ${quais} não tem fotografias`
          : `${boardsVazios.length} páginas de inspiração sem fotografias (${quais}…)`,
      trava: true,
    });
  }

  /**
   * Um `{{marcador}}` que chegou ao texto final.
   *
   * É rede e não caça: o email já tem três camadas a impedir isto (ver
   * `frase-que-nao-parte.test.ts`, que gera o email com cada variável vazia).
   * O que esta linha guarda é o outro lado — o que ela escreve À MÃO nos campos
   * do documento. Um `{{nome}}` copiado de um modelo para dentro de um título
   * vai para o PDF tal e qual, e o PDF não tem camada nenhuma.
   */
  const comChavetas = camposDoDocumento(doc)
    .filter(({ campo }) => TEM_CHAVETAS.test(lerCampo(doc, campo) ?? ""))
    .map(({ rotulo }) => rotulo);
  if (comChavetas.length > 0) {
    faltas.push({
      id: "chavetas",
      seccao: comChavetas.length === 1 ? "evento" : "evento",
      texto:
        comChavetas.length === 1
          ? `${comChavetas[0]} tem um marcador por resolver`
          : `${comChavetas.length} campos com marcadores por resolver`,
      trava: true,
    });
  }

  /**
   * Inglês escolhido, e traduções em falta.
   *
   * A regra de o que conta como traduzido não é escrita aqui — vive no
   * `proposal-doc-bilingue`, que também sabe distinguir «por traduzir» de
   * «traduzido e depois o português mudou». Uma segunda contagem discordaria
   * dela ao primeiro caso difícil.
   */
  if (ctx.idioma === "en") {
    const porTraduzir = camposPorTraduzir(doc);
    if (porTraduzir.length > 0) {
      faltas.push({
        id: "ingles",
        seccao: "envio",
        texto:
          porTraduzir.length === 1
            ? `${porTraduzir[0].rotulo} está por traduzir`
            : `${porTraduzir.length} campos por traduzir`,
        trava: true,
      });
    }
  }

  /**
   * Fotografias escritas no documento que não resolvem para um endereço.
   *
   * Sai um PDF com um buraco onde devia estar uma foto — e é a falha que menos
   * se nota a montar, porque no ecrã a página parece ter as fotos todas.
   */
  if (ctx.imagensQueFaltam && ctx.imagensQueFaltam.length > 0) {
    const n = ctx.imagensQueFaltam.length;
    faltas.push({
      id: "imagens",
      seccao: "moodboards",
      texto: n === 1 ? "Uma fotografia não carrega" : `${n} fotografias não carregam`,
      trava: true,
    });
  }
  if (deco && capas.length === 0) {
    faltas.push({ id: "capas", seccao: "capas", texto: "Sem imagens de capa", trava: false });
  }
  if (deco && boards.length === 0) {
    faltas.push({ id: "moodboards", seccao: "moodboards", texto: "Sem mood boards", trava: false });
  }
  // O aviso do orçamento vive na secção do total, que é onde ela o resolve.
  //
  // ── PORQUE É QUE ISTO CHAMA `desalinhamento` E NÃO SUBTRAI À MÃO ─────────
  // Subtraía. Comparava `somaDosItens(doc)` — que é LÍQUIDA, porque os preços
  // por linha são sem IVA — com o `doc.totalAmount` cru, que só é a base em
  // modo "acrescer"; em "incluído" é o BRUTO. Numa proposta certa de 10.000 €
  // de base com o IVA lá dentro (12.300 € guardados), a conta dava 2.300 € de
  // diferença e este painel dizia «O total não bate com a soma das linhas» —
  // em TODAS as propostas com IVA incluído, desde o primeiro segundo. Pior:
  // ao lado das linhas, onde a mesma pergunta é feita com a BASE, não havia
  // aviso nenhum. Os dois ecrãs discordavam sobre o mesmo número.
  //
  // Agora é a mesma função, com a mesma base, nos dois sítios — que é a razão
  // pela qual este módulo existe.
  if (desalinhamento(doc, dinheiroDaProposta(doc).base) !== null) {
    faltas.push({
      id: "soma",
      seccao: "total",
      campo: "totalAmount",
      texto: "O total não bate com a soma das linhas",
      trava: false,
    });
  }

  return faltas;
}

/** Pode enviar? A MESMA fonte que a lista acima, para não poderem discordar. */
export function podeEnviar(
  doc: ProposalDoc,
  totalBruto: number,
  ctx: ContextoDoEnvio = {},
): boolean {
  return !oQueFaltaParaEnviar(doc, totalBruto, ctx).some((f) => f.trava);
}
