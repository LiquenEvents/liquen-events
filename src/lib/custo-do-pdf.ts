/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA E QUANTO PESA — ANTES DE SE CARREGAR NO BOTÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Tempo estimado de geração do PDF, calculado a partir do
 * número de fotos e de gerações anteriores» e «aviso se o PDF ultrapassar o
 * limite de anexo de email (8 MB)».
 *
 * O botão «Descarregar PDF» é a acção mais lenta do estúdio — vai buscar até
 * oitenta fotografias ao armazenamento, redimensiona cada uma e desenha uma
 * dúzia de páginas. Sem número nenhum à frente, dez segundos e sessenta são a
 * mesma coisa: uma barra a rodar. Com um número, ela decide se espera ou se vai
 * fazer outra coisa — e, sobretudo, sabe quando é que alguma coisa correu mal.
 *
 * ── DE ONDE VÊM OS NÚMEROS ────────────────────────────────────────────────
 * Das gerações ANTERIORES desta instalação, medidas de ponta a ponta (o que ela
 * espera, não o que o servidor demora a desenhar). Cada uma dá uma amostra
 * `{fotos, ms, bytes}`, e a estimativa é uma recta ajustada a essas amostras:
 * um custo fixo mais um custo por fotografia.
 *
 * Sem amostras nenhumas há um modelo de arranque, medido nesta casa e escrito
 * no gerador: ~259 ms fixos e ~75 ms por fotografia do lado do servidor, que de
 * ponta a ponta arredondamos para cima — a rede dela não é a do servidor.
 *
 * ── PORQUE É QUE A RECTA É AJUSTADA E NÃO UMA MÉDIA ───────────────────────
 * Porque o que se quer prever é uma proposta de 40 fotos a partir de gerações
 * de 6 e de 25. Uma média de tempos responderia «o costume», que é a resposta
 * errada precisamente nas propostas grandes, que são as que fazem esperar.
 *
 * Com uma amostra só — ou com várias todas do mesmo tamanho — não há recta
 * possível: fica-se pelo modelo de arranque com o custo fixo dessa amostra, que
 * é melhor do que inventar um declive a partir de um ponto.
 *
 * ── PURO DE PROPÓSITO ─────────────────────────────────────────────────────
 * Não sabe o que é `localStorage` nem o que é React. Recebe amostras, devolve
 * contas — o que permite prendê-lo em testes em vez de o experimentar no ecrã.
 */

export interface AmostraDeGeracao {
  /** Quantas fotografias entraram no documento. */
  fotos: number;
  /** Quanto demorou, de ponta a ponta, em milissegundos. */
  ms: number;
  /** O tamanho do PDF em bytes. */
  bytes: number;
}

/** Quantas gerações se guardam. As mais recentes valem mais do que a história. */
export const AMOSTRAS_GUARDADAS = 12;

/**
 * O limite de anexo que interessa.
 *
 * 8 MB não é um número inventado: é o teto prático dos servidores de email mais
 * comuns depois de o anexo ser codificado em base64 (que engorda ~33%) — o
 * Gmail recusa acima de 25 MB de mensagem, e muitos servidores de empresa
 * ficam-se pelos 10. Um PDF de 8 MB chega lá como ~11 MB de mensagem.
 */
export const LIMITE_DE_ANEXO = 8 * 1024 * 1024;

/** O modelo de arranque, do lado do servidor (ver `proposta-doc/route.ts`). */
const ARRANQUE = { msFixo: 900, msPorFoto: 110, bytesFixo: 180_000, bytesPorFoto: 190_000 };

interface Recta {
  fixo: number;
  porFoto: number;
}

/**
 * Ajusta `y = fixo + porFoto × fotos` às amostras, pelos mínimos quadrados.
 *
 * Devolve `null` quando não há como ajustar — menos de duas amostras, ou todas
 * com o mesmo número de fotografias (nesse caso não há declive nenhum a
 * estimar, só um ponto repetido).
 */
