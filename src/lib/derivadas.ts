import "server-only";
import sharp from "sharp";
import { getSupabase } from "@/lib/supabase";
import { PROPOSAL_BUCKET, PROPOSAL_THUMB_BUCKET } from "@/lib/proposal-storage";
import { THEME_BUCKET, THEME_THUMB_BUCKET, THEME_MICRO_BUCKET } from "@/lib/theme-ref";
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
const FAMILIAS = [
  {
    origem: THEME_BUCKET,
    derivadas: [
      { bucket: THEME_THUMB_BUCKET, lado: 400, qualidade: 78 },
      { bucket: THEME_MICRO_BUCKET, lado: 96, qualidade: 65 },
    ],
  },
  {
    origem: PROPOSAL_BUCKET,
    derivadas: [{ bucket: PROPOSAL_THUMB_BUCKET, lado: 400, qualidade: 78 }],
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
