import "server-only";
import { opcoesDeCarregamento } from "./cache-das-fotos";
import sharp, { type Sharp } from "sharp";
import { getSupabase } from "@/lib/supabase";
import {
  PROPOSAL_BUCKET,
  PROPOSAL_MID_BUCKET,
  PROPOSAL_THUMB_BUCKET,
  uploadProposalMid,
  uploadProposalThumb,
} from "@/lib/proposal-storage";
import {
  THEME_BUCKET,
  THEME_AVIF_BUCKET,
  THEME_AVIF_MICRO_BUCKET,
  THEME_MID_BUCKET,
  THEME_THUMB_BUCKET,
  THEME_MICRO_BUCKET,
  ehRefDeTema,
  caminhoDoRefDeTema,
} from "@/lib/theme-ref";
import { garantirBucketDeDerivadas } from "@/lib/theme-storage";
import { log } from "@/lib/logger";
import { MEDIA_LADO, MEDIA_QUALIDADE } from "@/lib/derivadas-medidas";

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

/**
 * A DERIVADA INTERMÉDIA, e a conta que a justifica.
 *
 * 1200 px porque é o que cobre os dois casos que interessam sem servir o
 * original: um telemóvel de 390 pontos com três pixéis por ponto pede ~1030, e
 * um computador com ecrã de retina em três colunas pede ~680. O original
 * (2200 px, ~2,6 MB) fica para a lupa, que é o único sítio onde os pixéis
 * todos valem os bytes.
 *
 * Qualidade 80 e não 78: esta é a que o casal vê em grande no telemóvel, e os
 * dois pontos custam ~15 KB numa imagem que já pesa 200.
 */
const MEDIA = { lado: MEDIA_LADO, qualidade: MEDIA_QUALIDADE } as const;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DERIVADAS SAEM EM WEBP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do briefing da biblioteca: «AVIF e WebP com fallback».
 *
 * ── Porquê WebP, e porquê sem fallback nenhum ─────────────────────────────
 *
 * Um WebP com a mesma qualidade percebida pesa **25 a 35% menos** do que um
 * JPEG mozjpeg. Nas 100 imagens que a lista de temas puxa (25 capas de 400 px e
 * 75 tiras de 96 px), é a diferença entre ~0,9 MB e ~0,6 MB.
 *
 * E não precisa de fallback: o WebP é suportado por todos os navegadores desde
 * 2020 — Safari desde o iOS 14, que é anterior ao telemóvel mais antigo com que
 * alguém abre uma proposta. Um `<picture>` aqui seria uma segunda assinatura,
 * um segundo bucket e um segundo caminho de erro, para cobrir navegadores que
 * já não existem.
 *
 * O AVIF é OUTRA conversa, e está por fazer de propósito: pesa mais uns 10–15%
 * a menos, mas o Safari só o lê desde o iOS 16, e estas fotografias não são só
 * dela — são as que um casal abre no telemóvel que tiver. Servi-lo sem
 * alternativa era arriscar uma página de proposta sem imagens; servi-lo COM
 * alternativa é um bucket a mais, uma assinatura a mais e um `<picture>` em
 * cada sítio. É trabalho a sério e tem de ser decidido, não assumido.
 *
 * ── O que acontece às derivadas que já existem ────────────────────────────
 *
 * Nada, e é de propósito. Ficam JPEG e continuam a servir: o navegador lê o
 * tipo da RESPOSTA, e não a extensão do caminho. As novas nascem WebP no mesmo
 * caminho. Quem quiser converter as antigas tem o botão «Gerar derivadas em
 * falta» — mas nada obriga, e uma migração forçada de 395 fotos não é o preço
 * certo por 30% de uma coisa que já é pequena.
 *
 * (A extensão do caminho passa a mentir sobre o conteúdo. Não incomoda ninguém:
 * uma derivada nunca é descarregada — o que se descarrega é sempre o original.)
 */
const FORMATO = {
  contentType: "image/webp",
  /**
   * A qualidade do WebP não é a mesma escala do JPEG.
   *
   * Um WebP q75 tem a qualidade percebida de um JPEG q80 e pesa menos. Passar
   * cá para dentro os 78/65/80 do JPEG dava ficheiros maiores do que o
   * necessário — que é o contrário disto.
   */
  desconto: 5,
} as const;

