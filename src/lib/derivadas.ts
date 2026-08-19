import "server-only";
import sharp from "sharp";
import { getSupabase } from "@/lib/supabase";
import {
  PROPOSAL_BUCKET,
  PROPOSAL_THUMB_BUCKET,
  uploadProposalThumb,
} from "@/lib/proposal-storage";
import {
  THEME_BUCKET,
  THEME_THUMB_BUCKET,
  THEME_MICRO_BUCKET,
  ehRefDeTema,
  caminhoDoRefDeTema,
} from "@/lib/theme-ref";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS QUE NÃO TÊM MINIATURA — contar, e gerar aos poucos
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotos carregadas DEPOIS de as miniaturas existirem trazem as suas: o
 * navegador fabrica-as na mesma descodificação que já faz para encolher o
 * original, e sobem no mesmo pedido. As que ficaram para trás não têm nenhuma,
 * e para essas as grelhas caem para o ORIGINAL — 2200 px, ~2,6 MB, para
 * desenhar uma célula de 150 px.
 *
 * O código já mitiga o sintoma: há um tecto de três downloads pesados em voo
 * (`ThemePicker.tsx`, `Temas.tsx`), e está medido que baixou a primeira foto de
 * 26 s para 1,4 s. O que nunca foi feito foi tratar a CAUSA. Enquanto as fotos
 * antigas não tiverem miniatura, a grelha é lenta por construção.
 *
 * ── PORQUE É QUE ISTO EXISTE EM VEZ DE SÓ O GUIÃO ─────────────────────────
 * Há `scripts/derivadas-em-falta.mjs`, que faz o mesmo no terminal. Mas quem
 * precisa disto trabalha no back office e no telemóvel — pedir-lhe um terminal,
 * um `.env.local` e uma variável de ambiente é pedir-lhe que não o faça. Aqui,
 * as credenciais já estão no servidor e a operação é um botão.
 *
 * Os dois têm de dizer o mesmo. Os lados e as qualidades estão nas mesmas
 * constantes em ambos, com o sítio de onde vêm escrito ao lado; se divergirem,
 * uma foto migrada fica diferente de uma foto nova e ninguém percebe porquê.
 *
 * ── PORQUE É QUE GERA AOS POUCOS ──────────────────────────────────────────
 * Uma função serverless tem minutos, não horas, e isto pode ter milhares de
 * fotografias pela frente. Um pedido que tentasse tudo de uma vez seria morto a
 * meio — e morrer a meio sem dizer onde ia é o que faz ninguém voltar a tentar.
 * Por isso cada chamada faz um LOTE e diz quantas ficaram: quem chama repete
 * até dar zero, e uma sessão interrompida retoma sozinha na chamada seguinte.
 */

/** O Storage devolve no máximo 1000 por página. */
const PAGINA = 500;

/**
 * Quantas fotos por chamada. Cada uma é um download do original, um `sharp` e
 * um upload — na ordem dos 300–800 ms. Vinte e cinco cabem com folga no tecto
 * de uma função, e um lote pequeno é o que deixa a barra de progresso andar de
 * verdade em vez de saltar de 0 para 100.
 */
export const LOTE = 25;

/**
 * As famílias, com o lado e a qualidade de cada derivada.
 *
 * Os números são os MESMOS que o navegador usa (`image-worker.ts`:
 * `MICRO_EDGE = 96`; a miniatura a 400). Os nomes dos buckets vêm das
 * constantes de quem os define, e não escritos à mão: um bucket com o nome
 * trocado aqui produziria derivadas num sítio onde ninguém as vai procurar, e
 * a grelha continuaria lenta com o painel a dizer que estava tudo bem.
 */
/**
 * O lado e a qualidade da MINIATURA, num sítio só.
 *
 * Estavam escritos duas vezes (uma por família) e agora são lidos também pela
 * geração a pedido (`miniaturaAPedido`). Três cópias do mesmo 400/78 seriam
 * três oportunidades de a mesma fotografia sair diferente conforme o caminho
 * por onde foi fabricada.
 */
const MINIATURA = { lado: 400, qualidade: 78 } as const;

const FAMILIAS = [
  {
    origem: THEME_BUCKET,
    derivadas: [
      { bucket: THEME_THUMB_BUCKET, ...MINIATURA },
      { bucket: THEME_MICRO_BUCKET, lado: 96, qualidade: 65 },
    ],
  },
  {
    origem: PROPOSAL_BUCKET,
    derivadas: [{ bucket: PROPOSAL_THUMB_BUCKET, ...MINIATURA }],
  },
] as const;

