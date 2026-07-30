/**
 * Biblioteca de Temas — a IDENTIDADE de uma foto (client-safe).
 *
 * O problema: a Catarina larga a mesma pasta duas vezes e o tema fica com tudo
 * a dobrar. Os ficheiros são guardados com nome UUID, portanto o nome não
 * distingue nada, e os bytes que sobem não são os do disco dela — a foto é
 * preparada no navegador antes de subir (`image-prep.ts`).
 *
 * A identidade que se escolheu é o SHA-256 do FICHEIRO ORIGINAL, calculado no
 * navegador ANTES de preparar a imagem, e o sítio onde ela vive é o NOME DO
 * FICHEIRO no Storage: `<tema>/<32 hex>.jpg`. Três consequências, e são elas
 * que justificam a escolha:
 *
 *  1. NÃO NASCE UMA SEGUNDA LISTA. Listar a pasta — coisa que a `countThemeFiles`
 *     já faz — devolve de graça o índice do que lá está. Não há nada para
 *     sincronizar e nada que possa dessincronizar.
 *  2. A GARANTIA FICA ATÓMICA. O `uploadThemeImage` já escreve com
 *     `upsert: false`; com o nome a ser o resumo, "esta foto já cá está" deixa
 *     de ser uma verificação com corrida e passa a ser um 409 do Storage. Dois
 *     separadores a carregar a mesma pasta não conseguem duplicar nada.
 *  3. SOBREVIVE ÀS AFINAÇÕES. O resumo do ficheiro do disco não muda entre
 *     arrastos, entre versões do Chrome, nem quando a preparação é reafinada
 *     (o `COVER_MAX_EDGE` já foi de 3000 para 2200 — se a identidade fosse a
 *     dos bytes preparados, essa afinação teria apagado o histórico todo).
 *
 * MEDIDO NESTA CAIXA, em Chromium e contexto seguro (127.0.0.1:3412), sobre
 * uma foto 4032×3024 de 8,1 MB com ruído de alta frequência (o pior caso para
 * comprimir), mediana de 7 corridas:
 *
 *   sha256 do ficheiro original …………………  42,9 ms  (181 MB/s)
 *   preparar (2200 px q0.90 + miniatura) …  337,0 ms
 *   resultado preparado ……………………………  1,12 MB
 *
 * Ou seja: resumir custa ~13 % do que custa preparar a MESMA foto. Por isso o
 * resumo é calculado ANTES de preparar — cada repetida apanhada nesta ordem
 * poupa a preparação *e* o upload; ao contrário, poupava só o upload. A troca
 * compensa a partir de ~13 % de repetidas no lote; no caso real (uma pasta
 * largada duas vezes, metade repetida em 300 fotos) são 4,3 s de resumos
 * contra 16,9 s de CPU e 160 MB que não sobem (≈67 s a 20 Mbit/s).
 *
 * O LIMITE HONESTO: isto reconhece o mesmo FICHEIRO, não a mesma FOTOGRAFIA.
 * Duas exportações do mesmo RAW, ou o HEIC e o JPEG da mesma foto, são
 * ficheiros diferentes e passam os dois. É deliberado: uma comparação
 * perceptual apanharia esses casos ao preço de falsos positivos entre duas
 * fotos genuinamente diferentes da mesma mesa posta — e saltar em silêncio uma
 * foto que É diferente é o pior resultado possível numa biblioteca de fotos.
 *
 * Este módulo é puro e não importa nada de servidor: o ecrã e as rotas têm de
 * aplicar EXATAMENTE a mesma regra (é o mesmo motivo por que o
 * `normalizedThemeName` vive em `theme-types.ts`).
 */

/**
 * Caracteres hexadecimais do resumo guardado no nome: 16 bytes do SHA-256.
 *
 * 32 e não 64 porque o nome viaja em CADA listagem da pasta: 4000 fotos × 32 B
 * são 128 KB por varrimento poupados. A probabilidade de colisão com 10⁶ fotos
 * é ~10⁻²⁷ — muitas ordens de grandeza abaixo de qualquer outra coisa que
 * possa correr mal aqui.
 */
export const FINGERPRINT_HEX = 32;

/** O resumo tem esta forma e mais nenhuma (minúsculas — é assim que é escrito). */
const FINGERPRINT_RE = /^[0-9a-f]{32}$/;