function ajustar(amostras: readonly AmostraDeGeracao[], valor: (a: AmostraDeGeracao) => number) {
  const uteis = amostras.filter((a) => a.fotos >= 0 && valor(a) > 0);
  if (uteis.length < 2) return null;
  const n = uteis.length;
  const somaX = uteis.reduce((s, a) => s + a.fotos, 0);
  const somaY = uteis.reduce((s, a) => s + valor(a), 0);
  const somaXY = uteis.reduce((s, a) => s + a.fotos * valor(a), 0);
  const somaXX = uteis.reduce((s, a) => s + a.fotos * a.fotos, 0);
  const denominador = n * somaXX - somaX * somaX;
  // Todas com as mesmas fotos: o denominador é zero e a recta é vertical.
  if (Math.abs(denominador) < 1e-9) return null;
  const porFoto = (n * somaXY - somaX * somaY) / denominador;
  const fixo = (somaY - porFoto * somaX) / n;
  // Um declive negativo quer dizer que o ruído mandou mais do que o sinal (uma
  // geração lenta com poucas fotos). Aí não se finge que mais fotos é mais
  // depressa: volta-se ao modelo de arranque.
  if (porFoto <= 0 || fixo < 0) return null;
  return { fixo, porFoto } satisfies Recta;
}

/** Quanto tempo, em milissegundos, uma geração com `fotos` fotografias. */
export function tempoEstimado(fotos: number, amostras: readonly AmostraDeGeracao[] = []): number {
  const recta = ajustar(amostras, (a) => a.ms) ?? {
    fixo: ARRANQUE.msFixo,
    porFoto: ARRANQUE.msPorFoto,
  };
  return Math.max(500, Math.round(recta.fixo + recta.porFoto * Math.max(0, fotos)));
}

/** Quantos bytes, mais ou menos, um PDF com `fotos` fotografias. */
export function tamanhoEstimado(fotos: number, amostras: readonly AmostraDeGeracao[] = []): number {
  const recta = ajustar(amostras, (a) => a.bytes) ?? {
    fixo: ARRANQUE.bytesFixo,
    porFoto: ARRANQUE.bytesPorFoto,
  };
  return Math.max(50_000, Math.round(recta.fixo + recta.porFoto * Math.max(0, fotos)));
}

/**
 * A amostra nova à frente, e só as últimas {@link AMOSTRAS_GUARDADAS}.
 *
 * Uma geração de zero milissegundos, ou de zero bytes, não é uma medição — é um
 * erro a passar por uma. Não entra.
 */
export function comNovaAmostra(
  amostras: readonly AmostraDeGeracao[],
  nova: AmostraDeGeracao,
): AmostraDeGeracao[] {
  if (!(nova.ms > 0) || !(nova.bytes > 0) || !Number.isFinite(nova.fotos)) return [...amostras];
  return [nova, ...amostras].slice(0, AMOSTRAS_GUARDADAS);
}

/**
 * «cerca de 20 segundos», «cerca de 1 minuto e meio».
 *
 * Arredondado com grão grosso de propósito: uma estimativa ao segundo promete
 * uma precisão que não existe, e «cerca de 23 segundos» convida a cronometrar.
 */
export function tempoEmPalavras(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s <= 3) return "uns segundos";
  if (s < 20) return `cerca de ${Math.round(s / 5) * 5} segundos`;
  if (s < 60) return `cerca de ${Math.round(s / 10) * 10} segundos`;
  const minutos = ms / 60_000;
  if (minutos < 1.25) return "cerca de 1 minuto";
  if (minutos < 1.75) return "cerca de 1 minuto e meio";
  return `cerca de ${Math.round(minutos)} minutos`;
}

