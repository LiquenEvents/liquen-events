import { eurDocumento, milharesComPonto, montanteNaLingua } from "@/lib/money";
import {
  depositPercentOf,
  preencherMarcadores,
  type ProposalDoc,
  type MoodBoard,
} from "@/lib/proposal-doc";
import { docNaLingua } from "@/lib/proposal-doc-bilingue";
import {
  blocoEDaCasa,
  blocosFixosNaLingua,
  camposDoEventoNaLingua,
  rotuloDoTotalNaLingua,
  textosDaProposta,
  type CampoDoEvento,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { totaisDaProposta } from "@/lib/proposal-budget";
import { ordemDeSaida, aplicarOrdem } from "@/lib/proposal-ordem";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import {
  descricaoNaLingua,
  escolhasParaOCasal,
  notaNaLingua,
  rotuloNaLingua,
  tituloNaLingua,
} from "@/lib/proposta-escolhas";
import Inspiracao, { type BoardParaEcra } from "./Inspiracao";
import Escolhas from "./Escolhas";
import { textosDaPagina, fase, type SeccaoDobravel } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO DA PROPOSTA, DESENHADO PARA UM ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui o documento existia numa forma só — o PDF. A página do casal
 * mostrava um total, um IVA e um botão para o descarregar. Isto é o documento
 * inteiro em HTML: a apresentação, os serviços, os mood boards, o orçamento e
 * as condições.
 *
 * ── O QUE SE PARTILHA COM O PDF, E O QUE NÃO ──────────────────────────────
 *
 * Partilha-se o MODELO (`ProposalDoc`), os textos da moldura
 * (`proposal-doc-textos`), a projecção para inglês da prosa dela
 * (`docNaLingua`), o dinheiro (`proposal-budget`, `money`) e a ORDEM
 * (`ordemDeSaida` — a mesma função que o estúdio e o gerador chamam, e é ela
 * que faz o que ela arruma no editor sair arrumado nos dois sítios).
 *
 * NÃO se partilha uma única linha de geometria. O gerador tem dezenas de
 * ficheiros de teste a prender medidas em pontos de PDF; uma página que
 * partilhasse funções de layout com ele parti-lo-ia mais cedo ou mais tarde, e
 * o PDF é o documento que já foi enviado, discutido ao telefone e talvez
 * impresso. Aqui não há pontos, não há folhas, não há quebras de página.
 *
 * ── A ORDEM DAS SECÇÕES EM ECRÃ ───────────────────────────────────────────
 *
 * A MESMA do documento — apresentação, serviços, inspiração, orçamento,
 * condições, fecho. Foi uma decisão, e a alternativa tinha bom argumento:
 * subir os mood boards para o topo, por serem a razão do projecto e por o que
 * fica em terceiro lugar ser o que se rola por cima num telemóvel.
 *
 * Não se fez, por duas razões. A ordem do documento é DELA — há um campo
 * inteiro (`ordemExplicita`) e um módulo (`proposal-ordem.ts`) só para a
 * respeitar, e reordenar as secções por nossa conta desfazia isso na única
 * superfície onde o casal a lê. E a queixa dela não era a posição das
 * fotografias, era o TAMANHO delas: «46 fotos comprimidas em páginas A4 ficam
 * pequenas». O que resolve a distância até elas é um índice no topo — que se
 * salta com um toque e não mexe no documento — e é isso que está feito.
 *
 * ── O DINHEIRO SEGUE A LÍNGUA DO DOCUMENTO ────────────────────────────────
 *
 * Decisão dela, 20-08-2026, e é a que resolve um desacordo real: «se é em pt o
 * dinheiro tem que estar em português, mas se é em eng o dinheiro tem que
 * estar em inglês».
 *
 * O desacordo era este, e foi medido: o gerador do PDF passa cada montante por
 * `montanteNaLingua` (`proposal-doc-pdf.ts:858`), portanto uma proposta inglesa
 * saía do PDF com «€24,600.00» e desta página com «24.600,00 €» — o mesmo
 * número escrito de duas maneiras nos dois documentos que o casal recebe ao
 * mesmo tempo. A `page.tsx` justificava-se dizendo que «o PDF já escreve assim
 * em qualquer idioma»; não escreve, e era essa a raiz do engano.
 *
 * A conversão é feita PELO MESMO CAMINHO do PDF: escreve-se à portuguesa e
 * converte-se no fim. Não é um `Intl` com outra localização, e a diferença não
 * é de estilo — metade dos montantes é TEXTO LIVRE escrito por ela à
 * portuguesa (`totalText`, `budgetExtras[].valueText`), e entre as duas formas
 * a vírgula e o ponto TROCAM DE PAPEL: «24.600» lido à inglesa são vinte e
 * quatro euros e sessenta. Um formatador à parte punha os nossos números em
 * inglês e os dela em português na mesma folha; a conversão partilhada trata
 * os dois da mesma maneira.
 *
 * As DATAS já eram localizadas e continuam.
 */

/** Um bloco de texto corrido — as notas, as condições, as observações. */
function Lista({ itens }: { itens?: readonly string[] }) {
  const linhas = (itens ?? []).map((l) => l?.trim()).filter(Boolean);
  if (linhas.length === 0) return null;
  return (
    <ul className="mt-4 space-y-2.5">
      {linhas.map((l, i) => (
        <li key={i} className="text-foreground/75 relative pl-5 text-[15px] leading-relaxed">
          <span aria-hidden className="text-moss/60 absolute top-0 left-0">
            ·
          </span>
          {l}
        </li>
      ))}
    </ul>
  );
}

/** O cabeçalho de uma secção: o sobretítulo pequeno e o título em serifada. */
function Titulo({
  id,
  sobretitulo,
  titulo,
}: {
  id?: string;
  sobretitulo?: string | null;
  titulo: string;
}) {
  return (
    <header id={id} className="scroll-mt-6">
      {sobretitulo && (
        <p className="text-foreground/60 mb-2 text-[10px] tracking-[0.4em] uppercase">
          {sobretitulo}
        </p>
      )}
      <h2
        className="text-foreground/90 text-balance"
        style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4.2vw, 40px)" }}
      >
        {titulo}
      </h2>
    </header>
  );
}