/**
 * Nome de ficheiro `<32 hex>` ou `<32 hex>-<sufixo>`, com extensão de imagem.
 *
 * O sufixo é o que uma cópia FORÇADA leva ("Adicionar mesmo assim"). Analisá-lo
 * e descartá-lo é o que faz uma cópia forçada continuar a contar como "esta
 * foto está no tema" para o arrasto seguinte — em vez de abrir um buraco
 * permanente no índice, que era o que acontecia se a força voltasse ao UUID.
 */
const FILE_NAME_RE = /^([0-9a-f]{32})(?:-[0-9a-z]{1,8})?\.(?:jpe?g|png|webp)$/i;

/** Isto é um resumo bem formado? (o guarda de tudo o que vem do cliente) */
export function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_RE.test(value);
}

/**
 * O resumo escondido num nome de ficheiro da pasta, ou `null`.
 *
 * `null` é o caso NORMAL da biblioteca que já existe: tudo o que foi carregado
 * antes desta funcionalidade tem nome UUID. Um UUID nunca pode ser lido como
 * resumo — começa por 8 hex e um hífen, não por 32 hex — e há um teste que o
 * fixa, porque confundir os dois faria uma foto antiga "ocupar" a identidade
 * de uma foto nova.
 */
export function fingerprintOfFileName(name: string): string | null {
  const m = FILE_NAME_RE.exec(name);
  return m ? m[1].toLowerCase() : null;
}

/** O nome (sem extensão) com que uma foto é guardada. `suffix` só na cópia
 *  forçada — ver `FILE_NAME_RE`. */
export function fileNameFor(hash: string, suffix?: string): string {
  return suffix ? `${hash}-${suffix}` : hash;
}

/** Bytes → hex minúsculo. */
function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * O resumo de um ficheiro (ou de quaisquer bytes).
 *
 * Devolve `null` — nunca lança — quando o `crypto.subtle` não existe. Ele
 * EXIGE contexto seguro (confirmado a partir da falha do próprio ensaio em
 * `about:blank`): em produção (https) e em localhost há sempre, mas num
 * ambiente inseguro a deteção de repetidas tem de simplesmente DESLIGAR-SE, e
 * não partir o carregamento todo.
 */
export async function fingerprintBlob(blob: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof blob?.arrayBuffer !== "function") return null;
  try {
    const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
    return toHex(new Uint8Array(digest).subarray(0, FINGERPRINT_HEX / 2));
  } catch {
    return null;
  }
}

/**
 * O eTag de um objeto do Storage normalizado como MD5 do conteúdo — ou `null`.
 *
 * A REDE SECUNDÁRIA, e só isso. O `list()` do Supabase devolve `metadata.eTag`
 * por objeto, que é o MD5 do que lá está guardado. Como a preparação da imagem
 * é determinista dentro de uma versão de browser (MEDIDO nesta caixa: duas
 * preparações da mesma foto dão bytes idênticos), o MD5 dos bytes preparados
 * de uma foto que ela volte a largar BATE com o eTag da cópia antiga — e é
 * assim que se apanham as repetidas da biblioteca antiga, que têm nome UUID e
 * não têm resumo nenhum. Sem migração e sem backfill.
 *
 * ⚠️ POR VERIFICAR CONTRA UM SUPABASE REAL: que o eTag desta instalação seja
 * mesmo o MD5 do conteúdo. A afirmação vem da tipagem e do JSDoc do
 * @supabase/storage-js 2.106.2 (`interface FileMetadata`), e não há Supabase
 * nesta caixa para a confirmar. Se não bater, esta rede nunca casa e não
 * acontece nada — o desenho principal (o nome É o resumo) não depende dela.
 *
 * Descarta-se tudo o que não seja 32 hex: um eTag de carregamento multipart
 * traz um `-<n>` no fim e NÃO é o MD5 do conteúdo, e uma instalação onde o
 * eTag tenha outro formato simplesmente nunca casa. Falha sempre para o lado
 * seguro — deixa passar uma repetida, nunca salta uma foto boa.
 */
export function md5OfETag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/^W\//i, "").replace(/"/g, "").trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(clean) ? clean : null;
}

/** Sufixo aleatório de uma cópia forçada. Aleatório e não `-2` para não ser
 *  preciso sondar o Storage à procura do próximo número livre. */
export function forcedSuffix(): string {
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
}
