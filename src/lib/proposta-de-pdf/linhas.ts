/**
 * ════════════════════════════════════════════════════════════════════════════
 * DE PEDAÇOS SOLTOS A LINHAS E COLUNAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um PDF não guarda linhas de texto. Guarda ORDENS DE DESENHO: «põe estas
 * letras em (68, 236)». Quem lê recebe pedaços — às vezes uma frase inteira, às
 * vezes uma letra de cada vez — e tem de voltar a montar a página.
 *
 * É aqui que isso acontece, e é o módulo mais importante do motor, porque é o
 * que transforma «adivinhar» em «ler»: sem posição, «7890 € + IVA» é um número
 * qualquer numa sopa de texto; com posição, é o número que está à direita da
 * linha que diz «Valor Total», e isso já é uma leitura.
 *
 * Módulo PURO de propósito — não importa `server-only`, não sabe o que é o
 * pdf.js e não toca em ficheiro nenhum. Recebe pedaços com coordenadas e
 * devolve linhas. É o que o torna testável sem gerar um único PDF, e é onde
 * vivem os testes das situações difíceis (as maiúsculas espaçadas, as duas
 * colunas da página das condições).
 */

/** Um pedaço de texto, tal como o leitor de PDF o entrega. `y` é a base da
 *  linha e o PDF conta de baixo para cima. */
export interface PedacoDeTexto {
  texto: string;
  x: number;
  y: number;
  largura: number;
  /** Corpo da letra, em pontos — a altura nominal, não a da caixa desenhada. */
  tamanho: number;
  /** Id da fonte dentro deste PDF. Só serve para COMPARAR pedaços entre si
   *  (é a mesma fonte? é a negra?); o nome em si não quer dizer nada. */
  fonte: string;
}

/** Uma corrida de texto: pedaços encostados uns aos outros na mesma linha de
 *  base. É a unidade que interessa — um rótulo é uma corrida, o valor à direita
 *  dele é OUTRA corrida da mesma linha. */
export interface Corrida {
  texto: string;
  x: number;
  /** Onde a corrida acaba (x + largura). */
  x2: number;
  y: number;
  tamanho: number;
  fonte: string;
}

/** Uma linha da página: as corridas que partilham a mesma base, da esquerda
 *  para a direita. */
export interface Linha {
  pagina: number;
  y: number;
  /** Corpo da letra dominante da linha (a da corrida mais larga). */
  tamanho: number;
  corridas: Corrida[];
  /** Todas as corridas juntas por espaços — o texto da linha «como se lê». */
  texto: string;
  x: number;
  x2: number;
}

/** Uma página já lida. */
export interface PaginaLida {
  /** A contar de 1, como no leitor de PDF dela. */
  numero: number;
  largura: number;
  altura: number;
  pedacos: PedacoDeTexto[];
}

/**
 * Quantos «ems» de espaço em branco separam duas COLUNAS.
 *
 * Dentro de uma frase, o maior buraco possível é um espaço largo — meio em, com
 * folga. Entre um rótulo à esquerda e o valor à direita da mesma linha, o
 * buraco é a folha toda: no orçamento, «Valor Total» acaba em 118 e o
 * «7.890,00 € + IVA» começa em 427 — trinta ems.
 *
 * Três ems é o meio-termo medido: nunca parte uma frase (nem depois de um
 * ponto final, nem à volta de um travessão) e parte SEMPRE um par
 * rótulo/valor, incluindo o mais apertado que o documento tem — o «Sinal 30%
 * 2.911,41 €», onde o vão é de meio em e portanto NÃO se parte, que é o certo:
 * ali as duas coisas são a mesma frase.
 */
const VAO_DE_COLUNA_EM = 3;

