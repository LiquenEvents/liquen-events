/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO TEMPO O NAVEGADOR PODE GUARDAR UMA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do briefing da biblioteca: «CDN com `Cache-Control: immutable` e nomes com
 * hash».
 *
 * ── O que estava a acontecer ──────────────────────────────────────────────
 *
 * Nada. Não havia UM `cacheControl` em todo o `src/`, e o Supabase Storage
 * assume uma hora quando ninguém lhe diz outra coisa. Ou seja: abrir a
 * biblioteca de manhã e voltar a abri-la depois do almoço volta a descarregar
 * as 25 capas e as 75 tiras — e num telemóvel com 4G fraco, numa quinta, é
 * meio minuto a olhar para cartões cinzentos por causa de um cabeçalho.
 *
 * ── Porque é que `immutable` é honesto aqui ───────────────────────────────
 *
 * `immutable` promete que o conteúdo daquele endereço NUNCA muda. É uma
 * promessa forte, e a maioria dos sítios não a pode fazer. Esta casa pode, e
 * por construção:
 *
 *   · o caminho de uma fotografia tem um `uuid` gerado no carregamento
 *     (`<pasta>/<uuid>.jpg`), e nunca é reutilizado;
 *   · as derivadas vivem no MESMO caminho dentro do seu bucket, portanto
 *     herdam a mesma unicidade;
 *   · trocar a fotografia de um sítio grava um caminho NOVO e apaga o antigo —
 *     nunca se sobrepõe conteúdo diferente ao mesmo endereço.
 *
 * O único `upsert: true` que existe é o das derivadas a serem refeitas a partir
 * do MESMO original, o que dá os mesmos bytes. Não há caso em que um endereço
 * mude de conteúdo.
 *
 * ── E porque é que é `private` ────────────────────────────────────────────
 *
 * Porque estas são fotografias de casamentos de clientes, servidas por URLs
 * assinados. `public` deixaria um cache partilhado — a CDN de uma empresa, o
 * proxy de um hotel — guardar a resposta e servi-la a quem pedisse o mesmo
 * caminho. É a mesma regra que a página do casal e o PDF já seguem.
 *
 * O prazo é o do próprio URL assinado: um ano é mais do que o assinado dura
 * para os temas (seis horas) e menos do que dura para uma proposta (dez anos).
 * Quem manda é sempre o mais curto dos dois.
 */

/** Um ano, em segundos. */
const UM_ANO = 60 * 60 * 24 * 365;

/**
 * O cabeçalho de cache de qualquer ficheiro de fotografia que esta casa
 * escreve no Storage — original ou derivada.
 *
 * O Supabase recebe isto como `cacheControl` no carregamento e transforma-o no
 * `Cache-Control` da resposta. É um número em SEGUNDOS, não uma frase: passar
 * `"public, max-age=…"` aqui grava a frase inteira dentro do `max-age` e o
 * resultado é um cabeçalho inválido que os navegadores ignoram — que era o
 * mesmo que não ter nenhum.
 */
export const CACHE_DAS_FOTOS = String(UM_ANO);

/**
 * As opções de carregamento que TODA a escrita de uma fotografia partilha.
 *
 * Existe para que não volte a haver um sítio esquecido: `grep cacheControl` tem
 * de encontrar este ficheiro e mais nada.
 */
export function opcoesDeCarregamento(contentType: string, upsert = false) {
  return { contentType, upsert, cacheControl: CACHE_DAS_FOTOS };
}