/** Aplica o formato da casa a um `sharp` já redimensionado. */
function codificar(pipeline: Sharp, qualidade: number, avif = false) {
  if (avif) {
    return pipeline.avif({
      quality: Math.max(30, qualidade - AVIF.desconto),
      effort: AVIF.esforco,
    });
  }
  return pipeline.webp({ quality: Math.max(40, qualidade - FORMATO.desconto) });
}

/** O tipo que uma derivada anuncia. */
const tipoDe = (avif = false) => (avif ? "image/avif" : FORMATO.contentType);

/**
 * ── O AVIF, AO LADO E NÃO EM VEZ DE ──────────────────────────────────────
 *
 * `esforco: 4` e não o 6 por omissão: o AVIF é caro de codificar, e num lote de
 * 25 fotografias a diferença entre 4 e 6 é meio segundo por foto contra uns 3%
 * de tamanho. O tecto de uma função é o que decide, e é o mesmo tecto que já
 * fazia a geração em lotes.
 *
 * ── O DESCONTO, QUE FOI MEDIDO E NÃO COPIADO ────────────────────────────
 *
 * A escala do AVIF NÃO é a do WebP, e a diferença é muito maior do que parece.
 * O primeiro número aqui escrito foi 13 — «um AVIF q65 pesa menos do que um
 * WebP q73» — e era falso: MEDIDO sobre oito fotografias de casamento reais
 * (as do `e2e/fotos-de-teste`), à medida da miniatura de 400 px:
 *
 *     webp q73    137,7 KB   PSNR 32,82 dB   ← a referência
 *     avif q65    145,0 KB   PSNR 34,66 dB   5% MAIS pesado
 *     avif q60    127,5 KB   PSNR 33,82 dB   7% menos
 *     avif q55    102,8 KB   PSNR 32,49 dB   25% menos
 *     avif q50     85,8 KB   PSNR 31,55 dB   38% menos
 *
 * Aos 1200 px a curva é a mesma (q65 é 3% mais pesado; q55 é 28% menos).
 *
 * Escolhido o **q55**, ou seja um desconto de 23: é o ponto onde a fidelidade
 * medida iguala a do WebP (−0,33 dB, que ninguém vê) e o ficheiro perde um
 * quarto do peso. E é um limite conservador, porque o PSNR é injusto para o
 * AVIF — ele guarda o detalhe fino de outra maneira, e a comparação por olho
 * dá-lhe mais margem do que a matemática.
 *
 * Um AVIF q65 continuava a ser uma imagem melhor do que o WebP; só que a
 * melhoria era paga com bytes, e o que se quer aqui são menos bytes na mão de
 * quem está numa quinta com 4G fraco.
 */
const AVIF = { formato: "avif" as const, desconto: 23, esforco: 4 };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NEM TUDO O QUE FALTA DÓI DA MESMA MANEIRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel dizia «1140 miniaturas em falta, em 683 fotografias» — um número
 * grande, vermelho, e falso na parte que interessa. Das 1140, a maioria eram
 * AVIF, que foi acrescentado ontem e que **nenhuma** fotografia anterior tem.
 *
 * São duas coisas com nomes diferentes e urgências opostas:
 *
 *   · **essencial** — sem esta derivada a grelha cai para o ORIGINAL e puxa
 *     megabytes para desenhar um quadrado de 150 px. É uma avaria: dói hoje,
 *     no telemóvel dela, com 4G de quinta.
 *   · **leve** — a mesma imagem em AVIF, um quarto mais leve para quem o saiba
 *     ler. Não a ter não parte nada: o `<picture>` cai no WebP e ninguém dá
 *     por isso. É um ganho por cobrar, não um defeito.
 *
 * Somar as duas num número só é dizer «tens 1140 avarias» a quem tem 683 mais
 * um trabalho por fazer — e um alarme que exagera é um alarme que se ignora.
 *
 * O `papel` também MANDA NA ORDEM da geração: as essenciais de toda a
 * biblioteca primeiro, as leves depois. Sem isso, parar a meio (ou fechar o
 * portátil) deixava os dois primeiros temas com AVIF e os últimos sem
 * miniatura nenhuma — o pior dos dois mundos, e por acidente.
 */
type Papel = "essencial" | "leve";

