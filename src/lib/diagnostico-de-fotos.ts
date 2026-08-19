import "server-only";
import { getSupabase, papelDaChaveSupabase } from "./supabase";
import { PROPOSAL_BUCKET, PROPOSAL_THUMB_BUCKET } from "./proposal-storage";
import { THEME_BUCKET, THEME_THUMB_BUCKET } from "./theme-ref";
import { origensDeImagem, permiteOrigem } from "./csp-imagens";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE A FOTOGRAFIA NÃO APARECE — as nove maneiras, e qual delas é
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que aconteceu em produção: nove células de um mood board, e as nove a
 * dizer «Imagem guardada / Não consegui mostrá-la neste ecrã». Do lado do
 * servidor, NADA. Nenhum 500, nenhum aviso, nenhuma linha nos registos — o
 * caminho inteiro das imagens estava a falhar num sítio onde o servidor nem
 * chega a ser chamado (ver `csp-imagens.ts`), e não havia por onde começar.
 *
 * Um dia perdido, e o mesmo desenho de resposta que a rota dos temas já tinha:
 * uma avaria sem nome é uma avaria que ninguém resolve.
 *
 * ── AS NOVE CAUSAS, E COMO CADA UMA SE CONFIRMA OU SE ELIMINA ─────────────
 *
 *  1. `csp-sem-storage`      a `img-src` da política servida não nomeia a
 *                            origem do Storage → o browser recusa TODAS as
 *                            fotos antes de as pedir. Confirma-se lendo a
 *                            política que este próprio deployment devolve e
 *                            perguntando-lhe se deixa passar um URL do Storage.
 *                            **Foi esta.**
 *  2. `sem-configuracao`     faltam `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
 *                            → não há sequer cliente. Lê-se do ambiente.
 *  3. `chave-sem-permissao`  a chave é a `anon`: as listagens vêm VAZIAS sem
 *                            erro e as assinaturas são recusadas. Lê-se o papel
 *                            declarado na própria chave, sem rede.
 *  4. `bucket-em-falta`      o bucket das fotos não existe nesta instalação.
 *                            Confirma-se listando os buckets.
 *  5. `assinatura-recusada`  o Storage responde mas não assina (chave rodada,
 *                            projecto em pausa). Confirma-se pedindo uma
 *                            assinatura a sério.
 *  6. `ficheiro-em-falta`    assinar NÃO verifica que o objecto existe: o URL
 *                            sai bem formado e dá 400/404. Confirma-se
 *                            BUSCANDO os bytes do URL que se acabou de assinar.
 *  7. `storage-sem-resposta` o projecto está em pausa ou a rede não vai lá.
 *                            Confirma-se pela própria ida ao Storage.
 *  8. `sharp-sem-libvips`    a rota das miniaturas rebenta INTEIRA
 *                            (`FUNCTION_INVOCATION_FAILED`) antes de correr uma
 *                            linha, porque o `.so` do libvips não viajou com a
 *                            função. Confirma-se codificando um pixel.
 *  9. `assinatura-expirada`  o URL que o estúdio guardou no `localStorage` já
 *                            morreu (as fotos da biblioteca assinam a 6 h).
 *                            Esta vive no BROWSER — o servidor não a pode
 *                            observar — e por isso é dita como causa possível
 *                            em vez de verificada aqui. Quem a trata é o
 *                            `assinatura.ts` do estúdio.
 *
 * ── O QUE ISTO NÃO É ──────────────────────────────────────────────────────
 * Não é um substituto do `estado-do-armazenamento.ts`, que responde «o que eu
 * gravar agora fica guardado?». Este responde a outra pergunta, e é a que
 * ninguém sabia responder: «porque é que aquela fotografia não aparece?».
 */

export type CausaDeFotoInvisivel =
  | "csp-sem-storage"
  | "sem-configuracao"
  | "chave-sem-permissao"
  | "bucket-em-falta"
  | "assinatura-recusada"
  | "ficheiro-em-falta"
  | "storage-sem-resposta"
  | "sharp-sem-libvips"
  | "assinatura-expirada";

export interface AvariaDeFoto {
  causa: CausaDeFotoInvisivel;
  /** A classe do problema, numa linha. */
  titulo: string;
  /** O passo seguinte, com o nome da variável ou do painel. Nunca «erro». */
  oQueFazer: string;
}

/**
 * As frases, juntas num sítio só — é assim que se vê, de uma vez, que nenhuma
 * delas sai daqui como «ocorreu um erro».
 */
export const CATALOGO: Record<CausaDeFotoInvisivel, AvariaDeFoto> = {
  "csp-sem-storage": {
    causa: "csp-sem-storage",
    titulo: "A política de segurança deste build não conhece o Storage",
    oQueFazer:
      "A directiva img-src servida por este deployment não nomeia a origem do Supabase Storage, " +
      "por isso o browser RECUSA todas as fotografias antes de as pedir — e por isso não há " +
      "registo nenhum no servidor. A política é escrita no BUILD (next.config.ts → " +
      ".next/routes-manifest.json), portanto não basta ter SUPABASE_URL no ambiente de execução: " +
      "define-a também no ambiente de BUILD (Vercel → Settings → Environment Variables, com o " +
      "ambiente «Production» marcado e a variável NÃO sensível) e volta a implantar. As " +
      "fotografias estão todas guardadas: nenhuma se perdeu.",
  },
  "sem-configuracao": {
    causa: "sem-configuracao",
    titulo: "O Storage não está ligado nesta instalação",
    oQueFazer:
      "Faltam as variáveis SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY, por isso não há a quem " +
      "pedir as fotografias. No Supabase → Project Settings → API copia o URL do projecto e a " +
      "chave service_role para o Vercel → Settings → Environment Variables.",
  },
  "chave-sem-permissao": {
    causa: "chave-sem-permissao",
    titulo: "A chave em uso não vê as fotografias",
    oQueFazer:
      "A chave configurada é a pública (anon). Com as políticas de segurança ligadas, essa chave " +
      "lê ZERO ficheiros sem dar erro nenhum — o que no ecrã é indistinguível de uma proposta sem " +
      "fotos. No Supabase → Project Settings → API copia a chave service_role (a secreta) e " +
      "substitui SUPABASE_SERVICE_ROLE_KEY.",
  },
  "bucket-em-falta": {
    causa: "bucket-em-falta",
    titulo: "Falta um dos baldes das fotografias",
    oQueFazer:
      "Um dos buckets do Storage não existe nesta instalação. Os das propostas nascem sozinhos no " +
      "primeiro carregamento; se falta o das miniaturas, as células caem para o original (mais " +
      "lentas, mas visíveis). Carrega uma fotografia numa proposta, ou corre o painel «Miniaturas» " +
      "do back office, e ele é criado.",
  },
  "assinatura-recusada": {
    causa: "assinatura-recusada",
    titulo: "O Storage recusou assinar",
    oQueFazer:
      "O Supabase respondeu mas não emitiu o URL assinado — quase sempre é uma chave rodada no " +
      "painel e não actualizada aqui, ou o projecto em pausa. Abre o painel do Supabase: se disser " +
      "«Paused», carrega em «Restore project»; senão, volta a copiar a chave service_role. As " +
      "fotografias não foram tocadas.",
  },
  "ficheiro-em-falta": {
    causa: "ficheiro-em-falta",
    titulo: "O URL está bem formado e o ficheiro não está lá",
    oQueFazer:
      "Assinar um caminho NÃO verifica que o objecto existe: o Storage devolve um URL perfeito " +
      "para um ficheiro que já não está lá, e o browser recebe 400/404. Se isto acontecer a uma " +
      "foto só, é essa fotografia que falta no bucket; se acontecer a todas, o caminho mudou.",
  },
  "storage-sem-resposta": {
    causa: "storage-sem-resposta",
    titulo: "O Storage não respondeu",
    oQueFazer:
      "Não foi possível falar com o Storage do Supabase — o projecto pode estar em pausa " +
      "(acontece a um projecto sem uso durante uns dias) ou fora de serviço. Abre o painel do " +
      "Supabase e, se disser «Paused», carrega em «Restore project». Nada se perdeu.",
  },
  "sharp-sem-libvips": {
    causa: "sharp-sem-libvips",
    titulo: "A biblioteca de imagem não carrega nesta função",
    oQueFazer:
      "O `sharp` não conseguiu abrir a sua biblioteca nativa (libvips). É a mesma avaria que " +
      "deitou abaixo /api/temas: o rastreador de ficheiros do Next não vê um .so aberto por " +
      "dlopen, e a função rebenta inteira antes de correr uma linha. A correcção está no " +
      "next.config.ts (outputFileTracingIncludes) — confirma que lá continuam as duas linhas dos " +
      "pacotes @img/sharp-* e volta a implantar.",
  },
  "assinatura-expirada": {
    causa: "assinatura-expirada",
    titulo: "O URL guardado no browser já morreu",
    oQueFazer:
      "As fotos da Biblioteca de Temas assinam a 6 horas e o estúdio guarda o URL desenhado no " +
      "localStorage. Um rascunho aberto de um dia para o outro pede URLs que o Supabase já " +
      "recusa. Recarregar a página traz assinaturas frescas. (Esta vive no browser: o servidor " +
      "não a consegue observar daqui.)",
  },
};

/** Uma verificação feita: o que se perguntou e o que se obteve. */
export interface Verificacao {
  nome: string;
  /** `null` quando não se conseguiu apurar — que NÃO é o mesmo que falhar. */
  passou: boolean | null;
  detalhe: string;
}

export interface DiagnosticoDeFotos {
  /** Nada a corrigir: todas as verificações que se conseguiram fazer passaram. */
  ok: boolean;
  /** As avarias confirmadas, cada uma com o passo seguinte. */
  avarias: AvariaDeFoto[];
  /** O que foi perguntado e o que respondeu — a prova por trás das avarias. */
  verificacoes: Verificacao[];
  /** As causas que este diagnóstico não consegue observar daqui. */
  porObservar: AvariaDeFoto[];
  verificadoEm: string;
}

/** Os buckets de que as fotografias de uma proposta dependem. */
const BALDES = [PROPOSAL_BUCKET, PROPOSAL_THUMB_BUCKET, THEME_BUCKET, THEME_THUMB_BUCKET];

/** Tempo máximo por ida ao Storage. Um diagnóstico que estoira o limite da
 *  função não diagnostica nada — devolve o mesmo silêncio que veio corrigir. */
const ESPERA_MS = 6000;

const textoDoErro = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * A `img-src` de uma política, ou "" quando não a há.
 *
 * Separada para o teste poder dar-lhe a política à mão em vez de um servidor.
 */
export function imgSrcDe(politica: string | null | undefined): string {
  if (!politica) return "";
  return (
    politica
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.toLowerCase().startsWith("img-src")) ?? ""
  );
}

/**
 * Um URL do Storage desta instalação, para perguntar à política se o deixa
 * passar. Quando não se sabe a origem, usa-se um host da família do Supabase
 * alojado — que é o que a política tem de cobrir de qualquer maneira.
 */
export function urlDeAmostra(env: Record<string, string | undefined> = process.env): string {
  const base =
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "https://exemplo.supabase.co";
  try {
    return `${new URL(base).origin}/storage/v1/object/sign/${PROPOSAL_BUCKET}/x/y.jpg`;
  } catch {
    return `https://exemplo.supabase.co/storage/v1/object/sign/${PROPOSAL_BUCKET}/x/y.jpg`;
  }
}

