import "server-only";
import sharp from "sharp";
import { MOOD_BOARD_MAX_IMAGES, type ProposalDoc, withProposalDefaults } from "@/lib/proposal-doc";
import {
  caixasDaCapa,
  caixasDoCollage,
  renderProposalDocPdfWithReport,
  type CaixaPdf,
  type DocTruncation,
} from "@/lib/proposal-doc-pdf";
import {
  fetchProposalCoverBytes,
  fetchProposalImageBytes,
  fetchProposalThumbBytes,
  uploadProposalCover,
} from "@/lib/proposal-storage";
import { derivadaDaCapa, pixelsForBox, type TargetPixels } from "@/lib/proposal-image";
import { log } from "@/lib/logger";

/**
 * Lado maior das miniaturas que o navegador fabrica no carregamento
 * (`THUMB_EDGE`, em `image-prep.ts`).
 *
 * Está aqui repetido em vez de importado porque o `image-prep.ts` é código de
 * NAVEGADOR e não pode ser puxado para dentro de um módulo `server-only`. Serve
 * só para uma coisa: não ir buscar uma miniatura que de certeza não chega. Se
 * um dia divergir, o pior que acontece é uma ida ao Storage desperdiçada — a
 * decisão final é sempre tomada com as dimensões REAIS do ficheiro, em
 * {@link cobre}, nunca com este número.
 */
const MINIATURA_LADO = 400;

/**
 * A miniatura chega para preencher a caixa, ou ia ser AMPLIADA?
 *
 * Mede-se, não se presume. Uma miniatura tem 400 px no lado maior, mas o lado
 * menor depende da fotografia: numa foto 3:2 são 267 px, numa panorâmica 3:1
 * são 133. A célula precisa dos dois lados — o recorte é `cover` —, por isso
 * uma regra sobre o lado maior deixaria passar exactamente as fotos mais
 * compridas, ampliadas e moles.
 *
 * O `sharp` lê isto do CABEÇALHO, sem descodificar a imagem: são microssegundos
 * sobre um buffer de 20 KB.
 *
 * A orientação EXIF conta: o `resizeToBox` chama `.rotate()`, portanto uma foto
 * de telemóvel deitada sai com os lados TROCADOS face ao que o cabeçalho diz.
 * Comparar sem isso rejeitaria (ou aceitaria) a miniatura pela razão errada.
 */
async function cobre(bytes: Buffer, alvo: TargetPixels): Promise<boolean> {
  try {
    const m = await sharp(bytes).metadata();
    let largura = m.width ?? 0;
    let altura = m.height ?? 0;
    if ((m.orientation ?? 1) >= 5) [largura, altura] = [altura, largura];
    return largura >= alvo.width && altura >= alvo.height;
  } catch {
    // Ilegível: não se arrisca: segue o original.
    return false;
  }
}

// Bounds on image resolution, so a doc with a huge number of image refs can't
// fan out unbounded concurrent fetches (memory/CPU DoS during render) or embed
// an unreasonable number of images. Each fetch is itself host-restricted, timed
// out and size-capped in fetchProposalImageBytes.
//
// Este limite é também o teto do trabalho do sharp: o gerador só redimensiona
// fotos que passaram por aqui, uma de cada vez (os desenhos são sequenciais),
// e reaproveita por conteúdo a mesma foto desenhada mais do que uma vez. Ou
// seja, no máximo MAX_IMAGES_PER_DOC redimensionamentos e nunca mais do que um
// em simultâneo — bem dentro de FETCH_CONCURRENCY.
const MAX_IMAGES_PER_DOC = 80;
const FETCH_CONCURRENCY = 4;

