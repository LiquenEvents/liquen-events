import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import {
  listThemeImagePage,
  uploadThemeImage,
  deleteThemeImage,
  findThemeImageByBytes,
  isThemePath,
  themeIdOfPath,
  themeFolder,
  type ThemeThumbInput,
} from "@/lib/theme-storage";
import { isFingerprint } from "@/lib/theme-fingerprint";
import {
  THEME_PAGE_SIZE,
  MAX_THEME_PAGE_SIZE,
  type ThemeDuplicate,
  type ThemeImage,
} from "@/lib/theme-types";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { lqipAceitavel } from "@/lib/lqip";
import { garantirFoto, updateFoto } from "@/lib/biblioteca-fotos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB por imagem
/** Uma miniatura acima disto é um erro do cliente, não uma miniatura. É
 *  ignorada (fica a foto sem miniatura), nunca recusa o carregamento. */
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

/**
 * Resposta a uma falha inesperada: se o Storage nem sequer está configurado, a
 * causa é essa (503, e não um "erro interno" que manda a Catarina procurar um
 * problema que não existe); caso contrário é mesmo um 500.
 */
function failed(message: string, err: unknown, id: string) {
  log.error(message, err, { id });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  return NextResponse.json({ error: "Erro interno" }, { status: 500 });
}

/** Um inteiro >= 0 vindo da query string; `fallback` para tudo o resto. */
function num(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

/**
 * UMA PÁGINA das fotos de um tema: `?offset=&limit=`.
 *
 * Devolve `{ ok, images, total, truncated }`. Só a página pedida é assinada —
 * abrir um tema com 3000 fotos custa o mesmo que abrir um com 30. Cada foto
 * traz `url` (o ORIGINAL, que é o que vai para a proposta) e, quando existe,
 * `thumbUrl` — a miniatura, que é o que a grelha deve mostrar. As fotos
 * carregadas antes de as miniaturas existirem vêm sem `thumbUrl`.
 *
 * `ok: false` (com 200) quer dizer "a pasta não pôde ser lida agora", que a UI
 * mostra como "Fotos indisponíveis" — nunca como um tema vazio.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // O tema inexistente é um `return` (404), nunca uma exceção — um 404
    // legítimo não pode sair daqui disfarçado de 500.
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const q = request.nextUrl.searchParams;
    // Teto rígido: um `?limit=5000` mandaria assinar a biblioteca inteira num
    // pedido. Corta-se em silêncio (o cliente pagina), não se recusa.
    const limit = Math.min(Math.max(1, num(q.get("limit"), THEME_PAGE_SIZE)), MAX_THEME_PAGE_SIZE);
    const offset = num(q.get("offset"), 0);
    // A ordem arrumada à mão (se existir) manda no início da lista; a pasta
    // continua a mandar no resto. O tema já foi lido acima, não custa nada.
    return NextResponse.json(await listThemeImagePage(id, limit, offset, theme.photoOrder ?? []));
  } catch (err) {
    return failed("temas imagens GET falhou", err, id);
  }
}

/**
 * Recolhe as miniaturas que vieram no formulário, emparelhadas com os
 * ficheiros pela ORDEM (o campo `thumbs` é opcional).
 *
 * Ou os dois campos têm o mesmo comprimento, ou não há emparelhamento
 * possível: pelo índice, uma miniatura a menos passaria a acompanhar a foto
 * errada — uma foto com a miniatura de outra é pior do que foto nenhuma. O
 * cliente que não consiga gerar uma miniatura deve enviar um marcador vazio no
 * lugar dela (`new Blob([])`), que aqui simplesmente não conta.
 */
function pairThumbs(files: File[], form: FormData): (File | null)[] {
  const thumbs = form.getAll("thumbs").filter((f): f is File => f instanceof File);
  if (thumbs.length === 0) return files.map(() => null);
  if (thumbs.length !== files.length) {
    log.warn("temas: miniaturas ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      thumbs: thumbs.length,
    });
    return files.map(() => null);
  }
  return thumbs.map((t) => {
    if (t.size === 0) return null; // marcador: esta foto vem sem miniatura
    if (!OK_TYPES.test(t.type) || t.size > MAX_THUMB_BYTES) {
      log.warn("temas: miniatura descartada", { tipo: t.type, bytes: t.size });
      return null;
    }
    return t;
  });
}

