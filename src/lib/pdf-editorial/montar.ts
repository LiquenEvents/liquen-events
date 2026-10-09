import "server-only";
import { PDFDocument, type PDFImage } from "pdf-lib";
import sharp from "sharp";
import { resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { docNaLingua } from "@/lib/proposal-doc-bilingue";
import type { DocTruncation } from "@/lib/proposal-doc-pdf";
import {
  camposDoEventoNaLingua,
  IDIOMA_POR_OMISSAO,
  textosDaProposta,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { ordemDeSaida } from "@/lib/proposal-ordem";
import { LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import { SITE } from "@/lib/site";
import { bytesDaFoto, embedImagem } from "./embutir";
import { agrupar, grupoDoTema, type Grupo } from "./grupos";
import { logotipoNaCor, simboloDoLogotipo } from "./imagens";
import type { Contexto } from "./moldura";
import { HEX, misturaNoFundo } from "./paleta";
import { capa, contracapa } from "./paginas/capa";
import { citacao, separador, TIRAS_DO_SEPARADOR } from "./paginas/fotografia";
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
 * funções (`textosDaProposta`, `camposDoEventoNaLingua`, `docNaLingua`,
 * `resolveValidUntil`, `SITE`). O gerador antigo (`proposal-doc-pdf.ts`) não é
 * tocado e continua a ser o do envio até ela aprovar este.
 *
 * ── Por partes, como ela pediu ─────────────────────────────────────────────
 *   1. componentes de página e capa  ← ESTE
 *   2. as composições automáticas das fotografias (as galerias de cada tema)
 *   3. orçamento, total e condições
 * Até à parte 3, o documento tem capa, índice, «A proposta», os separadores de
 * cada capítulo, a citação e a contracapa — o suficiente para ela ver o
 * desenho com as fotografias dela.
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
  const org = doc.template === "organizacao";

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${te.rodapeModelo(org)} · ${doc.clientNames}`);
  pdf.setAuthor(SITE.name);
  const letras = await embutirLetras(pdf);
  const logo = await logotipo(pdf);
  const simbolo = await simboloParaORodape(pdf);
  const ctx: Contexto = {
    pdf,
    letras,
    idioma,
    t,
    te,
    rodape: [te.rodapeModelo(org), doc.clientNames, evento.eventDate]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" · "),
    logo,
    simbolo,
    cortes: [],
    naoDesenhadas: new Set(),
  };

  // ── As fotografias ───────────────────────────────────────────────────────
  // Os temas pela ordem do documento (a mesma do gerador antigo), e cada um no
  // seu capítulo — o capítulo lê-se do título EM PORTUGUÊS, que é o que ela
  // escreveu: a tradução não pode mudar uma foto de capítulo.
  const ordem = ordemDeSaida(original, original.moodBoards, (b) => b.title ?? "");
  const temas = ordem.map((i) => ({
    pt: original.moodBoards[i],
    naLingua: doc.moodBoards[i] ?? original.moodBoards[i],
  }));
  const fotosDoTema = async (i: number) => {
    const { pt } = temas[i];
    const lista: Foto[] = [];
    for (const [k, dado] of (pt.images ?? []).entries()) {
      const bytes = bytesDaFoto(dado);
      if (!bytes) continue;
      lista.push(await medir(bytes, `Tema «${pt.title}» · foto ${k + 1}`));
    }
    return lista;
  };
  const porTema = await Promise.all(temas.map((_, i) => fotosDoTema(i)));
  const capitulos = agrupar(
    temas.map((tema, i) => ({ tema, fotos: porTema[i] })),
    (x) => grupoDoTema(x.tema.pt.title ?? "", x.tema.pt.subtitulo ?? ""),
  );

  const capaFotos = (doc.coverImages ?? []).slice(0, 2).map((d) => bytesDaFoto(d));
  const usadas = new Set<Buffer>();
  const todas = porTema.flat();

  // Os separadores levam as primeiras fotos de cada capítulo, ao alto primeiro
  // (as tiras são altas e estreitas: uma foto deitada perde os lados).
  const fotosDoSeparador = new Map<Grupo, Foto[]>();
  for (const c of capitulos) {
    const doCapitulo = c.itens.flatMap((x) => x.fotos);
    const escolha = [...doCapitulo]
      .sort((a, b) => Number(b.aspecto < 1) - Number(a.aspecto < 1))
      .slice(0, TIRAS_DO_SEPARADOR);
    escolha.forEach((f) => usadas.add(f.bytes));
    fotosDoSeparador.set(c.grupo, escolha);
  }
  const fotoDaCitacao = capitulos.length ? escolher(todas, usadas, "deitada") : null;
  const fundoDoIndice = escolher(todas, usadas, "deitada");
  const fundoDaApresentacao = escolher(todas, usadas, "deitada");

  // ── O plano: cada página sabe o seu número antes de se desenhar ─────────
  // É o que deixa o índice dizer a página VERDADEIRA de cada capítulo.
  type Passo = {
    entrada?: string;
    desenhar: (numero: number, indice: EntradaDoIndice[]) => Promise<unknown>;
  };
  const plano: Passo[] = [];
  const meio = Math.ceil(capitulos.length / 2);

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
        fotos: capaFotos,
        origens: ["Capa · foto 1", "Capa · foto 2"],
      }),
  });
  plano.push({
    desenhar: (numero, entradas) =>
      indice(ctx, {
        sobretitulo: te.indice,
        titulo: te.tituloIndice,
        entradas,
        foto: fundoDoIndice?.bytes ?? capaFotos[0] ?? null,
        origem: fundoDoIndice?.origem ?? "Índice",
        numero,
      }),
  });
  plano.push({
    entrada: te.aProposta,
    desenhar: (numero) =>
      apresentacao(ctx, {
        sobretitulo: t.sobretituloApresentacao,
        titulo: te.tituloDaProposta(primeirosNomes(doc.clientNames, idioma), org),
        factos: factos(doc, evento, te, t),
        foto: fundoDaApresentacao?.bytes ?? capaFotos[1] ?? capaFotos[0] ?? null,
        origem: fundoDaApresentacao?.origem ?? "A proposta",
        numero,
      }),
  });
  capitulos.forEach((c, i) => {
    const nome = te.grupos[c.grupo];
    const fotos = fotosDoSeparador.get(c.grupo) ?? [];
    plano.push({
      entrada: `${te.inspiracao} · ${nome}`,
      desenhar: (_n, entradas) => {
        const n = entradas.findIndex((e) => e.titulo === `${te.inspiracao} · ${nome}`) + 1;
        return separador(ctx, {
          sobretitulo: `${String(n).padStart(2, "0")} · ${te.inspiracao}`,
          titulo: nome,
          fotos: fotos.map((f) => f.bytes),
          origens: fotos.map((f) => f.origem),
        });
      },
    });
    // A parte 2 põe aqui as galerias de cada tema do capítulo.
    if (i + 1 === meio && fotoDaCitacao) {
      plano.push({
        desenhar: () =>
          citacao(ctx, {
            frase: t.slogan ?? SITE.slogan,
            aspas: idioma === "en" ? ["“", "”"] : ["«", "»"],
            assinatura: SITE.name,
            foto: fotoDaCitacao.bytes,
            origem: fotoDaCitacao.origem,
          }),
      });
    }
  });
  plano.push({
    desenhar: () =>
      contracapa(ctx, {
        sobretitulo: t.obrigada,
        agradecimento: t.agradecimento,
        lema: t.slogan ?? SITE.slogan,
        validade: t.passoValidade(t.data(resolveValidUntil(doc))),
        fotos: capaFotos,
        origens: ["Capa · foto 1", "Capa · foto 2"],
      }),
  });

  const entradas: EntradaDoIndice[] = plano.flatMap((p, i) =>
    p.entrada ? [{ titulo: p.entrada, pagina: i + 1 }] : [],
  );
  for (const [i, passo] of plano.entries()) await passo.desenhar(i + 1, entradas);

  const bytes = await pdf.save();
  return { bytes, truncations: ctx.cortes, undrawnImages: ctx.naoDesenhadas.size };
}

/* ── Fotografias ─────────────────────────────────────────────────────────── */

interface Foto {
  bytes: Buffer;
  origem: string;
  /** Largura ÷ altura, já com a rotação EXIF aplicada. */
  aspecto: number;
  pixeis: number;
}

/** Lê as dimensões do cabeçalho — sem descodificar a imagem. */
async function medir(bytes: Buffer, origem: string): Promise<Foto> {
  try {
    const m = await sharp(bytes, { failOn: "none" }).metadata();
    const deitada = (m.orientation ?? 1) >= 5;
    const w = (deitada ? m.height : m.width) ?? 1;
    const h = (deitada ? m.width : m.height) ?? 1;
    return { bytes, origem, aspecto: w / h, pixeis: w * h };
  } catch {
    return { bytes, origem, aspecto: 1, pixeis: 0 };
  }
}

/**
 * A próxima foto por usar para uma página inteira: deitada (≥ 1,3) e com mais
 * pixéis primeiro. Se não houver nenhuma por usar, repete-se a melhor — uma
 * página com fundo repetido é melhor do que uma sem fundo.
 */
function escolher(fotos: readonly Foto[], usadas: Set<Buffer>, forma: "deitada"): Foto | null {
  if (!fotos.length) return null;
  const nota = (f: Foto) => (forma === "deitada" && f.aspecto >= 1.3 ? 1e12 : 0) + f.pixeis;
  const livres = fotos.filter((f) => !usadas.has(f.bytes));
  const melhor = [...(livres.length ? livres : fotos)].sort((a, b) => nota(b) - nota(a))[0];
  usadas.add(melhor.bytes);
  return melhor;
}

/** O símbolo do rodapé, à opacidade do exemplo (0,8) já misturada no fundo. */
async function simboloParaORodape(pdf: PDFDocument): Promise<PDFImage | null> {
  const png = await simboloDoLogotipo(
    Buffer.from(LOGO_WHITE_PNG_B64, "base64"),
    misturaNoFundo(HEX.texto, 0.8),
  );
  return png ? embedImagem(pdf, png) : null;
}

async function logotipo(pdf: PDFDocument): Promise<PDFImage | null> {
  const png = await logotipoNaCor(Buffer.from(LOGO_WHITE_PNG_B64, "base64"), HEX.texto);
  return embedImagem(pdf, png);
}

/* ── Os factos de «A proposta» ───────────────────────────────────────────── */

function factos(
  doc: ProposalDoc,
  evento: ReturnType<typeof camposDoEventoNaLingua>,
  te: ReturnType<typeof textosEditoriais>,
  t: ReturnType<typeof textosDaProposta>,
): { rotulo: string; valor: string }[] {
  const casal = doc.clientNames.includes("&");
  const servicos = doc.serviceGroups?.length ?? 0;
  return [
    { rotulo: te.factos.evento, valor: evento.eventType ?? "" },
    { rotulo: te.factos.data, valor: evento.eventDate ?? "" },
    { rotulo: te.factos.local, valor: doc.location ?? "" },
    { rotulo: te.factos.convidados, valor: evento.guests ?? "" },
    { rotulo: casal ? te.factos.noivos : te.factos.cliente, valor: doc.clientNames },
    { rotulo: te.factos.cerimonia, valor: evento.ceremony ?? "" },
    { rotulo: te.factos.servicos, valor: servicos ? String(servicos) : "" },
    { rotulo: te.factos.validaAte, valor: t.data(resolveValidUntil(doc)) },
  ].filter((f) => f.valor.trim());
}