/** Resolve `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CADA FOTO À MEDIDA DA CAIXA ONDE VAI SER DESENHADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Substitui cada referência de imagem (capa + mood boards) por base64, para o
 * gerador — que não sabe o que é armazenamento — a poder embutir.
 *
 * ── O que isto arruma ─────────────────────────────────────────────────────
 * Até aqui descarregava sempre o ORIGINAL: 2200 px, ~576 KB. Uma célula
 * pequena de mood board é desenhada com ~266 px. Eram 28× os bytes pela rede e
 * ~30× os pixéis a descodificar, para o `sharp` deitar fora 97% deles logo a
 * seguir — e ainda a segurar tudo isso em memória ao mesmo tempo, que é a
 * razão pela qual uma proposta cheia chegava a ficar sem memória e a cair para
 * o caminho de recurso (o PDF de 3,31 MB do PDF-BEFORE.md).
 *
 * Agora pergunta-se primeiro ONDE a foto vai ser desenhada — `caixasDaCapa` e
 * `caixasDoCollage`, as mesmas funções que o desenho usa — e pede-se o
 * tamanho que essa caixa justifica.
 *
 * ── Porquê duas passagens ─────────────────────────────────────────────────
 * A disposição de um mood board depende de QUANTAS fotos ele tem, e só se sabe
 * quais entraram depois de as tentar buscar: uma foto que falhe faz as
 * restantes crescer. Adivinhar a disposição antes disso daria, nesse caso, uma
 * miniatura ampliada — uma foto desfocada numa proposta que vai para um casal.
 *
 * Por isso:
 *   1.ª  busca-se o que se acha que chega (a miniatura onde é plausível, o
 *        original onde de certeza não chega). Isto diz quais existem.
 *   2.ª  com as sobreviventes, calcula-se a disposição VERDADEIRA e verifica-se
 *        cada uma contra a sua caixa. A que ficar curta é rebuscada em
 *        original.
 *
 * A 2.ª passagem quase nunca busca nada: no caso normal ninguém falha e as
 * caixas são as previstas.
 */