/** Marcadores de pasta e ficheiros escondidos não são fotografias. */
const ehFoto = (nome: string) => /\.(jpe?g|png|webp)$/i.test(nome) && !nome.startsWith(".");

type Cliente = NonNullable<ReturnType<typeof getSupabase>>;

/** As pastas de um bucket (os temas, ou os pedidos). */
async function pastas(sb: Cliente, bucket: string): Promise<string[]> {
  const { data, error } = await sb.storage.from(bucket).list("", { limit: PAGINA });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  // Uma "pasta" no Storage é uma entrada sem `id`.
  return (data ?? []).filter((e) => !e.id).map((e) => e.name);
}

/** Os ficheiros de uma pasta, paginados até ao fim. */
async function ficheiros(sb: Cliente, bucket: string, pasta: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await sb.storage.from(bucket).list(pasta, { limit: PAGINA, offset });
    if (error) throw new Error(`${bucket}/${pasta}: ${error.message}`);
    const lote = data ?? [];
    out.push(...lote.filter((e) => ehFoto(e.name)).map((e) => `${pasta}/${e.name}`));
    if (lote.length < PAGINA) return out;
  }
}

export interface LinhaDeContagem {
  /** `theme-assets → theme-thumbs`, para o painel dizer de que se trata. */
  origem: string;
  destino: string;
  pasta: string;
  fotos: number;
  emFalta: number;
}

export interface Contagem {
  linhas: LinhaDeContagem[];
  fotos: number;
  emFalta: number;
  /** Buckets que não deu para listar — ditos, não escondidos. */
  avisos: string[];
}

/**
 * Percorre tudo e diz o que falta. **Não escreve nada.**
 *
 * O trabalho é uma listagem por pasta e por bucket de derivada, comparadas em
 * memória — e não uma pergunta por ficheiro. Com quatrocentas fotos por tema, é
 * a diferença entre duas idas e oitocentas.
 */