/** O `sharp` carrega? É um pixel — o que se está a testar é o `dlopen`. */
async function sharpCarrega(): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const { default: sharp } = await import("sharp");
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    return { ok: true, detalhe: "o sharp codificou um pixel" };
  } catch (e) {
    return { ok: false, detalhe: textoDoErro(e) };
  }
}

/**
 * Corre as verificações que se conseguem fazer do lado do servidor e nomeia as
 * avarias.
 *
 * `politicaServida` é a Content-Security-Policy que este deployment devolve a
 * um browser — quem chama vai buscá-la à sua própria origem, porque é a ÚNICA
 * maneira honesta de saber o que o browser recebe: a política é escrita no
 * build e o ambiente de execução pode não ser o mesmo (foi exactamente essa
 * diferença que produziu a avaria).
 */
export async function diagnosticarFotos(opcoes?: {
  politicaServida?: string | null;
}): Promise<DiagnosticoDeFotos> {
  const verificacoes: Verificacao[] = [];
  const avarias: AvariaDeFoto[] = [];
  const marcar = (causa: CausaDeFotoInvisivel) => {
    if (!avarias.some((a) => a.causa === causa)) avarias.push(CATALOGO[causa]);
  };

  // ── 1. A política que o browser recebe ──────────────────────────────────
  const imgSrc = imgSrcDe(opcoes?.politicaServida);
  const amostra = urlDeAmostra();
  if (!imgSrc) {
    verificacoes.push({
      nome: "politica-de-seguranca",
      passou: null,
      detalhe:
        "não consegui ler a img-src servida por esta instalação; " +
        `a que este ambiente produziria é «${origensDeImagem().origens.join(" ")}»`,
    });
  } else if (permiteOrigem(imgSrc, amostra)) {
    verificacoes.push({
      nome: "politica-de-seguranca",
      passou: true,
      detalhe: `a img-src servida deixa passar ${new URL(amostra).origin}`,
    });
  } else {
    verificacoes.push({
      nome: "politica-de-seguranca",
      passou: false,
      detalhe: `a img-src servida NÃO deixa passar ${new URL(amostra).origin} — «${imgSrc}»`,
    });
    marcar("csp-sem-storage");
  }

  // ── 2. e 3. Configuração e papel da chave ───────────────────────────────
  const sb = getSupabase();
  const papel = papelDaChaveSupabase();
  if (!sb) {
    verificacoes.push({
      nome: "configuracao",
      passou: false,
      detalhe: "SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY em falta",
    });
    marcar("sem-configuracao");
    return acabar(verificacoes, avarias);
  }
  verificacoes.push({ nome: "configuracao", passou: true, detalhe: "as duas variáveis existem" });
  verificacoes.push({
    nome: "papel-da-chave",
    passou: papel === "service_role" ? true : papel === "anon" ? false : null,
    detalhe: `a chave declara o papel «${papel}»`,
  });
  if (papel === "anon") marcar("chave-sem-permissao");

  // ── 4. Os baldes existem? ───────────────────────────────────────────────
  let baldes: string[] | null = null;
  try {
    const { data, error } = await sb.storage.listBuckets();
    if (error) throw new Error(error.message);
    baldes = (data ?? []).map((b) => b.name);
    const faltam = BALDES.filter((b) => !baldes!.includes(b));
    verificacoes.push({
      nome: "baldes",
      passou: faltam.length === 0,
      detalhe: faltam.length === 0 ? BALDES.join(", ") : `faltam: ${faltam.join(", ")}`,
    });
    if (faltam.length > 0) marcar("bucket-em-falta");
  } catch (e) {
    verificacoes.push({ nome: "baldes", passou: false, detalhe: textoDoErro(e) });
    marcar("storage-sem-resposta");
    return acabar(verificacoes, avarias);
  }

  // ── 5. e 6. Assinar uma fotografia a sério, e ir buscar os bytes ────────
  //
  // Uma verificação que só assina não vale nada: assinar NÃO verifica que o
  // objecto existe. É preciso PUXAR os bytes — é o que o browser faz, e é onde
  // a diferença entre «o URL está bem» e «a foto está lá» aparece.
  const alvo = await primeiraFoto(sb);
  if (!alvo) {
    verificacoes.push({
      nome: "assinatura",
      passou: null,
      detalhe: "não há nenhuma fotografia guardada para experimentar",
    });
    return acabar(verificacoes, avarias);
  }
  let assinado = "";
  try {
    const { data, error } = await sb.storage.from(alvo.bucket).createSignedUrl(alvo.caminho, 60);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "sem URL");
    assinado = data.signedUrl;
    verificacoes.push({
      nome: "assinatura",
      passou: true,
      detalhe: `assinou ${alvo.bucket}/${alvo.caminho}`,
    });
  } catch (e) {
    verificacoes.push({ nome: "assinatura", passou: false, detalhe: textoDoErro(e) });
    marcar("assinatura-recusada");
    return acabar(verificacoes, avarias);
  }

  try {
    const res = await fetch(assinado, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    const tipo = res.headers.get("content-type") ?? "";
    const bem = res.ok && /^image\//i.test(tipo);
    verificacoes.push({
      nome: "bytes",
      passou: bem,
      detalhe: `o URL assinado respondeu ${res.status} ${tipo || "(sem content-type)"}`,
    });
    if (!bem) marcar("ficheiro-em-falta");
  } catch (e) {
    verificacoes.push({ nome: "bytes", passou: false, detalhe: textoDoErro(e) });
    marcar("storage-sem-resposta");
  }

  // ── 8. O sharp carrega nesta função? ────────────────────────────────────
  const s = await sharpCarrega();
  verificacoes.push({ nome: "sharp", passou: s.ok, detalhe: s.detalhe });
  if (!s.ok) marcar("sharp-sem-libvips");

  return acabar(verificacoes, avarias);
}

