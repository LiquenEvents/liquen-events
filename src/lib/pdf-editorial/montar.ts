import "server-only";
import { PDFDocument, type PDFImage } from "pdf-lib";
import { depositPercentOf, resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { docNaLingua } from "@/lib/proposal-doc-bilingue";
import type { DocTruncation } from "@/lib/proposal-doc-pdf";
import {
  blocosFixosNaLingua,
  camposDoEventoNaLingua,
  IDIOMA_POR_OMISSAO,
  rotuloDoTotalNaLingua,
  textosDaProposta,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { chaveDeRubrica, ordemDeSaida } from "@/lib/proposal-ordem";
import { ordemDasFotos } from "@/lib/proposal-moodboard";
import { eurDocumento, milharesComPonto, montanteNaLingua, round2 } from "@/lib/money";
import {
  normalizarValor,
  ressalvaDoValor,
  somaDosExtrasSemIva,
  totaisDaProposta,
} from "@/lib/proposal-budget";
import { opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import { SITE } from "@/lib/site";
import { aoMeio, paginarColunasFixas, paginarCorrido, repartir, type Peca } from "./colunas";
import { bytesDaFoto, embedImagem } from "./embutir";
import { Album, medir, type Foto } from "./fotos";
import { agrupar, grupoDoTema } from "./grupos";
import { logotipoNaCor } from "./imagens";
import type { Contexto } from "./moldura";
import { repartir as repartirFotos } from "./mosaico";
import { HEX } from "./paleta";
import { paletaDasFotos } from "./paleta-das-fotos";
import { capa, contracapa } from "./paginas/capa";
import {
  alturaDasColunas,
  comoTitulo,
  larguraDaColuna,
  paginaDeColunas,
} from "./paginas/condicoes";
import { citacao, separador } from "./paginas/fotografia";
import { orcamento, repartirLinhas, total, type LinhaDoOrcamento } from "./paginas/orcamento";
import { ambiente, CARTOES_POR_PAGINA, servicos, type Servico } from "./paginas/servicos";
import { tema } from "./paginas/tema";
import { apresentacao, indice, type EntradaDoIndice } from "./paginas/texto";
import { primeirosNomes, textosEditoriais } from "./textos";
import { embutirLetras } from "./texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PDF EDITORIAL — a proposta no desenho do exemplo «Mafalda & João»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só muda o ASPECTO e a paginação. Os dados, as contas, os textos legais, os
 * contactos e o logótipo são os mesmos do gerador antigo e vêm das mesmas
 * funções (`textosDaProposta`, `blocosFixosNaLingua`, `totaisDaProposta`,
 * `camposDoEventoNaLingua`, `docNaLingua`, `resolveValidUntil`, `SITE`). O
 * gerador antigo (`proposal-doc-pdf.ts`) não é tocado e continua a ser o do
 * envio até ela aprovar este.
 *
 * A sequência é a do exemplo novo (26 páginas):
 *
 *   capa · índice · a proposta · o que propomos · paleta e ambiente
 *   · por cada capítulo de inspiração: separador + as páginas dos temas
 *     (a citação a meio dos capítulos)
 *   · investimento: separador + quadro + total            (se houver orçamento)
 *   · condições: notas · condições gerais · pagamento      (SEMPRE)
 *   · contracapa
 *
 * Recebe o documento com as fotografias JÁ RESOLVIDAS (base64), como o
 * `renderProposalDocPdfWithReport`.
 */
export async function renderEditorialPdf(
  original: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<{ bytes: Uint8Array; truncations: DocTruncation[]; undrawnImages: number }> {
  const doc = docNaLingua(original, idioma);
  const t = textosDaProposta(idioma);
  const te = textosEditoriais(idioma);
  const evento = camposDoEventoNaLingua(doc, idioma);
  const fixos = blocosFixosNaLingua(doc, idioma);
  const org = doc.template === "organizacao";
  const totais = totaisDaProposta(doc, depositPercentOf(doc));
  /** O dinheiro na língua do documento — a mesma conversão do gerador antigo. */
  const dinheiro = (texto: string) => montanteNaLingua(milharesComPonto(texto), idioma);
  const eurDoc = (n: number) => dinheiro(eurDocumento(n));

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${te.rodapeModelo(org)} · ${doc.clientNames}`);
  pdf.setAuthor(SITE.name);
  const ctx: Contexto = {
    pdf,
    letras: await embutirLetras(pdf),
    idioma,
    t,
    te,
    rodape: [te.rodapeModelo(org), doc.clientNames, evento.eventDate]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" · "),
    logo: await logotipo(pdf),
    cortes: [],
    naoDesenhadas: new Set(),
    embutidas: new Map(),
  };

  // ── As fotografias, medidas ──────────────────────────────────────────────
  let proximoId = 0;
  const medida = (dado: string | undefined, origem: string, tema: number | null) => {
    const bytes = bytesDaFoto(dado);
    return bytes ? medir(bytes, origem, proximoId++, tema) : Promise.resolve(null);
  };
  const capaFotos = (
    await Promise.all(
      (doc.coverImages ?? []).slice(0, 2).map((d, i) => medida(d, `Capa · foto ${i + 1}`, null)),
    )
  ).filter((f): f is Foto => f !== null);

  // Os temas pela ordem do documento (a mesma do gerador antigo), e as fotos
  // de cada um pela ordem dela, com a «principal» à frente.
  const ordem = ordemDeSaida(original, original.moodBoards, (b) => b.title ?? "");
  const temas = await Promise.all(
    ordem.map(async (i, vez) => {
      const pt = original.moodBoards[i];
      const naLingua = doc.moodBoards[i] ?? pt;
      const fotos = (
        await Promise.all(
          ordemDasFotos(pt).map((k) =>
            medida(pt.images?.[k], `Tema «${pt.title}» · foto ${k + 1}`, vez),
          ),
        )
      ).filter((f): f is Foto => f !== null);
      return {
        pt,
        titulo: (naLingua.title ?? "").trim(),
        subtitulo: (naLingua.subtitulo ?? "").trim(),
        nota: (naLingua.annotation ?? "").trim(),
        fotos,
      };
    }),
  );
  // Um tema sem fotografias E sem texto não tem nada para mostrar; um tema só
  // com texto tem a sua página de texto, como o documento dela pede.
  const comConteudo = temas.filter((x) => x.fotos.length || x.titulo || x.subtitulo || x.nota);
  const inspiracao = comConteudo.flatMap((x) => x.fotos);
  const album = new Album(inspiracao);

  // ── O plano: cada página sabe o seu número antes de se desenhar ─────────
  // É o que deixa o índice dizer a página VERDADEIRA de cada secção, e o
  // álbum não repetir uma fotografia em duas páginas seguidas.
  type Passo = {
    entrada?: string;
    desenhar: (numero: number, entradas: readonly EntradaDoIndice[]) => Promise<unknown>;
  };
  const plano: Passo[] = [];
  const proxima = () => plano.length + 1;
  /** O número de uma secção no índice (01, 02…), pela página onde começa. */
  const numeroNoIndice = (entradas: readonly EntradaDoIndice[], pagina: number) =>
    String(entradas.findIndex((e) => e.pagina === pagina) + 1).padStart(2, "0");

  // ── Capa ──
  // O fundo é a fotografia de maior resolução que serve para a página: a
  // primeira de capa se tiver pixéis para isso; senão, a melhor deitada da
  // inspiração; senão, a segunda de capa. Não há painel: ela pediu a capa só
  // com a fotografia de fundo.
  const RESOLUCAO_DE_FUNDO = 1600;
  const [capa1, capa2] = capaFotos;
  const capa1Serve =
    capa1 && Math.max(capa1.w, capa1.h) >= RESOLUCAO_DE_FUNDO && capa1.aspecto >= 1;
  const fundoDaCapa = capa1Serve
    ? capa1
    : (album.escolher(1, "deitada")[0] ?? capa1 ?? capa2 ?? null);
  plano.push({
    desenhar: () =>
      capa(ctx, {
        sobretitulo: org ? t.capaOrganizacao : t.capaDecoracao,
        nomes: doc.clientNames,
        faixa: [
          { rotulo: te.factos.evento, valor: evento.eventType ?? "" },
          { rotulo: te.factos.data, valor: evento.eventDate ?? "" },
          { rotulo: te.factos.local, valor: doc.location ?? "" },
        ],
        fundo: fundoDaCapa,
      }),
  });

  // ── Índice ──
  {
    const foto = album.escolher(proxima(), "alta")[0] ?? fundoDaCapa;
    plano.push({
      desenhar: (numero, entradas) =>
        indice(ctx, { sobretitulo: te.indice, titulo: te.tituloIndice, entradas, foto, numero }),
    });
  }

  // ── A proposta ──
  {
    const foto = album.escolher(proxima(), "deitada")[0] ?? fundoDaCapa;
    const factos = [
      { rotulo: org ? te.factos.cliente : te.factos.noivos, valor: doc.clientNames },
      ...(org ? [] : [{ rotulo: te.factos.evento, valor: evento.eventType ?? "" }]),
      { rotulo: te.factos.data, valor: evento.eventDate ?? "" },
      { rotulo: te.factos.local, valor: doc.location ?? "" },
      { rotulo: te.factos.convidados, valor: evento.guests ?? "" },
      { rotulo: te.factos.servico, valor: doc.servico ?? "" },
      ...(org
        ? []
        : [
            { rotulo: te.factos.cerimonia, valor: evento.ceremony ?? "" },
            { rotulo: te.factos.hora, valor: evento.time ?? "" },
          ]),
    ].filter((f) => f.valor.trim());
    plano.push({
      entrada: te.aProposta,
      desenhar: (numero) =>
        apresentacao(ctx, {
          sobretitulo: t.sobretituloApresentacao,
          titulo: te.tituloDaProposta(primeirosNomes(doc.clientNames, idioma), org),
          factos,
          foto,
          numero,
        }),
    });
  }

  // ── O que propomos ──
  {
    const lista = servicosDoDocumento(original, doc);
    if (lista.length) {
      const grupos = (doc.serviceGroups ?? []).filter((g) => (g.title ?? "").trim());
      const titulo = te.tituloServicos(
        lista.length,
        grupos.length === 1 ? grupos[0].title.trim().toLocaleLowerCase("pt-PT") : null,
      );
      for (let i = 0; i < lista.length; i += CARTOES_POR_PAGINA) {
        const pagina = proxima();
        const desta: Servico[] = lista.slice(i, i + CARTOES_POR_PAGINA).map((s) => {
          const casado = temaDoServico(s.chave, comConteudo);
          const foto = casado?.fotos[0] ?? album.escolher(pagina, "deitada")[0] ?? null;
          if (foto) album.usar(foto, pagina);
          return { nome: s.nome, descricao: s.descricao, foto };
        });
        plano.push({
          desenhar: (numero) =>
            servicos(ctx, {
              sobretitulo: t.sobretituloServicos,
              titulo: i ? `${titulo} ${te.continuacao}` : titulo,
              servicos: desta,
              primeiro: i + 1,
              pagina: numero,
            }),
        });
      }
    }
  }

  // ── Paleta e ambiente ──
  if (inspiracao.length) {
    const pagina = proxima();
    const cores = await paletaDasFotos(inspiracao.slice(0, 40).map((f) => f.bytes));
    // A fila: a primeira fotografia de cada tema, e depois as outras.
    const primeiras = comConteudo.map((x) => x.fotos[0]).filter((f): f is Foto => Boolean(f));
    const fila = [...new Set([...primeiras, ...inspiracao])].slice(0, 6);
    const painel =
      album.escolher(pagina, "alta", 1, inspiracao, new Set(fila.map((f) => f.id)))[0] ?? null;
    plano.push({
      desenhar: (numero) => ambiente(ctx, { cores, fotos: fila, painel, pagina: numero }),
    });
  }

  // ── Cronograma (modelo Organização) ──
  if (org) {
    const pecas: Peca[] = (doc.cronograma ?? [])
      .filter((f) => (f.title ?? "").trim() || f.items?.some((i) => i.trim()))
      .flatMap((f) => [
        { tipo: "h3" as const, texto: f.title.trim() },
        ...f.items.filter((i) => i.trim()).map((i) => ({ tipo: "item" as const, texto: i })),
      ]);
    if (pecas.length) {
      paginasDeColunasCorridas(
        t.sobretituloCronograma,
        t.tituloCronograma,
        pecas,
        t.tituloCronograma,
      );
    }
  }

  // ── Os capítulos de inspiração ──
  const capitulos = agrupar(comConteudo, (x) =>
    grupoDoTema(x.pt.title ?? "", x.pt.subtitulo ?? ""),
  );
  const meio = Math.ceil(capitulos.length / 2);
  let vezDoTema = 0;
  capitulos.forEach((c, ci) => {
    const nome = te.grupos[c.grupo];
    const doCapitulo = c.itens.flatMap((x) => x.fotos);
    // O separador: as DUAS fotografias de maior resolução do capítulo — é a
    // regra do documento dela, e a forma não entra na escolha —, de
    // preferência fora do primeiro tema, que vem logo a seguir.
    const paginaDoSeparador = proxima();
    const evitar = new Set(c.itens.length > 1 ? c.itens[0].fotos.map((f) => f.id) : []);
    const fotosDoSeparador = album.escolher(paginaDoSeparador, "qualquer", 2, doCapitulo, evitar);
    plano.push({
      entrada: `${te.inspiracao} · ${nome}`,
      desenhar: (numero, entradas) =>
        separador(ctx, {
          sobretitulo: `${numeroNoIndice(entradas, numero)} · ${te.inspiracao}`,
          titulo: nome,
          fotos: fotosDoSeparador,
        }),
    });

    for (const x of c.itens) {
      vezDoTema++;
      const numero = vezDoTema;
      const porPagina = x.fotos.length ? repartirFotos(x.fotos.length) : [0];
      let feitas = 0;
      porPagina.forEach((quantas, k) => {
        const fotos = x.fotos.slice(feitas, feitas + quantas);
        feitas += quantas;
        const pagina = proxima();
        for (const f of fotos) album.usar(f, pagina);
        // Um tema sem fotografias leva um painel de outro tema do capítulo
        // (ou, não havendo, de qualquer tema) — nenhuma página é só texto.
        const painel = fotos.length
          ? null
          : (album.escolher(pagina, "alta", 1, doCapitulo.length ? doCapitulo : inspiracao)[0] ??
            null);
        plano.push({
          desenhar: (n) =>
            tema(ctx, {
              numero,
              grupo: nome,
              titulo: x.titulo,
              subtitulo: k ? te.maisIdeias : x.subtitulo,
              nota: k ? "" : x.nota,
              fotos,
              pagina: n,
              painel,
            }),
        });
      });
    }

    // A citação, a meio da inspiração: a fotografia horizontal de maior
    // resolução da proposta (que não esteja numa página vizinha).
    if (ci + 1 === meio) {
      const foto = album.escolher(proxima(), "deitada")[0];
      if (foto) {
        plano.push({
          desenhar: () =>
            citacao(ctx, {
              frase: t.slogan ?? SITE.slogan,
              aspas: idioma === "en" ? ["“", "”"] : ["«", "»"],
              assinatura: SITE.name,
              foto,
            }),
        });
      }
    }
  });

  // ── Investimento ──
  {
    const semMarcador = (v: string) => (/^\[[^\]]*\]$/.test(v.trim()) ? "" : v);
    const totalStr = semMarcador(org ? (doc.totalEstimatedText ?? "") : (doc.totalText ?? ""));
    const linhas: LinhaDoOrcamento[] = org
      ? (doc.budgetRows ?? [])
          .filter((r) => (r.item ?? "").trim())
          .map((r) => {
            const preco = semMarcador((r.price ?? "").trim()).trim();
            return { nome: r.item, preco: preco ? dinheiro(preco) : undefined };
          })
      : (() => {
          const marcas = opcionaisDe(doc);
          return ordemDeSaida(original, original.budgetItems, (s) => s)
            .filter((i) => (doc.budgetItems[i] ?? "").trim())
            .map((i) => ({
              nome: doc.budgetItems[i],
              marca: marcas[i] ? t.marcaExtra : undefined,
            }));
        })();
    const temOrcamento = linhas.length > 0 || totais.aPagar > 0 || Boolean(totalStr.trim());
    if (temOrcamento) {
      const paginaDoSeparador = proxima();
      const fotosDoSeparador = album.escolher(paginaDoSeparador, "qualquer", 2);
      plano.push({
        entrada: te.investimento,
        desenhar: (numero, entradas) =>
          separador(ctx, {
            sobretitulo: numeroNoIndice(entradas, numero),
            titulo: te.investimento,
            fotos: fotosDoSeparador,
          }),
      });

      let primeiro = 1;
      for (const [k, desta] of repartirLinhas(ctx, linhas).entries()) {
        if (!desta.length) continue;
        const painel = album.escolher(proxima(), "alta")[0] ?? null;
        const n0 = primeiro;
        primeiro += desta.length;
        plano.push({
          desenhar: (numero) =>
            orcamento(ctx, {
              titulo: k ? `${te.tituloOrcamento} ${te.continuacao}` : te.tituloOrcamento,
              subtitulo: k ? "" : te.quantosServicos(linhas.length),
              linhas: desta,
              primeiro: n0,
              painel,
              pagina: numero,
            }),
        });
      }

      const fotoDoTotal = album.escolher(proxima(), "deitada")[0] ?? null;
      plano.push({
        desenhar: (numero) => total(ctx, { ...dadosDoTotal(), foto: fotoDoTotal, pagina: numero }),
      });

      // O total e a escada que o explica — os mesmos rótulos e números do
      // gerador antigo (ver o bloco «Orçamento» de `proposal-doc-pdf.ts`).
      function dadosDoTotal() {
        const pct = totais.percentagemSinal;
        const extras = (doc.budgetExtras ?? []).filter(
          (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
        );
        const comIvaDito = (texto: string) =>
          totais.modo === "acrescer" && !/\+\s*(iva|vat)/i.test(texto)
            ? `${texto} ${t.maisIva}`
            : texto;
        const notas: string[] = [];
        const versoes = totaisDasVersoes(doc);
        if (versoes && versoes.comoOTotal.base > 0 && versoes.extras > 0) {
          const maisIva = totais.modo === "acrescer" ? ` ${t.maisIva}` : "";
          notas.push(`${t.semOsExtras}: ${eurDoc(versoes.comoOTotal.base)}${maisIva}`);
          notas.push(
            versoes.linhasExtra === 1 ? t.umaLinhaExtra : t.variasLinhasExtra(versoes.linhasExtra),
          );
        }
        if (doc.budgetNote?.trim()) notas.push(t.nota(doc.budgetNote));

        if (totais.aPagar <= 0) {
          return {
            rotulo: org ? t.totalEstimado : rotuloDoTotalNaLingua(doc, idioma),
            valor: comIvaDito(dinheiro(totalStr) || "—"),
            linhas: [],
            marcos: [],
            rodapeDoTotal: notas,
          };
        }
        const escada: { rotulo: string; valor: string; forte?: boolean }[] = [];
        if (extras.length) {
          escada.push({
            rotulo: org ? t.subtotalServicosEstimado : t.subtotalServicos,
            valor: eurDoc(totais.servicos),
          });
          for (const ex of extras) {
            const cru = normalizarValor(ex.valueText);
            const base = somaDosExtrasSemIva([ex], { mode: totais.modo, vatRate: totais.taxa });
            const escritoDela = (ex.valueText ?? "").trim();
            const mostraTudo = cru === null || round2(cru) !== base;
            const aoLado = mostraTudo ? dinheiro(escritoDela) : ressalvaDoValor(escritoDela);
            escada.push({
              rotulo: aoLado ? `${ex.label} (${aoLado})` : ex.label,
              valor: cru === null ? "—" : `+ ${eurDoc(base)}`,
            });
          }
        }
        escada.push({ rotulo: emFrase(t.totalSemIva), valor: eurDoc(totais.total), forte: true });
        escada.push({ rotulo: t.iva(percentagemDoIva(totais.taxa)), valor: eurDoc(totais.iva) });
        return {
          rotulo: t.totalAPagar,
          valor: eurDoc(totais.aPagar),
          nota: te.comIvaIncluido,
          linhas: escada,
          marcos: [
            { valor: eurDoc(totais.sinal), texto: `${t.sinal(pct)} · ${t.quandoSinal}` },
            { valor: eurDoc(totais.saldo), texto: `${t.saldo(100 - pct)} · ${t.quandoSaldo}` },
          ],
          rodapeDoTotal: notas,
        };
      }
    }
  }

  // ── Condições — SEMPRE, com ou sem orçamento ──
  {
    const lista = (titulo: string, itens: readonly string[]): Peca[] =>
      itens.length
        ? [
            { tipo: "h3", texto: comoTitulo(titulo) },
            ...itens.map((texto) => ({ tipo: "item" as const, texto })),
          ]
        : [];
    const validade = t.data(resolveValidUntil(doc));

    // 1. Notas, condições de reserva e próximos passos — três colunas.
    const notas = [
      [
        ...lista(t.notasImportantes, fixos.notasImportantes),
        ...lista(t.proximosPassos, [t.passoAceitar, t.passoSinal, t.passoValidade(validade)]),
      ],
      [
        ...lista(t.incluidoNaProposta, fixos.incluido),
        ...lista(t.naoIncluidoNoOrcamento, fixos.naoIncluido),
      ],
      lista(t.observacoesGerais, fixos.observacoesGerais),
    ].filter((c) => c.length);
    paginasDeColunasFixas(te.condicoes, te.tituloNotas, notas, 28, te.condicoes);

    // 2. Condições gerais — duas colunas corridas.
    const gerais: Peca[] = fixos.condicoesGerais.map((texto) => ({ tipo: "item", texto }));
    if (gerais.length)
      paginasDeColunasCorridas(t.sobretituloCondicoes, te.tituloCondicoesGerais, gerais);

    // 3. Pagamento e cancelamento — o faseamento com os valores, os contactos.
    const pct = totais.percentagemSinal;
    const marcos: Peca[] =
      totais.aPagar > 0
        ? [
            {
              tipo: "item",
              forte: `${t.sinal(pct)} · ${eurDoc(totais.sinal)}`,
              texto: t.quandoSinal,
            },
            {
              tipo: "item",
              forte: `${t.saldo(100 - pct)} · ${eurDoc(totais.saldo)}`,
              texto: t.quandoSaldo,
            },
            { tipo: "item", texto: t.baseDoCalculo(eurDoc(totais.aPagar)) },
          ]
        : [];
    const faseamento = lista(t.faseamentoDoPagamento, fixos.faseamento);
    const pagamento = [
      [
        ...(faseamento.length
          ? [...faseamento, ...marcos]
          : marcos.length
            ? [{ tipo: "h3" as const, texto: comoTitulo(t.faseamentoDoPagamento) }, ...marcos]
            : []),
        { tipo: "h3" as const, texto: comoTitulo(t.contactos) },
        { tipo: "contacto" as const, rotulo: t.email, valor: SITE.email },
        { tipo: "contacto" as const, rotulo: t.telefone, valor: SITE.phoneDisplay },
      ],
      lista(t.cancelamento, fixos.cancelamento),
    ].filter((c) => c.length);
    paginasDeColunasFixas(t.sobretituloCondicoes, te.tituloPagamento, pagamento, 50);
  }

  // ── Contracapa ──
  plano.push({
    desenhar: () =>
      contracapa(ctx, {
        sobretitulo: t.obrigada,
        agradecimento: t.agradecimento,
        lema: t.slogan ?? SITE.slogan,
        validade: t.passoValidade(t.data(resolveValidUntil(doc))),
        fundo: fundoDaCapa,
      }),
  });

  const entradas: EntradaDoIndice[] = plano.flatMap((p, i) =>
    p.entrada ? [{ titulo: p.entrada, pagina: i + 1 }] : [],
  );
  for (const [i, passo] of plano.entries()) await passo.desenhar(i + 1, entradas);

  const bytes = await pdf.save();
  return { bytes, truncations: ctx.cortes, undrawnImages: ctx.naoDesenhadas.size };

  /* ── As páginas de colunas, repartidas antes de se desenharem ────────── */

  /** Colunas fixas (cada uma continua na mesma coluna da página seguinte). */
  function paginasDeColunasFixas(
    sobre: string,
    titulo: string,
    colunas: readonly (readonly Peca[])[],
    vao: number,
    entrada?: string,
  ) {
    if (!colunas.length) return;
    const largura = larguraDaColuna(colunas.length, vao);
    const paginas = paginarColunasFixas(ctx, colunas, largura, alturaDasColunas(ctx, titulo));
    paginas.forEach((cols, k) => {
      const faixa = album.escolher(proxima(), "alta")[0] ?? null;
      plano.push({
        entrada: k === 0 ? entrada : undefined,
        desenhar: (numero) =>
          paginaDeColunas(ctx, {
            sobretitulo: sobre,
            titulo: k ? `${titulo} ${te.continuacao}` : titulo,
            colunas: cols,
            vao,
            faixa,
            pagina: numero,
          }),
      });
    });
  }

  /** Uma lista corrida em duas colunas, equilibradas quando cabe numa página. */
  function paginasDeColunasCorridas(
    sobre: string,
    titulo: string,
    pecas: readonly Peca[],
    entrada?: string,
  ) {
    const vao = 50;
    const largura = larguraDaColuna(2, vao);
    const altura = alturaDasColunas(ctx, titulo);
    let paginas = paginarCorrido(ctx, pecas, 2, largura, altura);
    if (paginas.length === 1) {
      const k = aoMeio(ctx, pecas, largura);
      const equilibradas = [pecas.slice(0, k), pecas.slice(k)];
      // Só se as duas metades couberem mesmo — senão fica a repartição corrida.
      if (equilibradas.every((c) => repartir(ctx, c, largura, altura).length <= 1)) {
        paginas = [equilibradas.filter((c) => c.length)];
      }
    }
    paginas.forEach((cols, k) => {
      const faixa = album.escolher(proxima(), "alta")[0] ?? null;
      plano.push({
        entrada: k === 0 ? entrada : undefined,
        desenhar: (numero) =>
          paginaDeColunas(ctx, {
            sobretitulo: sobre,
            titulo: k ? `${titulo} ${te.continuacao}` : titulo,
            colunas: cols,
            vao,
            faixa,
            pagina: numero,
          }),
      });
    });
  }
}

/* ── Os serviços ─────────────────────────────────────────────────────────── */

/**
 * Os serviços do documento, para os cartões de «O que propomos».
 *
 * São os ITENS dos grupos de serviços — na proposta dela, o grupo «Decoração
 * Floral e Decoração» com seis serviços dentro. Um grupo sem itens conta pelo
 * seu título. A chave (em português, que é o que ela escreveu) serve para
 * casar o serviço com o seu tema de inspiração.
 */
function servicosDoDocumento(original: ProposalDoc, doc: ProposalDoc) {
  const lista: { nome: string; descricao: string; chave: string }[] = [];
  (original.serviceGroups ?? []).forEach((g, gi) => {
    const gl = doc.serviceGroups?.[gi] ?? g;
    const itens = (g.items ?? []).map((it, ii) => ({ pt: it, naLingua: gl.items?.[ii] ?? it }));
    const comNome = itens.filter((x) => (x.pt.label ?? "").trim());
    if (comNome.length) {
      for (const x of comNome) {
        lista.push({
          nome: x.naLingua.label.trim(),
          descricao: (x.naLingua.desc ?? "").trim(),
          chave: chaveDeRubrica(x.pt.label),
        });
      }
    } else if ((g.title ?? "").trim()) {
      lista.push({ nome: gl.title.trim(), descricao: "", chave: chaveDeRubrica(g.title) });
    }
  });
  return lista;
}

/**
 * O tema que corresponde a um serviço, pelo nome: a mesma chave que o resto
 * do documento usa para alinhar o orçamento com os serviços
 * (`chaveDeRubrica`), igual ou contida uma na outra — «Apontamento Floral
 * Mesa Bolo» casa com «Decor Floral Mesa Bolo».
 */
function temaDoServico<T extends { pt: { title?: string }; fotos: readonly Foto[] }>(
  chave: string,
  temas: readonly T[],
): T | undefined {
  if (!chave) return undefined;
  const meus = chave.split(" ");
  return temas.find((x) => {
    if (!x.fotos.length) return false;
    const seus = chaveDeRubrica(x.pt.title ?? "")
      .split(" ")
      .filter(Boolean);
    if (!seus.length) return false;
    return seus.every((s) => meus.includes(s)) || meus.every((m) => seus.includes(m));
  });
}

/* ── Pequenas coisas ─────────────────────────────────────────────────────── */

/** «TOTAL (sem IVA)» como o exemplo o escreve: «Total (sem IVA)». */
const emFrase = (s: string) => s.replace(/^TOTAL\b/, "Total");

/** A taxa de IVA como o gerador antigo a escreve: «23%», «23,5%». */
const percentagemDoIva = (taxa: number): string =>
  `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(round2(taxa * 100))}%`;

async function logotipo(pdf: PDFDocument): Promise<PDFImage | null> {
  const png = await logotipoNaCor(Buffer.from(LOGO_WHITE_PNG_B64, "base64"), HEX.texto);
  return embedImagem(pdf, png);
}