export async function contarDerivadasEmFalta(): Promise<Contagem> {
  const sb = getSupabase();
  if (!sb) return { linhas: [], fotos: 0, emFalta: 0, avisos: ["Storage não configurado."] };

  const linhas: LinhaDeContagem[] = [];
  const avisos: string[] = [];
  let fotos = 0;
  let emFalta = 0;

  for (const familia of FAMILIAS) {
    let asPastas: string[];
    try {
      asPastas = await pastas(sb, familia.origem);
    } catch (e) {
      avisos.push(`${familia.origem}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const pasta of asPastas) {
      const caminhos = await ficheiros(sb, familia.origem, pasta);
      if (caminhos.length === 0) continue;
      fotos += caminhos.length;
      for (const derivada of familia.derivadas) {
        const jaLa = new Set(await ficheiros(sb, derivada.bucket, pasta).catch(() => []));
        const faltam = caminhos.filter((c) => !jaLa.has(c)).length;
        emFalta += faltam;
        linhas.push({
          origem: familia.origem,
          destino: derivada.bucket,
          pasta,
          fotos: caminhos.length,
          emFalta: faltam,
        });
      }
    }
  }

  linhas.sort((a, b) => b.emFalta - a.emFalta);
  return { linhas, fotos, emFalta, avisos };
}

export interface ResultadoDoLote {
  geradas: number;
  falhas: string[];
  /** Quantas ficaram por fazer depois deste lote. Zero = acabou. */
  restantes: number;
}

/**
 * Gera até `LOTE` derivadas em falta e diz quantas ficaram.
 *
 * **Nunca substitui o que já existe** (`upsert: false`), portanto repetir é
 * seguro e é assim que se retoma. E é melhor esforço por fotografia: uma que
 * falhe não pára as outras — uma execução que morre à terceira de quatrocentas
 * obriga a recomeçar, e recomeçar é o que faz ninguém correr isto.
 */
export async function gerarLoteDeDerivadas(): Promise<ResultadoDoLote> {
  const sb = getSupabase();
  if (!sb) return { geradas: 0, falhas: ["Storage não configurado."], restantes: 0 };

  const falhas: string[] = [];
  let geradas = 0;
  let restantes = 0;

  for (const familia of FAMILIAS) {
    let asPastas: string[];
    try {
      asPastas = await pastas(sb, familia.origem);
    } catch {
      continue;
    }
    for (const pasta of asPastas) {
      const caminhos = await ficheiros(sb, familia.origem, pasta);
      if (caminhos.length === 0) continue;
      for (const derivada of familia.derivadas) {
        const jaLa = new Set(await ficheiros(sb, derivada.bucket, pasta).catch(() => []));
        const faltam = caminhos.filter((c) => !jaLa.has(c));
        for (const caminho of faltam) {
          if (geradas >= LOTE) {
            // Já se fez o lote: daqui para a frente só se CONTA, para quem
            // chama saber se vale a pena voltar.
            restantes += 1;
            continue;
          }
          const r = await gerarUma(sb, familia.origem, caminho, derivada);
          if (r) geradas += 1;
          else falhas.push(`${derivada.bucket}/${caminho}`);
        }
      }
    }
  }

  if (falhas.length > 0) {
    log.warn("derivadas: algumas não foram geradas", { quantas: falhas.length });
  }
  return { geradas, falhas, restantes };
}

async function gerarUma(
  sb: Cliente,
  origem: string,
  caminho: string,
  alvo: { bucket: string; lado: number; qualidade: number },
): Promise<boolean> {
  try {
    const { data, error } = await sb.storage.from(origem).download(caminho);
    if (error || !data) return false;
    const bytes = Buffer.from(await data.arrayBuffer());
    const derivada = await sharp(bytes)
      // `rotate()` sem argumento aplica a orientação do EXIF. Sem isto, uma
      // foto de telemóvel deitada sai com os lados trocados face ao original —
      // e a miniatura ficava com outra proporção do que a grelha reserva.
      .rotate()
      // `withoutEnlargement`: uma foto já menor do que o alvo fica como está.
      // Ampliar produzia uma miniatura MAIOR do que o original, que é o
      // contrário do que isto serve.
      .resize(alvo.lado, alvo.lado, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: alvo.qualidade, mozjpeg: true })
      .toBuffer();
    const { error: erroSubida } = await sb.storage
      .from(alvo.bucket)
      .upload(caminho, derivada, { contentType: "image/jpeg", upsert: false });
    return !erroSubida;
  } catch {
    return false;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MINIATURA DE UMA FOTO SÓ, FABRICADA À PRIMEIRA VEZ QUE ALGUÉM OLHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O lote de cima trata da biblioteca inteira, e trata bem — mas é um BOTÃO, e
 * um botão que ninguém carregou não gerou miniatura nenhuma. Enquanto isso, a
 * grelha do estúdio de propostas cai para o ORIGINAL: medido num telemóvel a
 * 1,6 Mbps, cada célula puxa **1099 KB** (26,4 MB nas 24), a primeira
 * fotografia chega aos **34,0 s** e a grelha que está no ecrã só fica completa
 * aos **67,6 s**. Com miniatura: 20 KB, e 2,5 s. Uma proposta antiga é o caso
 * onde isso acontece, e é o caso mais comum: as fotos que ela já lá tem foram
 * carregadas antes de as miniaturas existirem.
 *
 * Isto gera UMA, a pedido, e **guarda-a** no bucket das miniaturas. Portanto o
 * custo paga-se uma vez por fotografia e não uma vez por abertura: da segunda
 * vez em diante o `listProposalImages` já a encontra e devolve o URL assinado
 * directo do Storage, sem passar por aqui.
 *
 * Devolve os bytes para quem chama os poder servir já — se fosse só «gera», a
 * rota tinha de descarregar do Storage aquilo que acabou de lá pôr.
 *
 * `null` quer dizer «não deu», e não é motivo para erro nenhum a jusante: quem
 * chama cai para o original, que é o comportamento de sempre.
 */
export async function miniaturaAPedido(caminho: string): Promise<Buffer | null> {
  return (await miniaturaAPedidoComMotivo(caminho)).bytes;
}

/**
 * ── PORQUE É QUE ISTO PASSOU A DIZER O MOTIVO ─────────────────────────────
 *
 * Este endereço é o URL PRINCIPAL de todas as fotografias que ainda não têm
 * miniatura guardada: é ele que o `/assets` devolve em `thumbUrl` (ver
 * `miniaturaAPedidoUrl`). Um `null` seco daqui vira um 404 na rota, a célula
 * cai para o original e — se esse também não vier — o ecrã diz «Imagem
 * guardada / Não consegui mostrá-la neste ecrã» e mais nada.
 *
 * Era isso que estava: seis avarias diferentes — sem Storage, caminho
 * inválido, o original que já não lá está, o Storage sem responder, o `sharp`
 * sem a sua biblioteca nativa — todas indistinguíveis, todas caladas. Em
 * produção isso custou um dia a diagnosticar.
 *
 * O 404 FICA: é ele que faz a célula ter plano B, e uma derivada é por
 * definição descartável. O que muda é o silêncio.
 */
export type MotivoDaMiniatura =
  | "ok"
  | "sem-storage"
  | "caminho-invalido"
  | "original-em-falta"
  | "storage-sem-resposta"
  | "sharp-falhou";

export interface ResultadoDaMiniatura {
  bytes: Buffer | null;
  motivo: MotivoDaMiniatura;
  /** O que o Storage ou o `sharp` disseram, para os registos. Nunca para o ecrã. */
  detalhe?: string;
}

export async function miniaturaAPedidoComMotivo(caminho: string): Promise<ResultadoDaMiniatura> {
  const sb = getSupabase();
  if (!sb || !caminho) return { bytes: null, motivo: "sem-storage" };
  const daBiblioteca = ehRefDeTema(caminho);
  const origem = daBiblioteca ? THEME_BUCKET : PROPOSAL_BUCKET;
  const destino = daBiblioteca ? THEME_THUMB_BUCKET : PROPOSAL_THUMB_BUCKET;
  const chave = daBiblioteca ? caminhoDoRefDeTema(caminho) : caminho;
  if (!chave || chave.includes("..")) return { bytes: null, motivo: "caminho-invalido" };

  // Já lá está? É o caso normal a partir da segunda vez, e custa um download em
  // vez de um download + um `sharp` + um upload.
  try {
    const { data } = await sb.storage.from(destino).download(chave);
    if (data) return { bytes: Buffer.from(await data.arrayBuffer()), motivo: "ok" };
  } catch {
    /* segue para gerar */
  }

  try {
    const { data, error } = await sb.storage.from(origem).download(chave);
    if (error || !data) {
      // Duas coisas diferentes com a mesma cara, e com resoluções opostas: o
      // ficheiro que já não está no bucket, e o Storage que não respondeu. A
      // primeira é uma foto a recuperar; a segunda é um projecto em pausa.
      const dito = error?.message ?? "sem dados";
      const semResposta = /fetch failed|network|timeout|ENOTFOUND|ECONNREFUSED/i.test(dito);
      return {
        bytes: null,
        motivo: semResposta ? "storage-sem-resposta" : "original-em-falta",
        detalhe: dito,
      };
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    // Os MESMOS números do lote e do navegador (`image-worker.ts`): uma
    // miniatura fabricada aqui tem de ser indistinguível de uma fabricada lá,
    // ou a mesma foto muda de aspecto conforme o caminho por onde veio.
    const derivada = await sharp(bytes)
      .rotate()
      .resize(MINIATURA.lado, MINIATURA.lado, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: MINIATURA.qualidade, mozjpeg: true })
      .toBuffer();
    // Guardar é melhor esforço: falhar aqui só quer dizer que a próxima
    // abertura volta a pagar o `sharp`. NUNCA impede esta de ser servida.
    //
    // Pelo `uploadProposalThumb` e não por um `upload` cru, para a família das
    // propostas: é ele que GARANTE O BUCKET. Numa instalação onde nunca foi
    // carregada uma foto com miniatura, o `proposal-thumbs` ainda não existe —
    // e sem isto cada abertura voltava a pagar o `sharp` de cada fotografia,
    // para sempre, sem nada no ecrã a dizer porquê.
    if (daBiblioteca) {
      const { error: erroSubida } = await sb.storage
        .from(destino)
        .upload(chave, derivada, { contentType: "image/jpeg", upsert: false });
      if (erroSubida && !/exist/i.test(erroSubida.message)) {
        log.warn("derivadas: miniatura a pedido não ficou guardada", {
          destino,
          erro: erroSubida.message,
        });
      }
    } else {
      await uploadProposalThumb(chave, derivada, "image/jpeg");
    }
    return { bytes: derivada, motivo: "ok" };
  } catch (e) {
    // Chegar aqui é quase sempre o `sharp`: o download já respondeu acima. É a
    // mesma avaria que deitou /api/temas abaixo (o `.so` do libvips que não
    // viaja com a função), e por isso tem nome próprio em vez de um `null`.
    const dito = e instanceof Error ? e.message : String(e);
    log.warn("derivadas: miniatura a pedido falhou", { caminho: chave, erro: dito });
    return { bytes: null, motivo: "sharp-falhou", detalhe: dito.slice(0, 300) };
  }
}