const FAMILIAS = [
  {
    origem: THEME_BUCKET,
    derivadas: [
      { bucket: THEME_THUMB_BUCKET, ...MINIATURA, papel: "essencial" as Papel },
      { bucket: THEME_MICRO_BUCKET, lado: 96, qualidade: 65, papel: "essencial" as Papel },
      /**
       * ── A DE 1200 px, QUE NÃO ERA FABRICADA POR NINGUÉM ─────────────────
       *
       * É a que a página do casal MOSTRA: num telemóvel a fotografia ocupa
       * ~343 pontos a três pixéis por ponto, e é esta que o `srcset` escolhe.
       * As de 400 px servem as GRELHAS do back office; nunca serviram aquela
       * página.
       *
       * Estava fora do lote — nascia uma a uma, à primeira vez que alguém
       * olhava, com o download, o `sharp` e o upload todos dentro do pedido e
       * o casal à espera. Ou seja, «Gerar as miniaturas» podia correr até ao
       * fim e deixar a proposta exactamente tão lenta como estava: fabricava
       * tudo menos aquilo de que aquela página precisa.
       *
       * `essencial` e não `leve`, pela definição de sempre: sem ela a página
       * cai para o ORIGINAL — 2200 px e ~2,6 MB por fotografia, numa página
       * com quarenta e seis. É uma avaria, não um ganho por cobrar.
       */
      { bucket: THEME_MID_BUCKET, ...MEDIA, papel: "essencial" as Papel },
      // Os mesmos dois tamanhos, na oferta que só alguns navegadores aceitam.
      // Ver `THEME_AVIF_BUCKET`: é uma proposta, não uma substituição.
      { bucket: THEME_AVIF_BUCKET, ...MINIATURA, avif: true, papel: "leve" as Papel },
      {
        bucket: THEME_AVIF_MICRO_BUCKET,
        lado: 96,
        qualidade: 65,
        avif: true,
        papel: "leve" as Papel,
      },
    ],
  },
  {
    origem: PROPOSAL_BUCKET,
    derivadas: [
      { bucket: PROPOSAL_THUMB_BUCKET, ...MINIATURA, papel: "essencial" as Papel },
      // A mesma de 1200 px, do lado das propostas: as fotografias que o casal
      // vê tanto podem vir da Biblioteca como ter sido carregadas no pedido.
      { bucket: PROPOSAL_MID_BUCKET, ...MEDIA, papel: "essencial" as Papel },
    ],
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

/**
 * Uma PASTA — um tema, ou um pedido —, e não uma pasta vezes um bucket.
 *
 * A versão anterior emitia uma linha por (pasta × derivada), e o painel
 * mostrava-as em bruto: o mesmo tema aparecia quatro vezes seguidas, todas a
 * dizer «47 de 47», e não havia maneira de ler dali quantas FOTOGRAFIAS
 * estavam mal. Estão aqui as duas contas que se fazem em fotografias, que é a
 * unidade em que ela pensa e a única que se pode dizer em voz alta.
 */
export interface LinhaDeContagem {
  /** O bucket de onde vêm os originais (`theme-assets` ou `proposal-assets`). */
  origem: string;
  /** O id da pasta. Quem o traduz para um nome é a rota — ver `pastas-com-nome`. */
  pasta: string;
  fotos: number;
  /** Fotografias a que falta pelo menos uma derivada ESSENCIAL: as que doem. */
  semMiniatura: number;
  /** Fotografias sem a versão AVIF. Funcionam; só pesam mais. */
  semVersaoLeve: number;
  /** Derivadas em falta ao todo — é este o trabalho que a geração tem pela frente. */
  emFalta: number;
}

export interface Contagem {
  linhas: LinhaDeContagem[];
  fotos: number;
  /** Derivadas em falta ao todo (essenciais + leves). O trabalho a fazer. */
  emFalta: number;
  /** Só as essenciais. É este o número da avaria. */
  emFaltaEssenciais: number;
  /** Só as leves (AVIF). É este o número do ganho por cobrar. */
  emFaltaLeves: number;
  /** Quantas FOTOGRAFIAS estão a servir o original por falta de miniatura. */
  fotosSemMiniatura: number;
  /** Quantas FOTOGRAFIAS ainda não têm a versão leve. */
  fotosSemVersaoLeve: number;
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
  if (!sb) {
    return {
      linhas: [],
      fotos: 0,
      emFalta: 0,
      emFaltaEssenciais: 0,
      emFaltaLeves: 0,
      fotosSemMiniatura: 0,
      fotosSemVersaoLeve: 0,
      avisos: ["Storage não configurado."],
    };
  }

  const linhas: LinhaDeContagem[] = [];
  const avisos: string[] = [];
  let fotos = 0;
  let emFalta = 0;
  let emFaltaEssenciais = 0;
  let emFaltaLeves = 0;
  let fotosSemMiniatura = 0;
  let fotosSemVersaoLeve = 0;

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

      // Conjuntos, e não somas: uma fotografia sem miniatura E sem micro está
      // mal UMA vez, não duas. Somar contava-a duas e dava um número maior do
      // que o total de fotografias — que é como se perde a confiança num
      // painel.
      const semMiniatura = new Set<string>();
      const semVersaoLeve = new Set<string>();
      let daPasta = 0;

      for (const derivada of familia.derivadas) {
        const jaLa = new Set(await ficheiros(sb, derivada.bucket, pasta).catch(() => []));
        const faltam = caminhos.filter((c) => !jaLa.has(c));
        daPasta += faltam.length;
        if (derivada.papel === "essencial") {
          emFaltaEssenciais += faltam.length;
          for (const c of faltam) semMiniatura.add(c);
        } else {
          emFaltaLeves += faltam.length;
          for (const c of faltam) semVersaoLeve.add(c);
        }
      }

      emFalta += daPasta;
      fotosSemMiniatura += semMiniatura.size;
      fotosSemVersaoLeve += semVersaoLeve.size;
      if (daPasta === 0) continue;
      linhas.push({
        origem: familia.origem,
        pasta,
        fotos: caminhos.length,
        semMiniatura: semMiniatura.size,
        semVersaoLeve: semVersaoLeve.size,
        emFalta: daPasta,
      });
    }
  }

  // As que doem primeiro, e só depois as que pesam: a ordem da lista é a ordem
  // por que se resolve.
  linhas.sort((a, b) => b.semMiniatura - a.semMiniatura || b.emFalta - a.emFalta);
  return {
    linhas,
    fotos,
    emFalta,
    emFaltaEssenciais,
    emFaltaLeves,
    fotosSemMiniatura,
    fotosSemVersaoLeve,
    avisos,
  };
}

