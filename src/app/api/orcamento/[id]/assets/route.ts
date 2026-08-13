import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { isAuthed } from "@/lib/admin-auth";
import {
  uploadProposalImage,
  uploadProposalThumb,
  listProposalImages,
  signProposalPaths,
  signProposalThumbs,
} from "@/lib/proposal-storage";
import { getProposalByQuote } from "@/lib/proposals-store";
import { getProposalDraft } from "@/lib/proposal-drafts";
import { refsDeTemaNoDoc } from "@/lib/theme-materializar";
import { garantirFormatoImprimivel, motivoDaRecusa } from "@/lib/proposal-image";
import { recusaDeImagem } from "@/lib/recusa-de-imagem";
import { isDatabaseConfigured } from "@/lib/supabase";
import { corNormalizada } from "@/lib/cor";
import { coresDeCaminhos, garantirFoto, updateFoto } from "@/lib/biblioteca-fotos-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
// Carrega a foto, redimensiona-a com o sharp, guarda o original E a
// miniatura. Dez segundos não chegam para uma fotografia de telemóvel.
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per image
// Pixel-dimension cap: a byte cap alone doesn't stop a decompression bomb (a
// tiny PNG can decode to gigapixels), which would exhaust memory when the PDF
// renderer later decodes it. 50 MP (~8660×5773) is far beyond any real photo we
// embed. Rejected at the door so a bomb can never be stored.
const MAX_PIXELS = 50_000_000;
const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

/**
 * As fotos ESCOLHIDAS DA BIBLIOTECA que este pedido usa, com URL fresco.
 *
 * Vivem no bucket dos temas e não na pasta do pedido, por isso a listagem da
 * pasta não as vê — e sem isto uma proposta reaberta noutro aparelho mostrava
 * as células dos mood boards vazias. Onde estão elas escritas: no documento
 * gravado da proposta e no rascunho do estúdio, que é exactamente onde o
 * `theme-materializar` também as vai procurar.
 *
 * Melhor esforço do princípio ao fim: sem base de dados, ou com uma proposta
 * que ainda não existe, devolve uma lista vazia e a página comporta-se como
 * antes desta funcionalidade.
 */
async function fotosDaBibliotecaDoPedido(quoteId: string) {
  const docs: unknown[] = [];
  try {
    const p = await getProposalByQuote(quoteId);
    if (p?.doc) docs.push(p.doc);
  } catch {
    /* sem proposta gravada — o rascunho ainda pode ter as referências */
  }
  try {
    const rascunho = await getProposalDraft(quoteId);
    if (rascunho?.doc) docs.push(rascunho.doc);
  } catch {
    /* sem rascunho */
  }
  const refs = new Set<string>();
  for (const d of docs) for (const r of refsDeTemaNoDoc(d)) refs.add(r);
  if (refs.size === 0) return [];

  const lista = [...refs];
  const [urls, thumbs] = await Promise.all([signProposalPaths(lista), signProposalThumbs(lista)]);
  return lista
    .map((ref) => {
      const url = urls.get(ref) ?? "";
      const thumbUrl = thumbs.get(ref);
      return { path: ref, url, ...(thumbUrl ? { thumbUrl } : {}) };
    })
    .filter((im) => im.url);
}