/**
 * Uma secção do documento, com o ar que a separa da anterior.
 *
 * `larga` para a Inspiração e mais nada: a prosa fica presa a uma medida de
 * leitura (~65 caracteres — passar disso é o que faz o olho perder a linha ao
 * voltar à esquerda), e as fotografias ficam com a largura toda, que é o que
 * esta página existe para lhes dar.
 */
function Seccao({ children, larga = false }: { children: React.ReactNode; larga?: boolean }) {
  return <section className={`mt-16 sm:mt-24 ${larga ? "" : "max-w-2xl"}`}>{children}</section>;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA SECÇÃO DE CONDIÇÕES, DOBRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As condições, as observações, o faseamento e o cancelamento somam mais de
 * duas dezenas de cláusulas. Abertas, empurram para baixo tudo aquilo por que
 * a proposta se vende: um casal que rola até ao fim atravessa páginas de letra
 * miúda antes de chegar seja ao que for. Não é que não devam lá estar; é que
 * não devem ser o corpo do documento.
 *
 * ── FECHADA NÃO É ESCONDIDA ───────────────────────────────────────────────
 *
 * O título continua à vista, e por baixo dele uma linha que diz o que lá está
 * dentro. É essa linha que faz a diferença entre uma secção dobrada e uma
 * secção omitida: sem ela, «Condições Gerais» tanto pode ser uma cláusula como
 * catorze, e quem não sabe o que está a abrir não abre.
 *
 * E o PDF continua a trazer tudo, por extenso, sem dobra nenhuma. A folha é
 * que é o documento; isto é o ecrã.
 *
 * ── PORQUE É QUE É UM `details` E NÃO UM BOTÃO NOSSO ─────────────────────
 *
 * Porque funciona sem uma linha de JavaScript, numa página que é desenhada no
 * servidor; porque o leitor de ecrã já sabe anunciá-lo como «expansível, por
 * abrir»; e porque a procura na página (o Cmd+F do casal) ABRE sozinha um
 * `details` fechado onde encontre o que procura. Um botão nosso perdia as três
 * e não ganhava nada.
 *
 * ── E NÃO SE REGISTA QUEM ABRIU O QUÊ ────────────────────────────────────
 *
 * Não há aqui pedido nenhum, nem ao abrir nem ao fechar. Saber que secções um
 * casal abriu e quais deixou fechadas é exactamente o rasto de leitura que
 * esta página não recolhe, por decisão dela.
 */
function SeccaoDobrada({
  id,
  sobretitulo,
  titulo,
  resumo,
  children,
}: {
  id?: string;
  sobretitulo?: string | null;
  titulo: string;
  resumo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 max-w-2xl sm:mt-24">
      <details className="group">
        {/*
         * `list-none` e o marcador do WebKit escondido: o triângulo do
         * navegador entra ANTES do sobretítulo e desalinha um cabeçalho que é
         * desenhado com muito cuidado. A seta abaixo faz o mesmo trabalho no
         * sítio certo.
         *
         * `min-h-11` só ao toque, e NÃO a classe `.alvo-toque`: ela força
         * `inline-flex` com o conteúdo ao centro, e num `summary` isso centrava
         * um cabeçalho alinhado à esquerda.
         */}
        <summary
          className="marker:content-none pointer-coarse:min-h-11 relative cursor-pointer list-none scroll-mt-6 pl-6 [&::-webkit-details-marker]:hidden"
          id={id}
        >
          {/* A seta fora do fluxo: o cabeçalho mantém o alinhamento que tem
              nas secções que não dobram, e o `h2` continua a ser um `h2` —
              filho directo do `summary`, e não embrulhado num `span`, que
              seria HTML inválido e um nível a menos no índice da página. */}
          <span
            aria-hidden
            className="text-moss/70 absolute top-[0.35em] left-0 text-[13px] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
          >
            ▸
          </span>
          {sobretitulo && (
            <span className="text-foreground/60 mb-2 block text-[10px] tracking-[0.4em] uppercase">
              {sobretitulo}
            </span>
          )}
          <h2
            className="text-foreground/90 text-balance"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 3.4vw, 32px)" }}
          >
            {titulo}
          </h2>
          {/*
           * O resumo desaparece com a secção aberta: com o texto todo à vista
           * por baixo, uma linha a dizer do que ele trata passa a ser ruído
           * entre o título e a primeira cláusula.
           */}
          <span className="text-foreground/55 mt-1 block text-[13px] leading-relaxed group-open:hidden">
            {resumo}
          </span>
        </summary>
        {children}
      </details>
    </section>
  );
}