export interface ResultadoDoLote {
  /** Derivadas escritas neste lote. */
  geradas: number;
  falhas: string[];
  /** Quantas derivadas ficaram por fazer depois deste lote. Zero = acabou. */
  restantes: number;
  /** Destas, quantas são ESSENCIAIS — as fotografias que ainda servem o
   *  original. Zero com `restantes` a sobrar quer dizer que a avaria está
   *  resolvida e o que falta é só o ganho. */
  restantesEssenciais: number;
  /**
   * O MESMO trabalho contado em FOTOGRAFIAS.
   *
   * Os botões do painel falam de fotografias («Gerar as versões leves de 389
   * fotografias») porque é a unidade em que ela pensa. A barra falava de
   * derivadas, e dizia «0 de 765» logo a seguir a ela ter carregado num botão
   * que prometia 389 — dois números para o mesmo trabalho, sem nada no ecrã a
   * explicar a diferença. Agora quem chama tem as duas contas e pode usar a
   * mesma dos botões.
   */
  fotografiasRestantes: number;
  /** Fotografias tocadas neste lote (uma, faça ela uma derivada ou quatro). */
  fotografiasFeitas: number;
  /** O papel do que este lote esteve a fazer, para o ecrã poder dizê-lo em vez
   *  de anunciar «miniaturas» enquanto gera AVIF. */
  papel: Papel | null;
}