/** A primeira fotografia que se encontrar, para a experiência ser sobre um
 *  ficheiro REAL desta instalação e não sobre um caminho inventado. */
async function primeiraFoto(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
): Promise<{ bucket: string; caminho: string } | null> {
  for (const bucket of [PROPOSAL_BUCKET, THEME_BUCKET]) {
    try {
      const { data } = await sb.storage.from(bucket).list("", { limit: 20 });
      for (const pasta of data ?? []) {
        if (pasta.id) continue; // é um ficheiro à raiz, não uma pasta
        const { data: dentro } = await sb.storage
          .from(bucket)
          .list(pasta.name, { limit: 10 });
        const foto = (dentro ?? []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
        if (foto) return { bucket, caminho: `${pasta.name}/${foto.name}` };
      }
    } catch {
      /* segue para o bucket seguinte — quem falhou já foi contado acima */
    }
  }
  return null;
}

function acabar(verificacoes: Verificacao[], avarias: AvariaDeFoto[]): DiagnosticoDeFotos {
  const ok = avarias.length === 0;
  if (!ok) {
    log.warn("fotos: diagnóstico encontrou avarias", { causas: avarias.map((a) => a.causa) });
  }
  return {
    ok,
    avarias,
    verificacoes,
    // Dita mesmo quando está tudo bem: é a causa que o servidor NÃO consegue
    // observar, e quem está a investigar tem de saber que ela existe.
    porObservar: [CATALOGO["assinatura-expirada"]],
    verificadoEm: new Date().toISOString(),
  };
}
