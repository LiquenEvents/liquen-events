import { eurDocumento as eur } from "@/lib/money";
import {
  depositPercentOf,
  preencherMarcadores,
  type ProposalDoc,
  type MoodBoard,
} from "@/lib/proposal-doc";
import { docNaLingua } from "@/lib/proposal-doc-bilingue";
import {
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
import Inspiracao, { type BoardParaEcra } from "./Inspiracao";
import { textosDaPagina } from "./textos-da-pagina";

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
 * ── O DINHEIRO FICA EM pt-PT NAS DUAS LÍNGUAS ─────────────────────────────
 *
 * A decisão é a mesma da página que envolve isto, e a razão está escrita lá
 * por extenso: metade dos montantes de uma proposta é TEXTO LIVRE escrito por
 * ela, à portuguesa (`totalText`, `budgetExtras[].valueText`), e formatar os
 * NOSSOS à inglesa punha «€24,600.00» ao lado de «24.600,00 €» na mesma
 * secção — onde a vírgula e o ponto trocam de papel e «24.600» se lê como
 * vinte e quatro euros e sessenta. As DATAS continuam localizadas.
 *
 * FICA DITO, porque foi medido ao escrever isto e contradiz o que a `page.tsx`
 * afirma: o PDF **não** faz assim. O gerador passa cada montante por
 * `montanteNaLingua` (ver `proposal-doc-pdf.ts`), portanto uma proposta inglesa
 * sai do PDF com «€24,600.00» e desta página com «24.600,00 €». Uma das duas
 * está errada e a decisão é dela, não minha — não se muda nem um lado nem o
 * outro sem ela dizer qual.
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

export default function Documento({
  doc: docOriginal,
  idioma,
  fotos,
  token,
}: {
  doc: ProposalDoc;
  idioma: IdiomaDaProposta;
  /** As fotografias já assinadas no servidor — ver `proposta-fotos.ts`. */
  fotos: FotoDaProposta[];
  token: string;
}) {
  /**
   * A prosa dela na língua do documento, num sítio só.
   *
   * `docNaLingua` nunca acrescenta, nunca remove e nunca reordena — só troca
   * strings no sítio. É esse invariante que torna legítimo calcular a ORDEM
   * sobre este documento e usar os índices para ir buscar as fotografias, que
   * são indexadas pela posição no documento ORIGINAL.
   */
  const doc = docNaLingua(docOriginal, idioma);
  const t = textosDaProposta(idioma);
  const p = textosDaPagina(idioma);
  const org = doc.template === "organizacao";
  const evento = camposDoEventoNaLingua(doc, idioma);
  const fixos = blocosFixosNaLingua(doc, idioma);
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
  const indice = [
    (doc.serviceGroups ?? []).length > 0 && { href: "#servicos", texto: t.tituloServicos },
    boards.length > 0 && { href: "#inspiracao", texto: p.inspiracao },
    (rubricas.length > 0 || totais.aPagar > 0) && {
      href: "#orcamento",
      texto: t.tituloOrcamento,
    },
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

      {/* ── ORÇAMENTO ────────────────────────────────────────────────────── */}
      <Seccao>
        <Titulo id="orcamento" sobretitulo={t.sobretituloOrcamento} titulo={t.tituloOrcamento} />

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
                    <span className="text-foreground/70 text-sm tabular-nums">{e.valueText}</span>
                  </div>
                ))}
              </>
            )}
            <div className="border-foreground/15 mt-3 border-t pt-3">
              <div className="flex items-baseline justify-between gap-4 py-1">
                <span className="text-foreground/80 text-sm font-medium">{t.totalSemIva}</span>
                <span className="text-foreground/80 text-sm tabular-nums">{eur(totais.total)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1">
                <span className="text-foreground/70 text-sm">{t.iva(taxa)}</span>
                <span className="text-foreground/70 text-sm tabular-nums">{eur(totais.iva)}</span>
              </div>
              <div className="border-foreground/15 mt-3 flex items-baseline justify-between gap-4 border-t pt-4">
                <span className="text-foreground/75 text-sm font-medium">{t.totalAPagar}</span>
                <span
                  className="text-moss tabular-nums"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(22px, 3.2vw, 30px)",
                  }}
                >
                  {eur(totais.aPagar)}
                </span>
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
                {comIvaDito(totalEscrito)}
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
          <div className="mt-10">
            <h3 className="text-foreground/80 text-[13px] tracking-[0.16em] uppercase">
              {t.notasImportantes}
            </h3>
            <Lista itens={fixos.notasImportantes} />
          </div>
        )}
        {(fixos.incluido ?? []).length > 0 && (
          <div className="mt-8">
            <h3 className="text-foreground/80 text-[13px] tracking-[0.16em] uppercase">
              {t.incluidoNaProposta}
            </h3>
            <Lista itens={fixos.incluido} />
          </div>
        )}
        {(fixos.naoIncluido ?? []).length > 0 && (
          <div className="mt-8">
            <h3 className="text-foreground/80 text-[13px] tracking-[0.16em] uppercase">
              {t.naoIncluidoNoOrcamento}
            </h3>
            <Lista itens={fixos.naoIncluido} />
          </div>
        )}
      </Seccao>

      {/* ── CONDIÇÕES GERAIS ─────────────────────────────────────────────── */}
      {(fixos.condicoesGerais ?? []).length > 0 && (
        <Seccao>
          <Titulo id="condicoes" sobretitulo={t.sobretituloCondicoes} titulo={t.tituloCondicoes} />
          {/* Os marcadores («a data do evento», «o número de convidados») são
              preenchidos com a MESMA função do gerador — senão o casal lia aqui
              um «{{data}}» que o PDF dele não tem. */}
          <Lista itens={(fixos.condicoesGerais ?? []).map((l) => preencherMarcadores(l, doc))} />
        </Seccao>
      )}

      {(fixos.observacoesGerais ?? []).length > 0 && (
        <Seccao>
          <Titulo titulo={t.observacoesGerais} />
          <Lista itens={(fixos.observacoesGerais ?? []).map((l) => preencherMarcadores(l, doc))} />
        </Seccao>
      )}

      {(fixos.faseamento ?? []).length > 0 && (
        <Seccao>
          <Titulo titulo={t.faseamentoDoPagamento} />
          <Lista itens={fixos.faseamento} />
          {totais.aPagar > 0 && (
            <p className="text-foreground/60 mt-4 text-[13px] leading-relaxed">
              {t.baseDoCalculo(eur(totais.aPagar))}
            </p>
          )}
        </Seccao>
      )}

      {(fixos.cancelamento ?? []).length > 0 && (
        <Seccao>
          <Titulo titulo={t.cancelamento} />
          <Lista itens={fixos.cancelamento} />
        </Seccao>
      )}
    </article>
  );
}