/** O que uma fotografia deve, e a quem. */
type Alvo = { bucket: string; lado: number; qualidade: number; avif?: boolean };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LOTE PÁRA PELO RELÓGIO, E NÃO POR UM NÚMERO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Era um número — 25 derivadas — e o número não sabe nada sobre o tecto da
 * função. Sabe o relógio.
 *
 * Aconteceu isto: 389 fotografias sem AVIF, 765 derivadas, e a barra dela
 * parada em «0 de 765». O `sharp` não tinha culpa (medido: 25 codificações
 * AVIF a esforço 4 são ~9,7 s no total). A rede é que não cabia:
 *
 *   · o original era descarregado uma vez por DERIVADA — a mesma fotografia de
 *     ~2 MB duas vezes, para lhe fazer o AVIF grande e o AVIF micro;
 *   · e cada lote varria a biblioteca inteira do princípio: uma listagem por
 *     pasta e por bucket, repetida nos ~31 lotes.
 *
 * Um lote que não cabe nos 60 s morre a meio, e quem está do outro lado vê uma
 * barra a zero. Com um tecto de tempo o lote encolhe sozinho quando a rede
 * está má, em vez de rebentar — e como o varrimento é a parte cara, vale a
 * pena aproveitá-lo para gerar o máximo que couber em vez de parar às 25.
 */
const TECTO_DO_LOTE_MS = 40_000;

/**
 * Um tecto de fotografias por lote, por segurança.
 *
 * Quem manda é o relógio; isto é só para o caso de o relógio andar depressa e
 * a rede estar excelente — uma resposta com dez mil linhas de falhas não
 * ajudaria ninguém.
 */
const LOTE_FOTOS = 200;

/**
 * Gera as derivadas em falta até ao tecto de tempo, e diz quantas ficaram.
 *
 * **Nunca substitui o que já existe** (`upsert: false`), portanto repetir é
 * seguro e é assim que se retoma. E é melhor esforço por fotografia: uma que
 * falhe não pára as outras — uma execução que morre à terceira de quatrocentas
 * obriga a recomeçar, e recomeçar é o que faz ninguém correr isto.
 */
export async function gerarLoteDeDerivadas(
  soPapel?: Papel,
  opcoes?: {
    /** Quanto tempo esta chamada tem para gerar. */
    tectoMs?: number;
    /** O relógio, injectável para os testes não precisarem de esperar. */
    agora?: () => number;
  },
): Promise<ResultadoDoLote> {
  const sb = getSupabase();
  if (!sb) {
    return {
      geradas: 0,
      falhas: ["Storage não configurado."],
      restantes: 0,
      restantesEssenciais: 0,
      fotografiasRestantes: 0,
      fotografiasFeitas: 0,
      papel: null,
    };
  }

  const agora = opcoes?.agora ?? Date.now;
  const ate = agora() + (opcoes?.tectoMs ?? TECTO_DO_LOTE_MS);

  const falhas: string[] = [];
  let geradas = 0;
  let fotografiasFeitas = 0;
  let restantes = 0;
  let restantesEssenciais = 0;
  let fotografiasRestantes = 0;
  let papel: Papel | null = null;
  /** Os buckets já confirmados NESTE lote. Confirmar é uma ida ao servidor, e
   *  era feita uma vez por derivada — cinco fotografias davam dez idas. */
  const bucketsProntos = new Map<string, boolean>();

  // DUAS passagens, e não uma: primeiro tudo o que é essencial na biblioteca
  // inteira, e só depois o AVIF. Ver `Papel` — parar a meio tem de deixar as
  // coisas melhores do que estavam, e não meio-arranjadas de um lado e
  // intactas do outro.
  for (const passagem of ["essencial", "leve"] as const) {
    // `soPapel` é o que deixa arranjar a avaria sem esperar pelo ganho: as
    // miniaturas de toda a biblioteca são um punhado de lotes; o AVIF são 683
    // fotografias vezes duas codificações caras. Obrigá-la a esperar por um
    // para ter o outro era transformar uma correcção de dois minutos numa
    // tarde. Sem argumento, faz tudo — pela ordem certa.
    if (soPapel && passagem !== soPapel) continue;
    for (const familia of FAMILIAS) {
      const doPapel = familia.derivadas.filter((d) => d.papel === passagem);
      if (doPapel.length === 0) continue;
      let asPastas: string[];
      try {
        asPastas = await pastas(sb, familia.origem);
      } catch {
        continue;
      }
      for (const pasta of asPastas) {
        const caminhos = await ficheiros(sb, familia.origem, pasta);
        if (caminhos.length === 0) continue;
        // UMA listagem por bucket de derivada e por pasta — não uma por
        // fotografia. É o que permite decidir tudo o que esta pasta deve com o
        // número de idas ao Storage a depender das pastas, e não das fotos.
        const jaLa = new Map<string, Set<string>>();
        for (const d of doPapel) {
          jaLa.set(d.bucket, new Set(await ficheiros(sb, d.bucket, pasta).catch(() => [])));
        }
        for (const caminho of caminhos) {
          const emFalta = doPapel.filter((d) => !jaLa.get(d.bucket)?.has(caminho));
          if (emFalta.length === 0) continue;

          // ── Já não há tempo: daqui para a frente só se CONTA ──────────────
          //
          // `fotografiasFeitas > 0` e não um corte seco: um lote que devolve
          // zero geradas faz quem chama parar o ciclo (é assim que se sabe que
          // acabou), portanto um lote que chegasse atrasado e não gerasse nada
          // parava a geração para sempre. Uma fotografia é o mínimo que
          // garante que a coisa anda.
          if (fotografiasFeitas >= LOTE_FOTOS || (fotografiasFeitas > 0 && agora() >= ate)) {
            fotografiasRestantes += 1;
            restantes += emFalta.length;
            if (passagem === "essencial") restantesEssenciais += emFalta.length;
            continue;
          }

          papel = passagem;
          const r = await gerarAsDeUmaFoto(sb, familia.origem, caminho, emFalta, bucketsProntos);
          geradas += r.feitas;
          fotografiasFeitas += 1;
          if (r.falhas.length > 0) {
            falhas.push(...r.falhas);
            // O que falhou continua em falta — senão o painel dizia que estava
            // tudo feito e a grelha continuava lenta.
            fotografiasRestantes += 1;
            restantes += r.falhas.length;
            if (passagem === "essencial") restantesEssenciais += r.falhas.length;
          }
        }
      }
    }
  }

  if (falhas.length > 0) {
    log.warn("derivadas: algumas não foram geradas", { quantas: falhas.length });
  }
  return {
    geradas,
    falhas,
    restantes,
    restantesEssenciais,
    fotografiasRestantes,
    fotografiasFeitas,
    papel,
  };
}