export default function Documento({
  doc: docOriginal,
  idioma,
  fotos,
  token,
  escolhido = {},
}: {
  doc: ProposalDoc;
  idioma: IdiomaDaProposta;
  /** As fotografias já assinadas no servidor — ver `proposta-fotos.ts`. */
  fotos: FotoDaProposta[];
  token: string;
  /**
   * O que o casal já escolheu, por escolha. Vem do PEDIDO e não da proposta —
   * a razão está em `proposta-escolhas.ts`. Ausente por omissão: uma proposta
   * sem alternativas nunca chega a olhar para isto.
   */
  escolhido?: Record<string, string>;
}) {
  /**
   * A prosa dela na língua do documento, num sítio só.
   *
   * `docNaLingua` nunca acrescenta, nunca remove e nunca reordena — só troca
   * strings no sítio. É esse invariante que torna legítimo calcular a ORDEM
   * sobre este documento e usar os índices para ir buscar as fotografias, que
   * são indexadas pela posição no documento ORIGINAL.
   */
  /**
   * O DINHEIRO SEGUE A LÍNGUA DO DOCUMENTO — decisão dela, 20-08-2026:
   * «se é em pt o dinheiro tem que estar em português, mas se é em eng o
   * dinheiro tem que estar em inglês».
   *
   * É o MESMO caminho que o PDF já usa (`proposal-doc-pdf.ts:858`): escreve-se
   * primeiro à portuguesa e converte-se no fim com o `montanteNaLingua`. Não é
   * um `Intl` com outra localização, e a diferença não é de estilo — metade
   * dos valores de uma proposta é texto livre escrito por ela à portuguesa, e
   * a vírgula e o ponto TROCAM DE PAPEL entre as duas formas: «24.600» lido à
   * inglesa são vinte e quatro euros e sessenta. Passar tudo pela mesma
   * conversão do PDF é o que garante que os dois documentos dizem o mesmo
   * número — que era precisamente o que estava a falhar aqui.
   */
  const eur = (valor: number) => montanteNaLingua(eurDocumento(valor), idioma);
  /**
   * ── O DINHEIRO QUE ELA ESCREVEU À MÃO ────────────────────────────────────
   *
   * O cabeçalho deste ficheiro já dizia que «metade dos montantes é TEXTO
   * LIVRE escrito por ela à portuguesa» e que a conversão os trata da mesma
   * maneira. Dizia — e não tratava: o `valueText` dos valores adicionais, o
   * `preco` das linhas estimadas e o total escrito saíam CRUS.
   *
   * MEDIDO, mesma linha, mesmo documento:
   *
   *            PDF                 esta página
   *   pt    + 1.550,00 €           1550,00 €
   *   en    + €1,550.00            1550,00 € + IVA
   *
   * Na folha inglesa a coluna ficava «€10,950.00 · 1550,00 € + IVA ·
   * €12,500.00» — e «1550,00» lido à inglesa é um euro e cinquenta e cinco.
   * Factor mil, na linha que ela acrescentou para cobrar a deslocação.
   *
   * O caminho é o MESMO do PDF (`proposal-doc-pdf.ts:858`): agrupa-se à
   * portuguesa e converte-se no fim. Um texto que já venha agrupado passa
   * incólume — o `milharesComPonto` só acrescenta o separador a quem não o tem.
   */
  const dinheiroEscrito = (texto: string | undefined) =>
    montanteNaLingua(milharesComPonto(texto ?? ""), idioma);

  const doc = docNaLingua(docOriginal, idioma);
  const t = textosDaProposta(idioma);
  const p = textosDaPagina(idioma);
  const org = doc.template === "organizacao";
  const evento = camposDoEventoNaLingua(doc, idioma);
  const fixos = blocosFixosNaLingua(doc, idioma);

  /**
   * A linha que se lê por baixo do título de uma secção dobrada.
   *
   * Os resumos foram escritos a olhar para o texto DA CASA, cláusula a
   * cláusula. Onde ela o reescreveu, o resumo deixaria de descrever o que lá
   * está — e uma frase errada por cima de uma secção fechada é a pior das
   * mentiras, porque ninguém a vai lá dentro desmentir. Nesse caso conta-se o
   * que há: menos útil, sempre verdade.
   *
   * A pergunta é feita ao `docOriginal`, que é o documento como ela o gravou.
   * O `doc` já passou pela língua, e o texto da casa compara-se em português.
   */
  const resumoDe = (campo: SeccaoDobravel, linhas: readonly string[]) =>
    blocoEDaCasa(docOriginal, campo)
      ? p.resumos[campo]
      : linhas.length === 1
        ? p.umPonto
        : p.pontos.replace("{n}", String(linhas.length));
  const porId = new Map(fotos.map((f) => [f.id, f]));
  /** A primeira fotografia de capa que resolveu — as posições vazias contam
   *  para o índice e não para o desenho (ver `normaliseCoverImages`). */
  const capa = (doc.coverImages ?? [])
    .map((_, i) => porId.get(`c${i}`))
    .find((f) => f?.miniatura || f?.original);

  // ── A APRESENTAÇÃO ────────────────────────────────────────────────────────
  // Os mesmos campos, pela mesma ordem, com a mesma regra do papel: um rótulo
  // seguido de nada não é «um campo por preencher», é um erro impresso numa
  // folha que vai para o cliente.
  const campos: [CampoDoEvento, string][] = [
    [org ? "cliente" : "noivos", doc.clientNames],
    ...(org ? [] : ([["evento", evento.eventType ?? ""]] as [CampoDoEvento, string][])),
    ["data", evento.eventDate ?? ""],
    ["local", doc.location ?? ""],
    ["convidados", evento.guests ?? ""],
    ["servico", doc.servico ?? ""],
    ...(org
      ? []
      : ([
          ["cerimonia", evento.ceremony ?? ""],
          ["hora", evento.time ?? ""],
        ] as [CampoDoEvento, string][])),
  ];
  const apresentacao = campos.filter(([, v]) => (v ?? "").trim().length > 0);

  // ── OS MOOD BOARDS ────────────────────────────────────────────────────────
  // A ordem é a do documento (`ordemDeSaida`, a mesma do estúdio e do gerador).
  // Os IDs das fotografias saem da posição ORIGINAL, e por isso a permutação
  // aplica-se aos índices e não às fotos.
  const indicesDosBoards = ordemDeSaida(doc, doc.moodBoards ?? [], (b) => b.title ?? "");
  const boards: BoardParaEcra[] = indicesDosBoards
    .map((b): [number, MoodBoard] => [b, (doc.moodBoards ?? [])[b]])
    .filter(([, board]) => board && (board.images ?? []).length > 0)
    .map(([b, board]: [number, MoodBoard]) => {
      // Só as fotografias que o servidor conseguiu resolver: uma célula sem
      // nenhum endereço é um buraco, e um buraco numa proposta lê-se como
      // descuido. As que faltarem ficam registadas do lado do servidor.
      const ids = (board.images ?? [])
        .map((_, i) => `b${b}f${i}`)
        .filter((id) => porId.get(id)?.miniatura || porId.get(id)?.original);
      return {
        chave: board.id ?? `board-${b}`,
        titulo: board.title ?? "",
        ...(board.subtitulo?.trim() ? { subtitulo: board.subtitulo.trim() } : {}),
        ...(board.annotation?.trim() ? { nota: board.annotation.trim() } : {}),
        fotos: ids,
        // A marca é uma posição no array ORIGINAL; depois de filtrar as que não
        // resolveram, a posição pode já não ser a mesma. Reencontra-se pelo id,
        // que é o que não muda.
        ...(typeof board.principal === "number" && ids.indexOf(`b${b}f${board.principal}`) >= 0
          ? { principal: ids.indexOf(`b${b}f${board.principal}`) }
          : {}),
      };
    })
    .filter((b) => b.fotos.length > 0);

  // ── AS ALTERNATIVAS ───────────────────────────────────────────────────────
  //
  // A projecção de língua do documento (`docNaLingua`) não chega aqui: as
  // caixas inglesas destas vivem DENTRO de duas listas encaixadas, e o
  // `docNaLingua` só troca campos de topo. A tradução faz-se aqui, com os
  // ajudantes do `proposta-escolhas`, e o componente do cliente recebe texto
  // já resolvido — não a regra.
  const escolhas = escolhasParaOCasal(doc.escolhas);
  const escolhasEmLingua = {
    titulo: Object.fromEntries(escolhas.map((e) => [e.id, tituloNaLingua(e, idioma)])),
    nota: Object.fromEntries(escolhas.map((e) => [e.id, notaNaLingua(e, idioma)])),
    rotulo: Object.fromEntries(
      escolhas.flatMap((e) => e.opcoes.map((o) => [o.id, rotuloNaLingua(o, idioma)])),
    ),
    descricao: Object.fromEntries(
      escolhas.flatMap((e) => e.opcoes.map((o) => [o.id, descricaoNaLingua(o, idioma)])),
    ),
  };
  /**
   * As fotografias das opções, pelo id opaco `e{i}o{j}`.
   *
   * Os índices são os do documento ORIGINAL (é assim que o inventário os
   * escreve), e por isso constrói-se a partir de `doc.escolhas` e não da lista
   * já filtrada — uma escolha por acabar no meio da lista deslocava todos os
   * ids seguintes e cada opção ficava com a fotografia da vizinha.
   */
  const fotosDasEscolhas: Record<string, FotoDaProposta> = {};
  (doc.escolhas ?? []).forEach((e, i) => {
    const posicao = escolhas.findIndex((x) => x.id === e.id);
    if (posicao < 0) return;
    e.opcoes.forEach((o, j) => {
      const foto = porId.get(`e${i}o${j}`);
      const jVisivel = escolhas[posicao].opcoes.findIndex((x) => x.id === o.id);
      if (foto && jVisivel >= 0) fotosDasEscolhas[`e${posicao}o${jVisivel}`] = foto;
    });
  });

  // ── O ORÇAMENTO ───────────────────────────────────────────────────────────
  const totais = totaisDaProposta(doc, depositPercentOf(doc));
  const indicesDasLinhas = ordemDeSaida(doc, doc.budgetItems ?? [], (s) => s);
  const rubricas = aplicarOrdem(doc.budgetItems ?? [], indicesDasLinhas)
    .map((item, i) => ({
      item: (item ?? "").trim(),
      // `budgetOpcional` é um ARRAY PARALELO: a marca tem de viajar com a linha
      // que ela marca, e é por isso que se lê pelo índice ORIGINAL.
      extra: !!(doc.budgetOpcional ?? [])[indicesDasLinhas[i]],
    }))
    .filter((r) => r.item);
  /**
   * As LINHAS ESTIMADAS do modelo Organização — rubrica e preço escrito por ela.
   *
   * O modelo de Decoração lista rubricas sem preço (a coluna é interna e na
   * maioria das propostas nem existe); o de Organização escreve um preço por
   * linha. São dois quadros diferentes e o documento só tem um deles.
   *
   * `[Valor]` é o marcador que o estúdio semeia numa linha por orçamentar e
   * NÃO pode chegar ao ecrã. Fica em branco, que é como uma linha sem preço
   * sai há anos — e não um traço, que numa coluna de dinheiro tanto se lê como
   * «zero» como «por definir». A regra é a mesma que o gerador aplica
   * (`semMarcador`, em `proposal-doc-pdf.ts`); está aqui reescrita porque é
   * uma linha e o gerador não a exporta, e mexer nele não é opção.
   */
  const semMarcador = (v: string) => (/^\[[^\]]*\]$/.test(v.trim()) ? "" : v.trim());
  const linhasEstimadas = (doc.budgetRows ?? [])
    .map((r) => ({ item: (r.item ?? "").trim(), preco: semMarcador(r.price ?? "") }))
    .filter((r) => r.item);

  const extras = (doc.budgetExtras ?? []).filter(
    (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
  );
  const quantosExtras = rubricas.filter((r) => r.extra).length;
  const taxa = `${Math.round(totais.taxa * 100)}%`;
  /**
   * O total como o estúdio o escreveu, quando não há euros que se consigam
   * somar (uma proposta a meio, ou um total escrito «a definir»).
   *
   * Vazio quer dizer que não há nada a dizer, e então NÃO SE DIZ: aqui esteve
   * um travessão de reserva («—»), que numa folha de vinte mil euros é um
   * rótulo de total seguido de um traço. Um rótulo sem número não informa
   * ninguém e assusta toda a gente.
   */
  const totalEscrito = ((org ? doc.totalEstimatedText : doc.totalText) ?? "").trim();
  /** O «+ IVA» que TEM de aparecer quando o total escrito não o diz. */
  const comIvaDito = (texto: string) =>
    totais.modo === "acrescer" && !/\+\s*(iva|vat)/i.test(texto) ? `${texto} ${t.maisIva}` : texto;

  /**
   * ── UM CABEÇALHO DE ORÇAMENTO COM NADA POR BAIXO ─────────────────────────
   *
   * É o mesmo defeito que a página já tinha corrigido no quadro de linhas, e
   * que o comentário de lá descreve: «o noivo que abre a página para decidir
   * gastar milhares de euros via o cabeçalho, NADA por baixo». Um documento a
   * meio — uma proposta antiga guardada sem orçamento nenhum — desenhava aqui
   * «O investimento / Orçamento Proposto» e ar. A secção só existe quando tem
   * mesmo alguma coisa para dizer.
   */
  const temOrcamento =
    rubricas.length > 0 ||
    linhasEstimadas.length > 0 ||
    totais.aPagar > 0 ||
    totalEscrito !== "" ||
    (doc.budgetNote ?? "").trim() !== "" ||
    (fixos.notasImportantes ?? []).length > 0 ||
    (fixos.incluido ?? []).length > 0 ||
    (fixos.naoIncluido ?? []).length > 0;

  // ── O ÍNDICE ──────────────────────────────────────────────────────────────
  // Não é navegação: são saltos DENTRO desta página. É o que responde ao «as
  // fotografias ficam em terceiro lugar» sem reordenar o documento dela.
  /**
   * O nome da secção das fotografias.
   *
   * `t.sobretituloInspiracao` é `null` em português de propósito: no PDF a
   * palavra vive em `proposal-geometria`, ao lado da medida a que é desenhada.
   * NÃO se lê de lá — este ficheiro não importa uma linha de geometria, é a
   * regra da casa —, cai-se para a palavra desta página, que é a mesma.
   */
  const tituloDaInspiracao = t.sobretituloInspiracao ?? p.inspiracao;
  /**
   * O faseamento é o da casa, e portanto a linha curta ao lado do total pode
   * citar as percentagens dele? Ver o comentário no sítio onde ela é escrita.
   */
  /**
   * Os momentos por que o casal passou, pela ordem em que os viu.
   *
   * Os grupos de serviços primeiro (são eles que dizem o que se faz), e os
   * mood boards a seguir para os momentos que só existem em fotografia. Sem
   * repetir: um board chamado «Cerimónia» ao lado de um grupo «Cerimónia» é a
   * mesma palavra duas vezes numa linha de quatro.
   */
  const momentos = [
    ...(doc.serviceGroups ?? []).map((g) => (g.title ?? "").trim()),
    ...boards.map((b) => b.titulo.trim()),
  ].filter((nome, i, todos) => !!nome && todos.indexOf(nome) === i);

  const sinalPct = depositPercentOf(doc);
  const faseamentoDaCasa = blocoEDaCasa(docOriginal, "faseamento");

  const indice = [
    (doc.serviceGroups ?? []).length > 0 && { href: "#servicos", texto: t.tituloServicos },
    boards.length > 0 && { href: "#inspiracao", texto: p.inspiracao },
    temOrcamento && { href: "#orcamento", texto: t.tituloOrcamento },
    (fixos.condicoesGerais ?? []).length > 0 && {
      href: "#condicoes",
      texto: t.tituloCondicoes,
    },
  ].filter((x): x is { href: string; texto: string } => !!x);

  return (
    <article className="w-full">
      {/* ── A CAPA ────────────────────────────────────────────────────────
          No papel a capa é uma folha inteira com uma ou duas fotografias. Aqui
          é uma faixa larga por cima da apresentação: dá o mesmo — a primeira
          coisa que o casal vê é o trabalho dela — sem gastar um ecrã inteiro
          num telemóvel antes de se chegar a uma palavra. Só quando há mesmo
          fotografia de capa resolvida. */}
      {capa && (
        <div className="mb-12 overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capa.miniatura ?? capa.original}
            {...(capa.miniatura
              ? {
                  /**
                   * ── A MAIOR IMAGEM DA PÁGINA NÃO PODE SER A DE 400 PX ────
                   *
                   * A capa desenha-se com a largura toda do documento — até
                   * 1024 px numa janela larga, e num iPhone ~390 pontos com
                   * três pixéis cada, ~1170. A miniatura tem 400. Era a mesma
                   * conta da galeria, no sítio onde ela se vê mais: a primeira
                   * coisa que o casal olha ao abrir a proposta.
                   *
                   * A derivada intermédia (1200 px) vem da mesma rota da
                   * galeria — ver `api/proposta/[token]/foto/[id]`. O `src`
                   * fica com a miniatura por ser o que um navegador sem
                   * `srcset` usa.
                   */
                  srcSet: `${capa.miniatura} 400w, /api/proposta/${encodeURIComponent(token)}/foto/${encodeURIComponent(capa.id)} 1200w`,
                  /* A capa ocupa a largura da página, com o tecto de 1024 px
                     do `max-w-5xl`. Sem isto o navegador assume `100vw` e num
                     ecrã grande pede a maior sem precisar. */
                  sizes: "(min-width: 1024px) 1024px, 100vw",
                }
              : {})}
            alt=""
            /* A capa é a primeira coisa à vista: entra ansiosa, com prioridade
               de busca, porque é ela o elemento de maior pintura da página. */
            fetchPriority="high"
            decoding="async"
            className="w-full object-cover"
            style={{
              // 21:9 no telemóvel seria uma nesga; 3:2 numa janela larga seria
              // meia página antes de uma palavra. A forma real da fotografia,
              // quando se sabe, com um tecto de altura para o ecrã largo.
              aspectRatio:
                capa.largura && capa.altura ? `${capa.largura} / ${capa.altura}` : "3 / 2",
              maxHeight: "min(56vh, 520px)",
            }}
          />
        </div>
      )}

      {/* ── APRESENTAÇÃO ─────────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <Titulo
          sobretitulo={t.sobretituloApresentacao}
          titulo={doc.headerTitle || t.tituloApresentacao}
        />
        {apresentacao.length > 0 && (
          <dl className="mt-7 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            {apresentacao.map(([chave, valor]) => (
              <div key={chave} className="border-foreground/8 border-t pt-3">
                <dt className="text-foreground/60 text-[10px] tracking-[0.24em] uppercase">
                  {t.campos[chave]}
                </dt>
                <dd className="text-foreground/85 mt-1 text-[15px] leading-relaxed">{valor}</dd>
              </div>
            ))}
          </dl>
        )}

        {indice.length > 1 && (
          <nav aria-label={p.nestaPagina} className="mt-10">
            <p className="text-foreground/55 text-[10px] tracking-[0.3em] uppercase">
              {p.nestaPagina}
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {indice.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="alvo-toque text-moss inline-flex items-center text-sm hover:underline"
                  >
                    {l.texto}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* ── SERVIÇOS ─────────────────────────────────────────────────────── */}
      {(doc.serviceGroups ?? []).length > 0 && (
        <Seccao>
          <Titulo id="servicos" sobretitulo={t.sobretituloServicos} titulo={t.tituloServicos} />
          <div className="mt-8 space-y-9">
            {(doc.serviceGroups ?? []).map((g, i) => (
              <div key={g.id ?? i}>
                <h3 className="text-foreground/85 flex items-baseline gap-3 text-[17px] font-medium">
                  {g.letter && (
                    <span className="text-moss/70 text-xs tracking-[0.2em]">{g.letter}</span>
                  )}
                  {g.title}
                </h3>
                {(g.items ?? []).length > 0 && (
                  <ul className="mt-3 space-y-2.5">
                    {(g.items ?? []).map((it, j) => (
                      <li key={it.id ?? j} className="border-foreground/8 border-t pt-2.5">
                        <span className="text-foreground/85 text-[15px]">{it.label}</span>
                        {it.desc?.trim() && (
                          <span className="text-foreground/65 block text-sm leading-relaxed">
                            {it.desc}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Seccao>
      )}

      {/* ── CRONOGRAMA (modelo Organização) ──────────────────────────────── */}
      {(doc.cronograma ?? []).length > 0 && (
        <Seccao>
          <Titulo sobretitulo={t.sobretituloCronograma} titulo={t.tituloCronograma} />
          <div className="mt-8 space-y-8">
            {(doc.cronograma ?? []).map((fase, i) => (
              <div key={i}>
                <h3 className="text-foreground/85 text-[17px] font-medium">{fase.title}</h3>
                <Lista itens={fase.items} />
              </div>
            ))}
          </div>
        </Seccao>
      )}

      {/* ── INSPIRAÇÃO — a razão desta página existir ─────────────────────── */}
      {boards.length > 0 && (
        <Seccao larga>
          <Titulo id="inspiracao" titulo={tituloDaInspiracao} />
          <div className="mt-8">
            <Inspiracao
              boards={boards}
              fotosIniciais={Object.fromEntries(porId)}
              token={token}
              textos={p}
            />
          </div>
        </Seccao>
      )}

      {/* ── À VOSSA ESCOLHA ───────────────────────────────────────────────
          «Onde eu tiver dado alternativas ao casal (duas paletas para a
          cerimónia, dois estilos de corredor), eles escolhem ali.»

          A SEGUIR às fotografias e ANTES do dinheiro, e é de propósito: uma
          alternativa entre duas paletas lê-se com os mood boards ainda na
          cabeça, e pedir para escolher depois de mostrar o total transforma
          uma preferência numa negociação.

          Nada disto sai no PDF — ver `NUNCA_NO_PDF`. */}
      {escolhas.length > 0 && (
        <Seccao larga>
          <Titulo id="escolhas" titulo={p.escolhas} />
          <p className="mt-4 max-w-2xl text-foreground/70 text-sm leading-relaxed">
            {p.escolhasIntro}
          </p>
          <Escolhas
            escolhas={escolhas}
            escolhido={escolhido}
            fotos={fotosDasEscolhas}
            token={token}
            textos={p}
            emLingua={escolhasEmLingua}
          />
        </Seccao>
      )}

      {/* ── ORÇAMENTO ────────────────────────────────────────────────────── */}
      {temOrcamento && (
        <Seccao>
          <Titulo id="orcamento" sobretitulo={p.sobretituloOrcamento} titulo={t.tituloOrcamento} />

          {rubricas.length > 0 && (
            <ul className="mt-8">
              {rubricas.map((r, i) => (
                <li
                  key={i}
                  className="border-foreground/8 flex items-baseline justify-between gap-4 border-b py-3"
                >
                  <span className="text-foreground/85 text-[15px]">{r.item}</span>
                  {r.extra && (
                    <span className="text-foreground/55 shrink-0 text-[11px] tracking-[0.14em] uppercase">
                      {t.marcaExtra}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* ── O QUADRO ESTIMADO (modelo Organização) ──────────────────────
            Rubrica à esquerda, o preço que ela escreveu à direita. Uma linha
            ainda por orçamentar fica com a coluna em branco. */}
          {linhasEstimadas.length > 0 && (
            <ul className="mt-8">
              {linhasEstimadas.map((r, i) => (
                <li
                  key={i}
                  className="border-foreground/8 flex items-baseline justify-between gap-4 border-b py-3"
                >
                  <span className="text-foreground/85 text-[15px]">{r.item}</span>
                  <span className="text-foreground/75 shrink-0 text-sm tabular-nums">
                    {dinheiroEscrito(r.preco)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {quantosExtras > 0 && (
            <p className="text-foreground/60 mt-3 text-[13px] leading-relaxed">
              {quantosExtras === 1 ? t.umaLinhaExtra : t.variasLinhasExtra(quantosExtras)}
            </p>
          )}

          {/* ── A ESCADA DOS TOTAIS ───────────────────────────────────────────
            Os seis números saem de `totaisDaProposta`, de uma vez: aqui não se
            faz uma única conta. Foi assim que o gerador deixou de poder
            imprimir parcelas em unidades diferentes, e é a mesma razão. */}
          {totais.aPagar > 0 ? (
            <div className="mt-8">
              {extras.length > 0 && (
                <>
                  <div className="flex items-baseline justify-between gap-4 py-1.5">
                    <span className="text-foreground/80 text-sm font-medium">
                      {org ? t.subtotalServicosEstimado : t.subtotalServicos}
                    </span>
                    <span className="text-foreground/80 text-sm tabular-nums">
                      {eur(totais.servicos)}
                    </span>
                  </div>
                  {extras.map((e, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-4 py-1.5">
                      <span className="text-foreground/70 text-sm">{e.label}</span>
                      <span className="text-foreground/70 text-sm tabular-nums">
                        {dinheiroEscrito(e.valueText)}
                      </span>
                    </div>
                  ))}
                </>
              )}
              <div className="border-foreground/15 mt-3 border-t pt-3">
                <div className="flex items-baseline justify-between gap-4 py-1">
                  <span className="text-foreground/80 text-sm font-medium">{t.totalSemIva}</span>
                  <span className="text-foreground/80 text-sm tabular-nums">
                    {eur(totais.total)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-1">
                  <span className="text-foreground/70 text-sm">{t.iva(taxa)}</span>
                  <span className="text-foreground/70 text-sm tabular-nums">{eur(totais.iva)}</span>
                </div>
                {/*
                 * ════════════════════════════════════════════════════════
                 * O NÚMERO MAIS IMPORTANTE DA PÁGINA, DESENHADO COMO TAL
                 * ════════════════════════════════════════════════════════
                 *
                 * Estava na mesma escada dos subtotais, com o rótulo do mesmo
                 * tamanho dos outros e o número quatro pontos acima: quem
                 * percorre a coluna de números com o polegar não distingue o
                 * que paga do que somou para lá chegar.
                 *
                 * Sai da escada e passa a ser um bloco. O rótulo em cima, o
                 * número em baixo e grande — e não os dois na mesma linha,
                 * porque num telemóvel um rótulo e um número de quarenta
                 * pontos lado a lado ou encolhem o número ou partem a linha.
                 */}
                <div className="border-foreground/15 mt-5 border-t pt-5">
                  <p className="text-foreground/60 text-[11px] tracking-[0.22em] uppercase">
                    {t.totalAPagar}
                  </p>
                  <p
                    className="text-moss mt-1.5 tabular-nums"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(34px, 6vw, 52px)",
                      lineHeight: 1.05,
                    }}
                  >
                    {eur(totais.aPagar)}
                  </p>
                  {/*
                   * ── E O QUE SE PAGA AGORA, AQUI E NÃO TRÊS SECÇÕES ABAIXO
                   *
                   * A pergunta que um casal faz a seguir a ver um total é
                   * sempre a mesma. O faseamento continua lá em baixo por
                   * extenso, com as suas condições; isto é a resposta curta no
                   * sítio onde ela é feita.
                   *
                   * Só quando o faseamento é o DA CASA. Se ela o reescreveu,
                   * os 30/70 desta linha podiam já não ser os de lá — e duas
                   * percentagens diferentes na mesma proposta são a única
                   * coisa pior do que a pergunta sem resposta.
                   */}
                  {faseamentoDaCasa && (
                    <p className="text-foreground/70 mt-3 text-[13px] leading-relaxed">
                      <span className="text-foreground/85 font-medium">
                        {fase(p.agora, sinalPct, eur(totais.aPagar * (sinalPct / 100)))}
                      </span>
                      {" · "}
                      {fase(p.depois, 100 - sinalPct)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Sem euros que se consigam somar — uma proposta a meio, ou um total
             escrito «a definir» — imprime-se o que o estúdio escreveu, com o
             «+ IVA» garantido. Não se inventa uma escada de zeros. */
            totalEscrito && (
              <div className="border-foreground/15 mt-8 flex items-baseline justify-between gap-4 border-t pt-4">
                <span className="text-foreground/75 text-sm font-medium">
                  {rotuloDoTotalNaLingua(doc, idioma)}
                </span>
                <span
                  className="text-moss"
                  style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 3vw, 28px)" }}
                >
                  {comIvaDito(dinheiroEscrito(totalEscrito))}
                </span>
              </div>
            )
          )}

          {doc.budgetNote?.trim() && (
            <p className="text-foreground/65 mt-6 text-[13px] leading-relaxed">
              {t.nota(doc.budgetNote.trim())}
            </p>
          )}

          {(fixos.notasImportantes ?? []).length > 0 && (
            <details className="group mt-10">
              <summary className="marker:content-none pointer-coarse:min-h-11 relative cursor-pointer list-none pl-5 [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="text-moss/70 absolute top-[0.2em] left-0 text-[11px] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
                >
                  ▸
                </span>
                <h3 className="text-foreground/80 text-[13px] tracking-[0.16em] uppercase">
                  {t.notasImportantes}
                </h3>
                <span className="text-foreground/55 mt-1 block text-[13px] leading-relaxed group-open:hidden">
                  {resumoDe("notasImportantes", fixos.notasImportantes ?? [])}
                </span>
              </summary>
              <Lista itens={fixos.notasImportantes} />
            </details>
          )}
          {/*
           * ════════════════════════════════════════════════════════════════
           * O INCLUÍDO DEIXA DE FLUTUAR
           * ════════════════════════════════════════════════════════════════
           *
           * «Serviço de decoração, material e flores conforme descrito» é uma
           * frase abstracta a seguir a quarenta fotografias de coisas
           * concretas. O casal acabou de percorrer a Cerimónia, o Cocktail e o
           * Jantar, e a lista não os nomeia: não se percebe que o «conforme
           * descrito» é exactamente aquilo.
           *
           * Passa a abrir com os nomes das secções por que eles passaram,
           * tirados do documento e não escritos à mão — se ela acrescentar um
           * momento, ele aparece aqui sem ninguém se lembrar de o vir cá pôr.
           *
           * ── E AS DUAS LISTAS LADO A LADO ──────────────────────────────
           * Uma debaixo da outra, «não incluído» lia-se como a continuação de
           * «incluído»: a mesma marca, o mesmo tamanho, e um título pequeno a
           * separá-las. Em duas colunas vê-se de relance que são duas contas
           * diferentes. Numa coluna só (telemóvel) voltam a empilhar-se, e aí
           * a distância entre elas é que faz o trabalho.
           */}
          {((fixos.incluido ?? []).length > 0 || (fixos.naoIncluido ?? []).length > 0) && (
            <div className="mt-10">
              {(fixos.incluido ?? []).length > 0 && momentos.length > 0 && (
                <p className="text-foreground/65 mb-6 text-[14px] leading-relaxed">
                  <span className="text-foreground/80">{p.oQueViram}</span> {momentos.join(" · ")}
                </p>
              )}
              <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
                {(fixos.incluido ?? []).length > 0 && (
                  <div>
                    <h3 className="text-foreground/80 text-[13px] tracking-[0.16em] uppercase">
                      {t.incluidoNaProposta}
                    </h3>
                    <Lista itens={fixos.incluido} />
                  </div>
                )}
                {(fixos.naoIncluido ?? []).length > 0 && (
                  <div>
                    <h3 className="text-foreground/80 text-[13px] tracking-[0.16em] uppercase">
                      {t.naoIncluidoNoOrcamento}
                    </h3>
                    <Lista itens={fixos.naoIncluido} />
                  </div>
                )}
              </div>
            </div>
          )}
        </Seccao>
      )}

      {/* ── CONDIÇÕES GERAIS ─────────────────────────────────────────────── */}
      {(fixos.condicoesGerais ?? []).length > 0 && (
        <SeccaoDobrada
          id="condicoes"
          sobretitulo={p.sobretituloCondicoes}
          titulo={t.tituloCondicoes}
          resumo={resumoDe("condicoesGerais", fixos.condicoesGerais ?? [])}
        >
          {/* Os marcadores («a data do evento», «o número de convidados») são
              preenchidos com a MESMA função do gerador — senão o casal lia aqui
              um «{{data}}» que o PDF dele não tem. */}
          <Lista itens={(fixos.condicoesGerais ?? []).map((l) => preencherMarcadores(l, doc))} />
        </SeccaoDobrada>
      )}

      {(fixos.observacoesGerais ?? []).length > 0 && (
        <SeccaoDobrada
          titulo={t.observacoesGerais}
          resumo={resumoDe("observacoesGerais", fixos.observacoesGerais ?? [])}
        >
          <Lista itens={(fixos.observacoesGerais ?? []).map((l) => preencherMarcadores(l, doc))} />
        </SeccaoDobrada>
      )}

      {(fixos.faseamento ?? []).length > 0 && (
        <SeccaoDobrada
          titulo={t.faseamentoDoPagamento}
          resumo={resumoDe("faseamento", fixos.faseamento ?? [])}
        >
          <Lista itens={fixos.faseamento} />
          {totais.aPagar > 0 && (
            <p className="text-foreground/60 mt-4 text-[13px] leading-relaxed">
              {t.baseDoCalculo(eur(totais.aPagar))}
            </p>
          )}
        </SeccaoDobrada>
      )}

      {(fixos.cancelamento ?? []).length > 0 && (
        <SeccaoDobrada
          titulo={t.cancelamento}
          resumo={resumoDe("cancelamento", fixos.cancelamento ?? [])}
        >
          <Lista itens={fixos.cancelamento} />
        </SeccaoDobrada>
      )}
    </article>
  );
}