/**
 * Os resumos das fotos, emparelhados com os ficheiros pela ORDEM (campo
 * opcional `hashes`).
 *
 * A regra é a MESMA do `pairThumbs` acima e pela mesma razão: ou os dois
 * campos têm o mesmo comprimento, ou não há emparelhamento possível. Um resumo
 * a menos faria uma foto ser guardada com a identidade de OUTRA — e a partir
 * daí a foto certa seria sempre reportada como repetida. Perante a menor
 * dúvida, ignora-se o campo todo e as fotos sobem com nome UUID, que é
 * exatamente o comportamento de antes desta funcionalidade.
 *
 * Um resumo mal formado (não 32 hex) vira `null` na sua posição, sem
 * desalinhar os outros. É também a validação que impede o nome do ficheiro
 * — que passa a vir do cliente — de conter travessia de diretórios.
 */
/**
 * Os LQIP, emparelhados pela ORDEM — mesma regra do `pairThumbs` e do
 * `pairHashes`, e pela mesma razão: comprimentos diferentes significam que o
 * cliente e o servidor discordam sobre o que está a ser enviado, e um
 * placeholder atribuído à foto errada seria a cor de outra fotografia a
 * aparecer nesta célula. Aí não se adivinha — vão todos a `null`.
 *
 * Cada valor passa pelo guarda do `lqip.ts`: um `data:` URI que vem do cliente
 * e vai parar a um `src` não entra sem lista de permitidos.
 */
/** As MICRO (96 px), emparelhadas pela ordem — mesma regra do `pairThumbs`. */
function pairMicros(files: File[], form: FormData): (File | null)[] {
  const micros = form.getAll("micros").filter((f): f is File => f instanceof File);
  if (micros.length === 0) return files.map(() => null);
  if (micros.length !== files.length) {
    log.warn("temas: micros ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      micros: micros.length,
    });
    return files.map(() => null);
  }
  return micros.map((m) => (m.size === 0 ? null : m));
}

function pairLqips(files: File[], form: FormData): (string | null)[] {
  const raw = form.getAll("lqips").filter((v): v is string => typeof v === "string");
  if (raw.length === 0) return files.map(() => null);
  if (raw.length !== files.length) {
    log.warn("temas: LQIP ignorados (não correspondem aos ficheiros)", {
      files: files.length,
      lqips: raw.length,
    });
    return files.map(() => null);
  }
  return raw.map((v) => (lqipAceitavel(v) ? v : null));
}

function pairHashes(files: File[], form: FormData): (string | null)[] {
  const raw = form.getAll("hashes").filter((h): h is string => typeof h === "string");
  if (raw.length === 0) return files.map(() => null);
  if (raw.length !== files.length) {
    log.warn("temas: resumos ignorados (não correspondem aos ficheiros)", {
      files: files.length,
      hashes: raw.length,
    });
    return files.map(() => null);
  }
  return raw.map((h) => (isFingerprint(h) ? h : null));
}