/**
 * Todas as derivadas em falta de UMA fotografia, com UM download.
 *
 * O original era descarregado uma vez por derivada. Uma fotografia a que
 * faltasse o AVIF grande e o AVIF micro atravessava os mesmos ~2 MB duas vezes
 * — nas 389 fotografias dela, ~1,5 GB para fazer trabalho que precisa de
 * metade. É a conta que não deixava o lote caber no tecto da função.
 *
 * Melhor esforço por derivada: uma que falhe não leva atrás as irmãs, e o
 * caminho de cada uma que falhou sai daqui para o painel poder dizer QUAIS.
 */
async function gerarAsDeUmaFoto(
  sb: Cliente,
  origem: string,
  caminho: string,
  alvos: Alvo[],
  bucketsProntos: Map<string, boolean>,
): Promise<{ feitas: number; falhas: string[] }> {
  const falhas: string[] = [];
  let feitas = 0;

  // O bucket TEM de existir antes de se escrever nele: o gerador em lote não
  // passa pelo `uploadThemeDerivada`, e um `upload` para um bucket que não
  // existe falha em silêncio — para sempre, e com o contador a dizer «geradas
  // 0». Com os buckets do AVIF isto deixou de ser um caso de instalações
  // antigas e passou a ser o caso de todas.
  const bons: Alvo[] = [];
  for (const alvo of alvos) {
    let ok = bucketsProntos.get(alvo.bucket);
    if (ok === undefined) {
      ok = await garantirBucketDeDerivadas(alvo.bucket).catch(() => false);
      bucketsProntos.set(alvo.bucket, ok);
    }
    if (ok) bons.push(alvo);
    else falhas.push(`${alvo.bucket}/${caminho}`);
  }
  if (bons.length === 0) return { feitas, falhas };

  let bytes: Buffer;
  try {
    const { data, error } = await sb.storage.from(origem).download(caminho);
    if (error || !data) throw new Error("sem original");
    bytes = Buffer.from(await data.arrayBuffer());
  } catch {
    // Sem o original não há nenhuma delas — e todas contam como falhadas, para
    // continuarem a aparecer como em falta na contagem seguinte.
    for (const alvo of bons) falhas.push(`${alvo.bucket}/${caminho}`);
    return { feitas, falhas };
  }

  for (const alvo of bons) {
    try {
      // Um `sharp` novo por derivada, sobre os MESMOS bytes: um pipeline não se
      // reaproveita depois de `toBuffer`. O que não se repete é a viagem.
      const derivada = sharp(bytes)
        // `rotate()` sem argumento aplica a orientação do EXIF. Sem isto, uma
        // foto de telemóvel deitada sai com os lados trocados face ao original —
        // e a miniatura ficava com outra proporção do que a grelha reserva.
        .rotate()
        // `withoutEnlargement`: uma foto já menor do que o alvo fica como está.
        // Ampliar produzia uma miniatura MAIOR do que o original, que é o
        // contrário do que isto serve.
        .resize(alvo.lado, alvo.lado, { fit: "inside", withoutEnlargement: true });
      const bytesDerivada = await codificar(derivada, alvo.qualidade, alvo.avif).toBuffer();
      const { error: erroSubida } = await sb.storage
        .from(alvo.bucket)
        .upload(caminho, bytesDerivada, opcoesDeCarregamento(tipoDe(alvo.avif)));
      if (erroSubida) falhas.push(`${alvo.bucket}/${caminho}`);
      else feitas += 1;
    } catch {
      falhas.push(`${alvo.bucket}/${caminho}`);
    }
  }
  return { feitas, falhas };
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
      .webp({ quality: MINIATURA.qualidade - FORMATO.desconto })
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
        .upload(chave, derivada, opcoesDeCarregamento(FORMATO.contentType));
      if (erroSubida && !/exist/i.test(erroSubida.message)) {
        log.warn("derivadas: miniatura a pedido não ficou guardada", {
          destino,
          erro: erroSubida.message,
        });
      }
    } else {
      await uploadProposalThumb(chave, derivada, FORMATO.contentType);
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DERIVADA INTERMÉDIA, A PEDIDO — a que a página do casal mostra
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Irmã do {@link miniaturaAPedidoComMotivo}, com o mesmo desenho e um tamanho
 * diferente: procura no bucket das intermédias, e só fabrica se não estiver lá.
 *
 * ── PORQUE É QUE ISTO É UMA FUNÇÃO E NÃO UM PARÂMETRO DA OUTRA ───────────
 *
 * Porque as duas têm regras diferentes onde importa. A miniatura é a imagem da
 * GRELHA DO ESTÚDIO e do seletor, e existe em lote (`gerarLoteDeDerivadas`)
 * para a biblioteca abrir depressa. Esta existe só para a PÁGINA DO CASAL, é
 * fabricada à primeira visita e mais nada — não entra no contador de derivadas
 * em falta, e não se gera em lote para milhares de fotos da Biblioteca que
 * nunca vão parar a uma proposta.
 *
 * NUNCA LANÇA. Um `null` daqui quer dizer «serve o que tinhas»: quem chama cai
 * para a miniatura ou para o original, que é o comportamento de sempre.
 */
export async function derivadaMediaAPedido(
  caminho: string,
): Promise<{ bytes: Buffer | null; motivo: MotivoDaMiniatura }> {
  const sb = getSupabase();
  if (!sb || !caminho) return { bytes: null, motivo: "sem-storage" };
  const daBiblioteca = ehRefDeTema(caminho);
  const origem = daBiblioteca ? THEME_BUCKET : PROPOSAL_BUCKET;
  const destino = daBiblioteca ? THEME_MID_BUCKET : PROPOSAL_MID_BUCKET;
  const chave = daBiblioteca ? caminhoDoRefDeTema(caminho) : caminho;
  if (!chave || chave.includes("..")) return { bytes: null, motivo: "caminho-invalido" };

  // Já lá está? É o caso normal a partir da segunda visita, e custa um download
  // em vez de um download + um `sharp` + um upload.
  try {
    const { data } = await sb.storage.from(destino).download(chave);
    if (data) return { bytes: Buffer.from(await data.arrayBuffer()), motivo: "ok" };
  } catch {
    /* segue para gerar */
  }

  try {
    const { data, error } = await sb.storage.from(origem).download(chave);
    if (error || !data) {
      const dito = error?.message ?? "sem dados";
      const semResposta = /fetch failed|network|timeout|ENOTFOUND|ECONNREFUSED/i.test(dito);
      return { bytes: null, motivo: semResposta ? "storage-sem-resposta" : "original-em-falta" };
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    const derivada = await sharp(bytes)
      .rotate()
      // `withoutEnlargement`: uma fotografia que já seja mais pequena do que
      // 1200 sai como está. Esticá-la aqui seria fabricar pixéis que não
      // existem e cobrar os bytes deles ao telemóvel do casal.
      .resize(MEDIA.lado, MEDIA.lado, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: MEDIA.qualidade - FORMATO.desconto })
      .toBuffer();
    // Guardar é melhor esforço, como na miniatura: falhar só quer dizer que a
    // visita seguinte volta a pagar o `sharp`.
    if (daBiblioteca) {
      const { error: erroSubida } = await sb.storage
        .from(destino)
        .upload(chave, derivada, opcoesDeCarregamento(FORMATO.contentType));
      if (erroSubida && !/exist/i.test(erroSubida.message)) {
        log.warn("derivadas: intermédia a pedido não ficou guardada", {
          destino,
          erro: erroSubida.message,
        });
      }
    } else {
      // Pelo `uploadProposalMid` e não por um `upload` cru: é ele que GARANTE
      // o bucket. Sem isso, numa instalação onde ele ainda não existe, cada
      // visita voltava a pagar o `sharp` de cada fotografia, para sempre.
      await uploadProposalMid(chave, derivada, FORMATO.contentType);
    }
    return { bytes: derivada, motivo: "ok" };
  } catch (e) {
    const dito = e instanceof Error ? e.message : String(e);
    log.warn("derivadas: intermédia a pedido falhou", { caminho: chave, erro: dito });
    return { bytes: null, motivo: "sharp-falhou" };
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAPA JÁ FABRICADA QUANDO O CASAL ABRE O LINK
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «esta foto demora imenso tempo a carregar, e eu quero que seja
 * super rápida e fluida a aparecer».
 *
 * A derivada de 1200 px passou a vir assinada, directa do CDN — mas só depois de
 * existir, e quem a fabrica é a PRIMEIRA visita. Numa proposta acabada de
 * enviar, essa primeira visita é a do casal a abrir o email: um `sharp` sobre
 * uma fotografia de 2200 px, mais um download e um upload, a acontecer enquanto
 * eles olham para um rectângulo. O ganho todo ia para a segunda visita, que é a
 * que não interessa.
 *
 * Isto fabrica-a no envio, e só a da CAPA: são uma ou duas fotografias, é a
 * primeira coisa que se vê, e é a única que não pode esperar. As dos mood boards
 * ficam para a visita — estão mais abaixo na página, entram preguiçosas, e
 * fabricar quarenta e seis aqui era pôr o envio a demorar o que ela acabou de
 * pedir que não demorasse.
 *
 * ── MELHOR ESFORÇO, E COM RELÓGIO ────────────────────────────────────────
 *
 * Nunca lança e nunca demora mais do que o tecto: uma derivada por fabricar não
 * pode atrasar — nem muito menos travar — o envio de uma proposta. O que falhar
 * aqui volta a ser tentado pela rota, na visita, exactamente como era antes.
 */
export async function aquecerDerivadasDaCapa(
  capas: readonly string[],
  tectoMs = 6000,
): Promise<number> {
  const refs = [...new Set(capas.filter((r) => typeof r === "string" && r.trim() !== ""))]
    // Uma foto embutida ou de fora não tem derivada para fabricar.
    .filter((r) => !r.startsWith("data:") && !/^https?:\/\//i.test(r))
    .slice(0, 2);
  if (refs.length === 0) return 0;

  const relogio = new Promise<null>((resolve) => setTimeout(() => resolve(null), tectoMs));
  try {
    const feitas = await Promise.race([
      Promise.all(refs.map((r) => derivadaMediaAPedido(r).catch(() => ({ motivo: "" })))),
      relogio,
    ]);
    if (!feitas) {
      log.warn("derivadas: aquecimento da capa passou do tecto", { n: refs.length, tectoMs });
      return 0;
    }
    return feitas.filter((f) => f.motivo === "ok").length;
  } catch {
    return 0;
  }
}