/**
 * Tolerância vertical para dois pedaços serem «a mesma linha», em ems.
 *
 * Não é zero porque o mesmo texto pode ser desenhado com bases ligeiramente
 * diferentes — no orçamento, o rótulo «Total a pagar» está em 241,3 e o número
 * grande ao lado dele em 235,3, seis pontos abaixo, porque um é de corpo 13 e
 * o outro de corpo 22 e a composição alinha-os pelo olho e não pela base.
 *
 * Um quinto de em é largo que chegue para os desencontros de arredondamento e
 * apertado que chegue para não colar duas linhas seguidas de um parágrafo (que
 * distam sempre mais de um em). O caso do total resolve-se noutro sítio, à
 * mão: ver `campos.ts`.
 */
const TOLERANCIA_DE_BASE_EM = 0.2;

/**
 * Junta os pedaços de uma página em linhas, e cada linha em corridas.
 *
 * Ordena por base descendente (a página lê-se de cima para baixo, e no PDF isso
 * é o `y` a diminuir) e, dentro de cada linha, da esquerda para a direita.
 */
export function linhasDaPagina(pagina: PaginaLida): Linha[] {
  const uteis = pagina.pedacos.filter((p) => p.texto.trim().length > 0);
  const inicios = inicioDeColuna(uteis, pagina.altura);
  // Da base mais alta para a mais baixa; em caso de empate, da esquerda para a
  // direita — assim o primeiro pedaço de um grupo é sempre o mais à esquerda.
  const ordenados = [...uteis].sort((a, b) => b.y - a.y || a.x - b.x);

  const grupos: PedacoDeTexto[][] = [];
  for (const p of ordenados) {
    const ultimo = grupos[grupos.length - 1];
    const base = ultimo?.[0];
    const tolerancia = Math.max(0.6, (base?.tamanho ?? p.tamanho) * TOLERANCIA_DE_BASE_EM);
    if (base && Math.abs(base.y - p.y) <= tolerancia) ultimo.push(p);
    else grupos.push([p]);
  }

  return grupos.map((g) => {
    const porX = [...g].sort((a, b) => a.x - b.x);
    const corridas: Corrida[] = [];
    for (const p of porX) {
      const c = corridas[corridas.length - 1];
      const vao = c ? p.x - c.x2 : Infinity;
      if (c && vao <= p.tamanho * VAO_DE_COLUNA_EM && !inicios.has(Math.round(p.x))) {
        // Encostados: é a mesma corrida. O espaço só se acrescenta se os
        // pedaços não estiverem colados — um PDF parte «Decoração Cerimónia:»
        // e « Arco floral» em dois pedaços e o espaço já lá está dentro, mas
        // parte «Sinal 30%» e «2.911,41 €» sem espaço nenhum entre eles.
        const precisaEspaco =
          vao > p.tamanho * 0.08 && !/\s$/.test(c.texto) && !/^\s/.test(p.texto);
        c.texto += (precisaEspaco ? " " : "") + p.texto;
        c.x2 = Math.max(c.x2, p.x + p.largura);
        if (p.tamanho > c.tamanho) c.tamanho = p.tamanho;
      } else {
        corridas.push({
          texto: p.texto,
          x: p.x,
          x2: p.x + p.largura,
          y: p.y,
          tamanho: p.tamanho,
          fonte: p.fonte,
        });
      }
    }
    for (const c of corridas) c.texto = c.texto.replace(/\s+/g, " ").trim();
    const limpas = corridas.filter((c) => c.texto.length > 0);
    // O corpo da LINHA é o da corrida mais larga: numa linha com um rótulo
    // pequeno e um valor grande, o que a caracteriza é o valor.
    const dominante = limpas.reduce(
      (a, b) => (b.x2 - b.x > a.x2 - a.x ? b : a),
      limpas[0] ?? { x: 0, x2: 0, tamanho: 0 },
    );
    return {
      pagina: pagina.numero,
      y: g[0].y,
      tamanho: dominante.tamanho ?? 0,
      corridas: limpas,
      texto: limpas.map((c) => c.texto).join(" "),
      x: limpas[0]?.x ?? 0,
      x2: limpas.length ? Math.max(...limpas.map((c) => c.x2)) : 0,
    };
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE É QUE COMEÇA UMA COLUNA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O vão de três ems resolve o caso normal e falha num caso concreto e real: a
 * faixa de detalhes da página de apresentação tem quatro colunas a 176 pontos
 * de distância e valores que podem encher 160. Com «Herdade da Cortesia,
 * Reguengos de Monsaraz» no Local, sobravam 16 pontos até ao «150 pax» dos
 * Convidados — um em e meio — e as duas colunas colavam-se numa só corrida. O
 * campo saía «Herdade da Cortesia, Reguengos de 150 pax Monsaraz», e o dos
 * convidados saía vazio.
 *
 * O que denuncia uma coluna não é o vão: é a REPETIÇÃO. Um texto começar
 * exactamente no mesmo x em duas linhas diferentes da mesma página não é
 * coincidência — é alinhamento, e alinhamento é coluna. (Duas linhas chegam:
 * um rótulo e o seu valor já são duas.)
 *
 * É um critério a MAIS, não em vez do vão: parte-se quando o vão é grande OU
 * quando o pedaço seguinte cai num início de coluna conhecido. Partir de mais
 * é o erro barato — uma linha parte-se em duas corridas e o texto da linha
 * continua a lê-las por ordem; colar duas colunas mete o valor de um campo
 * dentro do outro, e isso vai impresso.
 */
function inicioDeColuna(pedacos: readonly PedacoDeTexto[], altura: number): Set<number> {
  const bases = new Map<number, Set<number>>();
  for (const p of pedacos) {
    /**
     * A MOBÍLIA DA FOLHA NÃO CONTA COMO COLUNA.
     *
     * O cabeçalho corrente é encostado à direita, portanto o x onde começa
     * depende do comprimento da referência do documento. Numa proposta cuja
     * referência começava em 608, esse 608 coincidia com o meio da legenda
     * «Incluído na proposta» — duas linhas ao mesmo x, coluna declarada, e a
     * legenda partia-se em «I N C L U Í D O» e «N A P R O P O S T A». A lista
     * das condições de reserva desaparecia por causa do comprimento do nome do
     * casal.
     *
     * O cabeçalho e o rodapé vivem fora da mancha e não alinham com nada do que
     * lá está dentro. Fora da conta.
     */
    if (altura > 0 && (p.y > altura - 90 || p.y < 70)) continue;
    const x = Math.round(p.x);
    const s = bases.get(x) ?? new Set<number>();
    s.add(Math.round(p.y));
    bases.set(x, s);
  }
  const out = new Set<number>();
  for (const [x, ys] of bases) if (ys.size >= 2) out.add(x);
  return out;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MAIÚSCULAS ESPAÇADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os rótulos pequenos deste documento são desenhados LETRA A LETRA, com dois
 * pontos de espaço entre cada uma — é o que lhes dá o ar de legenda de revista.
 * O que sai do leitor de PDF é, à letra, `"C O N V I D A D O S"`, e nas palavras
 * compostas nem sequer se sabe onde acabava uma e começava a outra: o «Wedding
 * Planners» chega como `"W E D D I N G"` e `"P L A N N E R S"`, dois pedaços
 * separados por um vão que é do mesmo tamanho dos outros.
 *
 * Tentar remontar a frase seria inventar. Como os rótulos são sempre comparados
 * com um VOCABULÁRIO conhecido — o motor procura «Data», «Local»,
 * «Convidados», não procura «uma palavra qualquer» —, a solução é comparar as
 * duas pontas na mesma forma reduzida: sem espaços, sem acentos, sem
 * pontuação, tudo em maiúsculas.
 *
 *     "C O N V I D A D O S"  →  "CONVIDADOS"
 *     "Convidados"           →  "CONVIDADOS"
 *     "W E D D I N G P L A N N E R S" → "WEDDINGPLANNERS"
 *     "Wedding Planners"     →  "WEDDINGPLANNERS"
 *
 * Perde-se a fronteira das palavras, e não faz falta nenhuma: só se usa para
 * PERGUNTAR «isto é o rótulo X?». Nunca para produzir um valor — um valor lido
 * assim sairia colado e sem acentos, e é o género de coisa que se descobre
 * impressa no PDF de um casal.
 */
export function chaveDeRotulo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira os acentos, já separados pelo NFD
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/** Esta corrida é o rótulo `rotulo`? Compara pela forma reduzida — ver
 *  {@link chaveDeRotulo}. */
export function eRotulo(texto: string, rotulo: string): boolean {
  return chaveDeRotulo(texto) === chaveDeRotulo(rotulo);
}

/**
 * A linha desta página cujo texto é o rótulo `rotulo`, e mais nada.
 *
 * «E mais nada» é importante: a página das condições gerais tem a palavra
 * «cancelamento» a meio de um parágrafo, e o cabeçalho «Cancelamento» é uma
 * linha inteira só com essa palavra. Procurar por conteúdo apanharia os dois.
 */
export function linhaComRotulo(linhas: readonly Linha[], rotulo: string): Linha | undefined {
  return linhas.find((l) => eRotulo(l.texto, rotulo));
}

/**
 * As linhas que ficam DEBAIXO de `linha`, na mesma coluna, enquanto se seguirem
 * umas às outras com o mesmo passo.
 *
 * É como se lê um valor de duas linhas por baixo de um rótulo («Herdade da
 * Cortesia, Reguengos de Monsaraz» ocupa duas), sem apanhar o rótulo da linha
 * seguinte da grelha: pára assim que o salto vertical cresce, assim que a
 * coluna muda, ou assim que o corpo da letra muda.
 *
 * @param passoMaximo maior salto vertical aceite entre duas linhas seguidas.
 */
export function seguimentoAbaixo(
  linhas: readonly Linha[],
  desde: Linha,
  opcoes: { passoMaximo: number; toleranciaX?: number; tamanho?: number },
): Linha[] {
  const tolX = opcoes.toleranciaX ?? 2;
  const out: Linha[] = [];
  let anterior = desde;
  for (const l of linhas) {
    if (l.pagina !== desde.pagina || l.y >= anterior.y) continue;
    if (anterior.y - l.y > opcoes.passoMaximo) break;
    if (Math.abs(l.x - desde.x) > tolX) break;
    if (opcoes.tamanho !== undefined && Math.abs(l.tamanho - opcoes.tamanho) > 0.6) break;
    out.push(l);
    anterior = l;
  }
  return out;
}

/**
 * Junta linhas de um parágrafo que a composição partiu.
 *
 * O gerador quebra por LARGURA e junta as palavras com um espaço só (ver o
 * `wrap` de `proposal-doc-pdf`), portanto voltar a colar com um espaço devolve
 * exactamente o parágrafo de partida. Não é o caso de um PDF de fora, onde a
 * hifenização pode ter partido uma palavra a meio — e por isso quem chama
 * marca estes campos como lidos com uma regra a mais, nunca como leitura
 * directa.
 */
export function juntarParagrafo(linhas: readonly Linha[]): string {
  return linhas
    .map((l) => l.texto)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A caixa que engloba um conjunto de linhas — para o ecrã poder desenhar o
 *  rectângulo «isto veio daqui» por cima do PDF. */
export function caixaDe(linhas: readonly Linha[]): {
  x: number;
  y: number;
  largura: number;
  altura: number;
} {
  if (!linhas.length) return { x: 0, y: 0, largura: 0, altura: 0 };
  const x = Math.min(...linhas.map((l) => l.x));
  const x2 = Math.max(...linhas.map((l) => l.x2));
  const yBase = Math.min(...linhas.map((l) => l.y));
  const yTopo = Math.max(...linhas.map((l) => l.y + l.tamanho));
  return { x, y: yBase, largura: x2 - x, altura: yTopo - yBase };
}