/**
 * Carrega fotos para a pasta de um tema. Aceita multipart/form-data com um ou
 * mais `files` e, opcionalmente, os `thumbs` correspondentes pela mesma ordem —
 * as miniaturas são feitas no navegador, a partir do mesmo bitmap já
 * descodificado para comprimir o original.
 *
 * A miniatura é um acessório: falhar a guardá-la deixa a foto sem miniatura
 * (a grelha mostra o original), nunca faz o carregamento falhar.
 *
 * NÃO REPETIR FOTOS QUE JÁ ESTÃO NO TEMA. Além dos `thumbs`, aceita `hashes` —
 * o resumo do ficheiro ORIGINAL de cada foto, calculado no navegador. Com ele,
 * a foto é guardada como `<tema>/<resumo>.jpg` e o `upsert: false` que já
 * existia recusa atomicamente uma segunda cópia. Uma foto assim recusada NÃO é
 * um erro HTTP: sai em `duplicates`, com 200, e a UI mostra-a como "já estava
 * neste tema" com um botão para forçar.
 *
 * Há ainda a rede secundária, para a biblioteca ANTIGA (nome UUID, sem resumo):
 * compara-se o MD5 dos bytes recebidos com o eTag que a listagem da pasta já
 * traz. Custa uma listagem memoizada por lote e apanha a cauda que o nome não
 * consegue apanhar.
 *
 * `force: "1"` salta as duas verificações e guarda com `<resumo>-<4 hex>` — é o
 * "Adicionar mesmo assim", e a recuperação de qualquer modo de falha do índice.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configure o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;
  const theme = await getTheme(id);
  if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

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
  const thumbs = pairThumbs(files, form);
  const hashes = pairHashes(files, form);
  const lqips = pairLqips(files, form);
  const micros = pairMicros(files, form);
  const force = form.get("force") === "1";

  const uploaded: ThemeImage[] = [];
  const duplicates: ThemeDuplicate[] = [];
  for (const [i, file] of files.entries()) {
    if (!OK_TYPES.test(file.type)) {
      return NextResponse.json(
        { error: `Formato não suportado: ${file.name}. Use JPG, PNG ou WEBP.` },
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

    // Rede secundária: a foto antiga, de nome UUID, que o resumo não apanha.
    // Feita ANTES de escrever, para não deixar uma segunda cópia no bucket.
    if (!force) {
      const already = await findThemeImageByBytes(id, bytes);
      if (already) {
        duplicates.push({ name: file.name, path: already, reason: "no-tema" });
        continue;
      }
    }

    const thumb = thumbs[i];
    const thumbInput: ThemeThumbInput | undefined = thumb
      ? { bytes: Buffer.from(await thumb.arrayBuffer()), contentType: thumb.type }
      : undefined;
    const micro = micros[i];
    const microInput: ThemeThumbInput | undefined = micro
      ? { bytes: Buffer.from(await micro.arrayBuffer()), contentType: micro.type }
      : undefined;
    const res = await uploadThemeImage(
      id,
      bytes,
      file.type,
      thumbInput,
      { fingerprint: hashes[i], force },
      microInput,
    );
    if (!res) {
      log.error("temas: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    // "Já cá estava" é uma resposta, não uma avaria: 200 com a foto na lista de
    // repetidas. Um 502 aqui mandaria a Catarina procurar um problema que não
    // existe — e o "Tentar novamente" voltaria a fazer o mesmo para sempre.
    if (res.kind === "duplicate") {
      duplicates.push({ name: file.name, path: res.path, reason: "no-tema" });
      continue;
    }
    // O LQIP entra na linha da foto que acabou de nascer. Melhor esforço: a
    // fotografia já está guardada, e falhar aqui deixa-a sem placeholder —
    // exactamente como estão todas as anteriores a isto existir. Nunca é
    // motivo para devolver erro de um carregamento que correu bem.
    const lqip = lqips[i];
    if (lqip) {
      try {
        await garantirFoto(res.image.path, { lqip });
        await updateFoto(res.image.path, { lqip });
      } catch (e) {
        log.warn("temas: LQIP não guardado", { path: res.image.path, erro: String(e) });
      }
    }
    // Devolvido JÁ na resposta: a célula que acabou de entrar na grelha não
    // tem de esperar pela próxima listagem para ter placeholder.
    uploaded.push(lqip ? { ...res.image, lqip } : res.image);
  }

  return NextResponse.json({ ok: true, images: uploaded, duplicates });
}

/** Remove UMA foto do tema: `?path=<themeId>/<ficheiro>`. A miniatura sai com
 *  ela (melhor esforço — uma miniatura órfã nunca impede apagar a foto). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const path = request.nextUrl.searchParams.get("path") ?? "";
    // O caminho tem de ser um ficheiro DENTRO da pasta deste tema — nunca de
    // outro tema, nunca com travessia de diretórios.
    if (!isThemePath(path) || themeIdOfPath(path) !== themeFolder(id)) {
      return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
    }
    const ok = await deleteThemeImage(path);
    if (!ok) return NextResponse.json({ error: "Falha ao remover a imagem." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed("temas imagens DELETE falhou", err, id);
  }
}