/** «2,4 MB». Em português, com vírgula decimal. */
export function tamanhoEmPalavras(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * O PDF vai passar do que um email leva?
 *
 * Com margem: uma estimativa a 7,5 MB já merece o aviso, porque a estimativa
 * tem erro e o que se perde ao avisar de mais é uma linha de texto — o que se
 * perde ao avisar de menos é um email recusado pelo servidor do cliente, que
 * ela só descobre quando o casal diz que não recebeu nada.
 */
export function passaDoAnexo(bytes: number): boolean {
  return bytes >= LIMITE_DE_ANEXO * 0.94;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ORÇAMENTO DE TEMPO DE UMA PROPOSTA — E O TECTO QUE ELA NÃO SABE QUE TEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As funções acima respondem a «quanto tempo vou esperar?», a partir das
 * gerações desta instalação. Esta responde a outra pergunta, que ninguém fazia:
 * **isto ainda cabe no tempo que a plataforma dá à função?**
 *
 * ── O TECTO ───────────────────────────────────────────────────────────────
 * As duas rotas que voltam a DESENHAR o documento para o casal — o link da
 * proposta e o portal — declaram `maxDuration = 20`. Vinte segundos, e ao fim
 * deles a função é morta: o que aparece do outro lado não é um erro que se
 * perceba, é um pedido que falhou sem dizer porquê. O envio tem 60, que é
 * outro tecto e é o folgado; o apertado é o do casal, e é por isso que é este
 * o número que aqui está.
 *
 * ── O MODELO, MEDIDO ──────────────────────────────────────────────────────
 * Oito documentos gerados a sério, com fotografias reais, cronometrados só no
 * DESENHO (sharp + pdf-lib, sem ir buscar nada ao armazenamento):
 *
 *      fotos   desenho medido
 *          0        329 ms
 *          6      1 914 ms
 *         42      4 513 ms
 *         80      7 631 ms
 *
 * A recta que sai daqui: **330 ms fixos, ~90 ms por fotografia de mood board e
 * ~590 ms por cada tira de capa** — a capa é a maior caixa do documento e é a
 * que mais trabalho dá ao `sharp`. Nos casos grandes o modelo fica ACIMA do
 * medido (8,5 s calculados contra 7,6 s medidos nas 80 fotos), e fica de
 * propósito: um orçamento de tempo que peca por baixo não serve para avisar.
 *
 * ── E A REDE, QUE NÃO ESTÁ NO MEDIDO ──────────────────────────────────────
 * Aquilo tudo foi medido com as fotografias já em memória. Em produção há que
 * ir buscá-las ao armazenamento, **quatro de cada vez**, e cada uma custa 300
 * a 600 ms com um URL assinado. Para 80 fotografias são vinte lotes: +6 s no
 * bom dia, +12 s no mau. É isso que faz a conta fechar em
 *
 *     80 fotos:  7,6 s de desenho + 6 a 12 s de rede  =  14 a 20 s   ← o tecto
 *
 * Uma proposta de oitenta fotografias está encostada ao tecto. Não é uma
 * observação de produção: é aritmética sobre medições — e é exactamente por
 * isso que tem de aparecer ANTES, no ecrã onde as fotos se escolhem, e não
 * depois, quando a rota morrer com uma proposta a meio.
 */

/** O tecto das rotas que redesenham o PDF para o casal (`maxDuration = 20`). */
export const TECTO_DA_ROTA_MS = 20_000;

/** Quantas fotografias se vão buscar ao armazenamento ao mesmo tempo. */
const LOTE_DO_STORAGE = 4;

/** O custo de uma ida ao armazenamento, do bom dia ao mau. */
const MS_POR_FOTO_NO_STORAGE = { optimista: 300, pessimista: 600 };

/** O modelo do desenho, medido (ver o bloco acima). */
const DESENHO = { msFixo: 330, msPorFotoDeBoard: 90, msPorTiraDeCapa: 590 };

export interface OrcamentoDeTempo {
  /** Só o desenho — sharp e pdf-lib, sem rede. */
  desenhoMs: number;
  /** O total no bom dia e no mau, já com as idas ao armazenamento. */
  msOptimista: number;
  msPessimista: number;
  /** O tecto contra o qual isto se compara. */
  tectoMs: number;
  /**
   * O pior caso já passa de três quartos do tecto?
   *
   * Três quartos e não o tecto inteiro: um aviso que só acende quando a conta
   * JÁ não cabe chega tarde — a proposta que interessa avisar é a que está a
   * caminho de não caber. E o pior caso, e não o médio, porque é o mau dia que
   * mata a função.
   */
  aperta: boolean;
}

/**
 * Quanto tempo esta proposta vai custar ao servidor, e quanto lhe sobra.
 *
 * @param fotosDeBoard as fotografias dos mood boards.
 * @param tirasDeCapa as fotografias da capa (0, 1 ou 2) — custam seis vezes
 *        mais do que uma célula de mood board, e por isso contam à parte.
 */
export function orcamentoDeTempo(fotosDeBoard: number, tirasDeCapa: number): OrcamentoDeTempo {
  const board = Math.max(0, fotosDeBoard);
  const capa = Math.max(0, tirasDeCapa);
  const desenhoMs = Math.round(
    DESENHO.msFixo + DESENHO.msPorFotoDeBoard * board + DESENHO.msPorTiraDeCapa * capa,
  );
  // Quatro de cada vez: o que custa é o número de LOTES, não o de fotografias.
  const lotes = Math.ceil((board + capa) / LOTE_DO_STORAGE);
  const msOptimista = desenhoMs + lotes * MS_POR_FOTO_NO_STORAGE.optimista;
  const msPessimista = desenhoMs + lotes * MS_POR_FOTO_NO_STORAGE.pessimista;
  return {
    desenhoMs,
    msOptimista,
    msPessimista,
    tectoMs: TECTO_DA_ROTA_MS,
    aperta: msPessimista >= TECTO_DA_ROTA_MS * 0.75,
  };
}
