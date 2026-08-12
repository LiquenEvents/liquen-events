/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COR DE UMA FOTOGRAFIA — e o que se faz com ela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Porque é que isto não vive no browser da proposta ───────────────────────
 * A pergunta «esta foto destoa das outras?» resolve-se com os píxeis, e no
 * navegador os píxeis lêem-se com um `canvas`. Só que as fotos do estúdio
 * chegam por URLs assinados de OUTRO domínio: sem os cabeçalhos de CORS
 * certos, o `getImageData` lança e o canvas fica manchado. O resultado seria
 * uma funcionalidade que ora funciona ora não — que é pior do que não existir,
 * porque um aviso de paleta que às vezes não aparece ensina-se a ignorar.
 *
 * O sítio certo é o trabalhador que já prepara as imagens (`image-worker.ts`):
 * ali a fotografia está EM BRUTO, no computador de quem a está a carregar,
 * antes de subir. Não há origem cruzada nenhuma, e o bitmap já está
 * descodificado para a miniatura e para o LQIP — a cor sai do mesmo canvas, e
 * o custo de um lote de 300 fotos não muda.
 *
 * Este ficheiro é a parte PURA disso: recebe píxeis e devolve uma cor. Não
 * sabe o que é um canvas nem o que é um `OffscreenCanvas`, e é por isso que se
 * testa em Node, com arrays escritos à mão, em vez de com um browser.
 *
 * ── Porque não a média ─────────────────────────────────────────────────────
 * Porque a média de uma fotografia é quase sempre um castanho acinzentado. Uma
 * foto de um ramo branco sobre verde escuro dá, em média, um verde sujo que não
 * está na fotografia — e duas fotos muito diferentes podem dar a mesma média.
 * O que se quer é a cor que MAIS APARECE, e para isso conta-se: os píxeis são
 * arrumados em caixas grosseiras, ganha a caixa mais cheia, e a cor devolvida é
 * a média DENTRO dessa caixa (a caixa sozinha seria um degrau visível).
 */

/** Quantos níveis por canal ao arrumar os píxeis em caixas. */
const NIVEIS = 8;
/** Largura de cada nível, em valores de 0–255. */
const PASSO = 256 / NIVEIS;