/**
 * List every image already uploaded for this quote (each with a fresh signed
 * URL), so the studio can re-offer them on any device and re-preview images
 * whose cached URL is gone. Admin-only; returns an empty list when Storage
 * isn't configured rather than erroring.
 *
 * Junta as duas famílias — a pasta do pedido e as referências à Biblioteca —
 * numa lista só, porque o estúdio guarda um mapa `caminho → URL` e não precisa
 * de saber a diferença.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const [proprias, daBiblioteca] = await Promise.all([
      listProposalImages(id),
      fotosDaBibliotecaDoPedido(id),
    ]);
    const imagens = [...proprias, ...daBiblioteca];
    // AS CORES, num pedido só para todas.
    //
    // É com elas que o estúdio avisa que uma foto destoa da paleta do board e
    // arruma as fotos por cor. Vêm daqui — e não de um `canvas` do lado da
    // proposta — porque estas fotos chegam por URLs assinados de OUTRO domínio:
    // ler-lhes os píxeis lançaria (ver `cor-dominante.ts`).
    //
    // Melhor esforço: sem base de dados, ou com fotos anteriores a isto existir,
    // o mapa vem vazio e o estúdio comporta-se exactamente como antes.
    const cores = await coresDeCaminhos(imagens.map((im) => im.path));
    return NextResponse.json({
      ok: true,
      images: imagens.map((im) => {
        const cor = cores.get(im.path);
        return cor ? { ...im, cor } : im;
      }),
    });
  } catch (err) {
    // Um Storage em baixo saía daqui como 500 anónimo, sem ficar registado —
    // e o estúdio via a grelha vazia sem nada que dissesse porquê.
    log.error("assets GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Admin-only upload of proposal mood-board / cover images to Supabase Storage.
 * Accepts multipart/form-data with one or more `files`; returns the stored
 * `path` + a signed `url` for each. Paths are persisted on the proposal doc so
 * the studio can re-open and re-edit a proposal without re-uploading.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configura o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem recebida." }, { status: 400 });
  }

  // As miniaturas vêm num campo PARALELO, alinhado por índice com `files`. O
  // browser já as fabrica na mesma descodificação que faz para encolher o
  // original (ver `image-prep.ts`), portanto chegam aqui de borla.
  //
  // São OPCIONAIS de propósito: um cliente antigo, ou um browser onde a
  // fabricação falhou, envia só o original e o carregamento corre na mesma —
  // a grelha cai para o original, que é o comportamento de hoje.
  const thumbs = form.getAll("thumbs").filter((f): f is File => f instanceof File);

  // As CORES dominantes, calculadas no browser (ver `corDe` em
  // `image-worker.ts`) e emparelhadas pela ordem, como as miniaturas.
  // Comprimentos diferentes significam que os dois lados discordam sobre o que
  // está a ser enviado: aí não se adivinha, vão todas a `null` — uma cor na
  // foto errada faria o aviso de paleta apontar a fotografia inocente.
  const coresCruas = form.getAll("cores").filter((v): v is string => typeof v === "string");
  const cores: (string | null)[] =
    coresCruas.length === files.length ? coresCruas.map(corNormalizada) : files.map(() => null);
  if (coresCruas.length > 0 && coresCruas.length !== files.length) {
    log.warn("assets: cores ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      cores: coresCruas.length,
    });
  }

  const uploaded: { path: string; url: string; thumbUrl?: string; cor?: string }[] = [];
  for (const [indice, file] of files.entries()) {
    if (!OK_TYPES.test(file.type)) {
      return NextResponse.json(
        { error: `Formato não suportado: ${file.name}. Usa JPG, PNG ou WEBP.` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Imagem demasiado grande: ${file.name} (máx. 12 MB).` },
        { status: 413 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // Reject decompression bombs by pixel count before the image is ever stored
    // or later decoded by the PDF renderer. sharp reads dimensions from the
    // header without fully decoding, so this is cheap.
    try {
      const meta = await sharp(bytes).metadata();
      const pixels = (meta.width ?? 0) * (meta.height ?? 0);
      if (!pixels || pixels > MAX_PIXELS) {
        return NextResponse.json(
          { error: `Imagem com dimensões inválidas ou demasiado grandes: ${file.name}.` },
          { status: 413 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: `Não foi possível processar a imagem: ${file.name}.` },
        { status: 415 },
      );
    }
    // O que fica GUARDADO tem de ser um formato que o PDF saiba imprimir.
    // Aceita-se WebP à porta (é o formato em que o Pinterest serve as imagens,
    // e é de lá que vem a inspiração do estúdio), mas converte-se para JPEG
    // ANTES de guardar: o `pdf-lib` só embute JPEG/PNG, e um WebP guardado tal
    // e qual acabava numa moldura vazia na proposta do cliente.
    const pronto = await garantirFormatoImprimivel(bytes, file.type);
    if (!pronto) {
      // A frase diz O QUE aconteceu e o que fazer — ver `recusa-de-imagem`.
      return NextResponse.json(
        { error: recusaDeImagem(motivoDaRecusa(bytes, file.type), file.name) },
        { status: 415 },
      );
    }
    const res = await uploadProposalImage(id, pronto.bytes, pronto.contentType);
    if (!res) {
      log.error("assets: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    // A miniatura só depois de o original estar guardado, e sempre em melhor
    // esforço: falhar aqui não pode fazer falhar um carregamento que já correu
    // bem. `uploadProposalThumb` nunca lança e devolve "" quando não dá.
    const thumb = thumbs[indice];
    let thumbUrl = "";
    if (thumb && OK_TYPES.test(thumb.type) && thumb.size <= MAX_BYTES) {
      thumbUrl = await uploadProposalThumb(
        res.path,
        Buffer.from(await thumb.arrayBuffer()),
        thumb.type,
      );
    }
    // A cor entra na linha da foto. Melhor esforço, como a miniatura: a
    // fotografia já está guardada, e falhar aqui deixa-a sem cor — exactamente
    // como estão todas as anteriores a isto existir. Nunca é motivo para
    // devolver erro de um carregamento que correu bem.
    const cor = cores[indice];
    if (cor) {
      try {
        await garantirFoto(res.path, { cor });
        await updateFoto(res.path, { cor });
      } catch (e) {
        log.warn("assets: cor não guardada", { path: res.path, erro: String(e) });
      }
    }
    uploaded.push({ ...res, ...(thumbUrl ? { thumbUrl } : {}), ...(cor ? { cor } : {}) });
  }

  return NextResponse.json({ ok: true, images: uploaded });
}