async function resolveImages(doc: ProposalDoc): Promise<{ doc: ProposalDoc; missing: number }> {
  let remaining = MAX_IMAGES_PER_DOC;
  // Quantas fotos foram PEDIDAS e não entraram. Uma proposta com fotos a menos
  // seguia para o cliente sem ninguém dar por isso; agora quem chama fica a
  // saber e pode dizê-lo. Ver o cabeçalho `X-Fotos-Em-Falta` na rota.
  let missing = 0;

  /** Uma foto já resolvida, e se o que temos é o ORIGINAL ou uma miniatura. */
  interface Resolvida {
    ref: string;
    bytes: Buffer;
    /** `true` quando não há mais nada maior para onde subir. */
    original: boolean;
  }

  /**
   * Busca uma foto, preferindo a derivada que serve `caixa`.
   *
   * `caixa` a `null` é a CAPA, e tem um caminho próprio: as suas tiras correm de
   * topo a fundo da A4 e pedem ~617×1323 px, onde nenhuma miniatura de 400 px
   * chega. Ver {@link buscarCapa}.
   */
  const buscar = async (ref: string, caixa: CaixaPdf | null): Promise<Resolvida | null> => {
    if (!caixa) return buscarCapa(ref);
    const alvo = pixelsForBox(caixa.w, caixa.h, "collage");
    // Só se vai buscar a miniatura quando ela PODE servir. Acima do lado dela
    // não há sequer hipótese, e a ida seria deitada fora.
    if (Math.max(alvo.width, alvo.height) <= MINIATURA_LADO) {
      const mini = await fetchProposalThumbBytes(ref);
      if (mini && (await cobre(mini, alvo))) return { ref, bytes: mini, original: false };
    }
    const bytes = await fetchProposalImageBytes(ref);
    return bytes ? { ref, bytes, original: true } : null;
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A CAPA — a derivada primeiro, e escrita da primeira vez que faltar
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A tira da capa é a fatia mais cara do documento: recortar 617×1323 px a
   * partir do original custa ~250 ms de `sharp`, e há duas tiras, desenhadas na
   * capa e na contracapa. Isso era pago EM CADA geração de PDF, para sempre,
   * para produzir sempre exactamente os mesmos bytes.
   *
   * Aqui pergunta-se primeiro se a derivada já existe. Se existe: 0,1 ms (o
   * `resizeToBox` reconhece os pixéis e devolve-os intactos) e ~100 KB pela rede
   * em vez de ~576 KB.
   *
   * ── E se não existir, faz-se AGORA e guarda-se ────────────────────────────
   * Isto é o que evita ter de migrar seja o que for. As fotos já carregadas — e
   * as da Biblioteca de Temas, que são escolhidas para capa e não passam pelo
   * carregamento de propostas — não têm derivada nenhuma; a primeira proposta
   * que as use escreve-a, e a partir daí ninguém volta a pagar.
   *
   * E não custa nada a ESTA geração: o recorte ia acontecer na mesma, uns
   * milissegundos à frente, dentro do desenho. Só se faz mais cedo, guarda-se, e
   * entregam-se os mesmos bytes que o desenho ia produzir. O único custo extra é
   * a escrita, que é melhor esforço e tem tecto de tempo.
   *
   * A ordem — derivada, original, derivar — nunca deixa a capa sem foto: cada
   * degrau só desce quando o de cima não deu.
   */
  const buscarCapa = async (ref: string): Promise<Resolvida | null> => {
    const caixa = caixasDaCapa()[0];
    const alvo = caixa ? pixelsForBox(caixa.w, caixa.h, "cover") : null;
    if (alvo) {
      const pronta = await fetchProposalCoverBytes(ref);
      // Mede-se antes de confiar: uma derivada de uma versão anterior da
      // geometria seria uma foto ampliada na primeira página da proposta.
      if (pronta && (await cobre(pronta, alvo))) return { ref, bytes: pronta, original: true };
    }
    const bytes = await fetchProposalImageBytes(ref);
    if (!bytes) return null;
    const derivada = await derivadaDaCapa(bytes);
    if (!derivada) return { ref, bytes, original: true };
    // Melhor esforço: se a escrita falhar, a proposta sai na mesma com estes
    // bytes e a próxima geração volta a tentar.
    await uploadProposalCover(ref, derivada);
    return { ref, bytes: derivada, original: true };
  };

  /** `buscar` com o tecto de imagens por documento e a contagem das que faltam. */
  const buscarComTecto = async (ref: string, caixa: CaixaPdf | null): Promise<Resolvida | null> => {
    if (remaining <= 0) {
      // O tecto também é uma perda silenciosa: uma proposta com mais de
      // MAX_IMAGES_PER_DOC fotos perdia as últimas sem aviso.
      missing++;
      return null;
    }
    remaining--;
    const r = await buscar(ref, caixa);
    if (!r) missing++;
    return r;
  };

  // A capa tem 2 POSIÇÕES fixas. Uma referência vazia — ou que não resolve —
  // fica "" NA SUA POSIÇÃO em vez de desaparecer: compactar a lista fazia a
  // foto escolhida para a DIREITA sair impressa à esquerda. Um lugar vazio não
  // gasta orçamento de imagens (nem sequer chega a ser buscado).
  const cover = (
    await mapLimit(doc.coverImages ?? [], FETCH_CONCURRENCY, async (ref) =>
      ref ? await buscarComTecto(ref, null) : null,
    )
  ).map((r) => (r ? r.bytes.toString("base64") : ""));

  // Mood boards resolved one board at a time (inner concurrency bounded), so
  // total in-flight fetches stay ≤ FETCH_CONCURRENCY across the whole doc.
  const moodBoards: NonNullable<ProposalDoc["moodBoards"]> = [];
  for (const mb of doc.moodBoards ?? []) {
    // TODAS são buscadas, mesmo as que passam da lotação do collage.
    //
    // Cortá-las aqui pouparia downloads, e foi a primeira coisa que escrevi —
    // mas mudava duas contas em silêncio: o tecto de imagens por documento
    // deixava de as contar, e o gerador deixava de poder dizer QUAL o mood
    // board que ficou com fotos de fora (`Mood board Cerimónia — 4 fotos`).
    // A poupança seria de um caso que o estúdio não deixa acontecer; a perda
    // de aviso seria real. Só o TAMANHO de cada ficheiro muda aqui.
    const previstas = caixasDoCollage(Math.min(mb.images.length, MOOD_BOARD_MAX_IMAGES));
    const obtidas = await mapLimit(
      mb.images.map((ref, i) => ({ ref, caixa: previstas[i] ?? null })),
      FETCH_CONCURRENCY,
      // Uma referência VAZIA não é uma foto que faltou: é um lugar que nunca
      // teve foto nenhuma. Ir buscá-la falhava sempre e somava ao contador —
      // e o estúdio dizia «1 foto em falta» numa proposta que estava inteira.
      // Um aviso que toca sem razão é um aviso que se deixa de ler. (A capa já
      // tinha esta guarda; os mood boards não.)
      ({ ref, caixa }) => (ref ? buscarComTecto(ref, caixa) : Promise.resolve(null)),
    );

    // ── 2.ª passagem: com as sobreviventes, a disposição VERDADEIRA ──
    // Uma foto que falhou faz as restantes CRESCER, e uma miniatura escolhida
    // para a caixa pequena passaria a ser ampliada. Aqui isso é apanhado e
    // corrigido — é a diferença entre uma foto nítida e uma mole no documento
    // que vai para o casal.
    const vivas = obtidas.filter((r): r is Resolvida => !!r);
    const reais = caixasDoCollage(Math.min(vivas.length, MOOD_BOARD_MAX_IMAGES));
    const finais = await mapLimit(
      vivas.map((r, i) => ({ r, caixa: reais[i] ?? null })),
      FETCH_CONCURRENCY,
      async ({ r, caixa }) => {
        // Já é o original, ou a caixa não mudou de tamanho: nada a fazer.
        if (r.original || !caixa) return r.bytes;
        const alvo = pixelsForBox(caixa.w, caixa.h, "collage");
        if (await cobre(r.bytes, alvo)) return r.bytes;
        // Ficou curta. Sobe-se ao original; se ELE falhar agora, fica-se com a
        // miniatura — uma foto mole é melhor do que uma foto que desaparece de
        // uma proposta.
        return (await fetchProposalImageBytes(r.ref)) ?? r.bytes;
      },
    );

    moodBoards.push({ ...mb, images: finais.map((b) => b.toString("base64")) });
  }

  return { doc: { ...doc, coverImages: cover, moodBoards }, missing };
}

/**
 * Turn a STORED `ProposalDoc` (image fields hold Storage paths, not bytes) into
 * a print-ready PDF: fill the studio's fixed boilerplate, resolve every image
 * reference to inline base64, then render.
 *
 * Shared by the admin generate/preview route and the public portal PDF route so
 * both produce byte-for-byte the same document from the same stored doc.
 */
export async function renderStoredProposalDocPdf(doc: ProposalDoc): Promise<Buffer<ArrayBuffer>> {
  return (await renderStoredProposalDocPdfWithReport(doc)).pdf;
}

/**
 * Como `renderStoredProposalDocPdf`, mas diz também o que o PDF não leva:
 *
 * - `missingImages` — fotos PEDIDAS que não entraram: as que não resolveram do
 *   armazenamento (ou passaram do tecto de imagens por documento) MAIS as que
 *   resolveram e que o gerador não conseguiu desenhar. É uma AVARIA: a
 *   correcção é voltar a tentar ou recarregar a foto.
 * - `truncations` — conteúdo que chegou inteiro e que o DESENHO não mostra
 *   todo (a sétima foto de um mood board, a terceira linha do "Local"…). É uma
 *   ESCOLHA de composição a morder o conteúdo: a correcção é editorial —
 *   tirar uma foto, criar outro mood board, encurtar um texto.
 *
 * Ficam separadas de propósito. Somá-las dava um número maior mas mais pobre:
 * a mensagem "N fotos não entraram" ficaria errada para texto cortado, e a
 * pessoa deixaria de saber se tem de recarregar alguma coisa ou de reescrever.
 * O que as une — e é o que interessa — é que ambas TÊM DE APARECER no aviso
 * antes de a proposta seguir para o cliente.
 */
export async function renderStoredProposalDocPdfWithReport(
  doc: ProposalDoc,
): Promise<{ pdf: Buffer<ArrayBuffer>; missingImages: number; truncations: DocTruncation[] }> {
  // Fill the studio's fixed boilerplate (condições, observações, faseamento,
  // cancelamento) + event-token substitution so the caller only supplies what
  // varies per event.
  const withDefaults = withProposalDefaults(doc);
  const { doc: resolved, missing } = await resolveImages(withDefaults);
  // As duas contagens não se sobrepõem: o gerador só vê as fotos que
  // RESOLVERAM (as outras já foram descartadas aqui e contadas em `missing`),
  // por isso uma foto em falta nunca é também contada como cortada.
  const {
    bytes: pdfBytes,
    truncations,
    undrawnImages,
  } = await renderProposalDocPdfWithReport(resolved);
  // A foto que RESOLVEU e que o gerador não conseguiu desenhar (um WebP antigo
  // da biblioteca, bytes corrompidos) some-se aqui às que nem chegaram: para
  // quem vai enviar a proposta é a mesma coisa — uma foto que o cliente devia
  // ver e não vê, com a mesma correcção (tentar de novo, ou recarregá-la). Sem
  // esta soma era a perda MAIS invisível de todas: a foto existia, descarregava
  // bem, e desaparecia calada no desenho.
  const emFalta = missing + undrawnImages;
  if (emFalta > 0) {
    log.error("proposal-doc-render: PDF gerado com fotos EM FALTA", null, {
      emFalta,
      naoResolvidas: missing,
      naoDesenhadas: undrawnImages,
      ref: doc.ref,
    });
  }
  if (truncations.length > 0) {
    log.error("proposal-doc-render: PDF gerado com conteúdo CORTADO", null, {
      cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
      ref: doc.ref,
    });
  }
  return { pdf: Buffer.from(pdfBytes), missingImages: emFalta, truncations };
}