/** `#rrggbb` a partir de três canais de 0–255. */
export function hex(r: number, g: number, b: number): string {
  const dois = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${dois(r)}${dois(g)}${dois(b)}`;
}

/** `#rrggbb` → `{ r, g, b }`. `null` para tudo o que não seja isso. */
export function lerHex(cor: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(cor.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * A cor dominante de um conjunto de píxeis RGBA (o que um `getImageData`
 * devolve: quatro entradas por píxel, na ordem R, G, B, A).
 *
 * `null` quando não há píxeis suficientes para dizer alguma coisa — uma imagem
 * vazia, ou toda transparente. Quem chama trata o `null` como «esta foto não
 * tem cor conhecida», que é diferente de lhe atribuir preto.
 */
export function corDominanteDePixeis(dados: ArrayLike<number>): string | null {
  if (dados.length < 4) return null;

  // Uma caixa por combinação de níveis. Guardam-se as somas reais para a média
  // final ser a cor verdadeira dos píxeis daquela caixa, e não o centro dela.
  const contagem = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (let i = 0; i + 3 < dados.length; i += 4) {
    // Transparente não é cor: um PNG recortado tem metade dos píxeis a zero, e
    // contá-los daria preto a toda a gente.
    if (dados[i + 3] < 128) continue;
    const r = dados[i];
    const g = dados[i + 1];
    const b = dados[i + 2];
    const caixa =
      (Math.min(NIVEIS - 1, Math.floor(r / PASSO)) << 6) |
      (Math.min(NIVEIS - 1, Math.floor(g / PASSO)) << 3) |
      Math.min(NIVEIS - 1, Math.floor(b / PASSO));
    const acc = contagem.get(caixa);
    if (acc) {
      acc.n += 1;
      acc.r += r;
      acc.g += g;
      acc.b += b;
    } else {
      contagem.set(caixa, { n: 1, r, g, b });
    }
  }

  let melhor: { n: number; r: number; g: number; b: number } | null = null;
  for (const acc of contagem.values()) {
    // Em empate ganha a primeira encontrada — a ordem de inserção é estável,
    // portanto a mesma fotografia dá sempre a mesma cor. Um desempate ao acaso
    // faria a mesma foto mudar de cor entre carregamentos.
    if (!melhor || acc.n > melhor.n) melhor = acc;
  }
  if (!melhor) return null;
  return hex(melhor.r / melhor.n, melhor.g / melhor.n, melhor.b / melhor.n);
}

/** Matiz (0–360), saturação e luminosidade (0–1) de uma cor. */
export function hsl(cor: string): { h: number; s: number; l: number } | null {
  const rgb = lerHex(cor);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

/**
 * A distância entre duas cores, de 0 (iguais) a 1 (opostas).
 *
 * Não é a distância euclidiana no RGB: essa diz que um cinzento claro e um
 * cinzento médio estão longe, e que um vermelho e um laranja estão perto — o
 * contrário do que o olho diz numa página de mood board. Aqui pesa-se sobretudo
 * o MATIZ, que é o que faz uma foto destoar de uma paleta, e a distância de
 * matiz é atenuada pela saturação MÉDIA das duas: um branco-sujo e um
 * cinzento-rosa têm matizes distantes e não destoam um do outro, porque nenhum
 * dos dois tem cor que chegue para isso.
 *
 * ── Os pesos são medidos, não escolhidos ───────────────────────────────────
 * Calibrados contra dois casos que têm de cair de lados opostos: uma página de
 * verdes com uma fotografia de azul forte (tem de avisar) e uma página de
 * verdes COM cremes (não pode avisar — é a paleta mais comum de um casamento).
 * Com estes pesos o intruso mede 0,48 e a página coerente não passa de 0,29,
 * o que deixa o limiar a meio caminho com folga dos dois lados. Com a
 * saturação MÍNIMA em vez da média, o azul descia a 0,31 e passava a
 * confundir-se com a página boa: o verde escuro é pouco saturado e esmagava o
 * matiz do azul.
 */
export function distancia(a: string, b: string): number {
  const x = hsl(a);
  const y = hsl(b);
  if (!x || !y) return 0;
  const dh = Math.abs(x.h - y.h);
  const matiz = (dh > 180 ? 360 - dh : dh) / 180;
  const forca = (x.s + y.s) / 2;
  const ds = Math.abs(x.s - y.s);
  const dl = Math.abs(x.l - y.l);
  return Math.min(1, matiz * forca * 1.2 + ds * 0.3 + dl * 0.2);
}

/** A cor média de um conjunto — o centro de gravidade da paleta. */
export function corMedia(cores: readonly string[]): string | null {
  const validas = cores.map(lerHex).filter((c): c is { r: number; g: number; b: number } => !!c);
  if (validas.length === 0) return null;
  const soma = validas.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), {
    r: 0,
    g: 0,
    b: 0,
  });
  return hex(soma.r / validas.length, soma.g / validas.length, soma.b / validas.length);
}

/**
 * Quanto é que cada foto se afasta da paleta do board.
 *
 * A referência de cada foto é a média das OUTRAS, e não a média de todas: com
 * poucas fotos, uma que destoe puxa a média para si e depois mede-se contra o
 * seu próprio empurrão. Numa página de três fotos isso chega para esconder
 * exactamente aquela que se queria ver.
 */
export function desviosDaPaleta(cores: readonly (string | null | undefined)[]): (number | null)[] {
  return cores.map((cor, i) => {
    if (!cor) return null;
    const outras = cores.filter((c, j): c is string => j !== i && !!c);
    if (outras.length < 2) return null;
    const centro = corMedia(outras);
    return centro ? distancia(cor, centro) : null;
  });
}

/**
 * A partir de que desvio se avisa.
 *
 * Fica a meio da folga que a calibração da `distancia` mediu: o intruso de azul
 * forte está em 0,48, a página de verdes e cremes não passa de 0,29. Um aviso
 * que aparece em metade das páginas não é um aviso — e um que nunca aparece
 * também não, por isso o número está escrito aqui e a razão dele ao lado.
 */
export const LIMIAR_DE_AVISO = 0.35;

/** As posições que destoam — as que passam o limiar, da que mais destoa para a
 *  que menos. */
export function fotosQueDestoam(cores: readonly (string | null | undefined)[]): number[] {
  const desvios = desviosDaPaleta(cores);
  return desvios
    .map((d, i) => ({ d, i }))
    .filter((x): x is { d: number; i: number } => x.d !== null && x.d >= LIMIAR_DE_AVISO)
    .sort((a, b) => b.d - a.d)
    .map((x) => x.i);
}

/**
 * A ordem que agrupa as fotos por cor — o «organizar automaticamente».
 *
 * Devolve os ÍNDICES na ordem nova, para quem chama poder reordenar a lista
 * sem esta função saber o que é uma fotografia.
 *
 * ── Porque não é «ordenar por matiz» ───────────────────────────────────────
 * Porque o matiz dá a volta: um vermelho a 359° e um vermelho a 1° são a mesma
 * cor e ficariam nas duas pontas da página. E porque as fotos sem cor conhecida
 * (as antigas, carregadas antes disto existir) não têm matiz nenhum e não podem
 * ser atiradas para o princípio.
 *
 * É um encadeamento pelo vizinho mais parecido: começa-se na foto que está mais
 * perto do centro da paleta — a mais "típica" da página, e portanto uma boa
 * abertura — e de cada vez escolhe-se a que menos destoa da anterior. O
 * resultado lê-se como uma transição, que é o que uma página de mood board
 * quer. As fotos sem cor mantêm-se na ordem em que estavam, no fim: nunca se
 * inventa uma cor para as poder arrumar.
 */
export function ordemPorCor(cores: readonly (string | null | undefined)[]): number[] {
  const comCor: number[] = [];
  const semCor: number[] = [];
  cores.forEach((c, i) => (c && lerHex(c) ? comCor : semCor).push(i));
  if (comCor.length < 2) return [...comCor, ...semCor];

  const centro = corMedia(comCor.map((i) => cores[i] as string));
  let actual = comCor[0];
  if (centro) {
    let melhor = Infinity;
    for (const i of comCor) {
      const d = distancia(cores[i] as string, centro);
      if (d < melhor) {
        melhor = d;
        actual = i;
      }
    }
  }

  const porVisitar = new Set(comCor);
  const saida: number[] = [];
  porVisitar.delete(actual);
  saida.push(actual);
  while (porVisitar.size > 0) {
    let seguinte = -1;
    let melhor = Infinity;
    for (const i of porVisitar) {
      const d = distancia(cores[i] as string, cores[actual] as string);
      if (d < melhor) {
        melhor = d;
        seguinte = i;
      }
    }
    porVisitar.delete(seguinte);
    saida.push(seguinte);
    actual = seguinte;
  }
  return [...saida, ...semCor];
}
