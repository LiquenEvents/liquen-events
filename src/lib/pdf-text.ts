import "server-only";

/**
 * Sanitização de texto para os PDFs desenhados com `StandardFonts` do pdf-lib.
 *
 * As fontes-padrão (Helvetica, Times…) usam a codificação WinAnsi (CP1252):
 * `page.drawText` (e `widthOfTextAtSize`) LANÇAM em qualquer caráter que o
 * WinAnsi não saiba codificar — emoji, alfabetos não-latinos, símbolos raros.
 * Como o nome do cliente, as notas e afins são texto FORNECIDO pelo cliente, um
 * único nome com emoji faria o PDF/​email rebentar (500) — deixando a linha do
 * livro escrita mas sem documento gerado.
 *
 * `winAnsiSafe` percorre a string e mantém apenas o que o WinAnsi codifica,
 * substituindo o resto por "?". Nunca lança. Acentos portugueses (à, ç, õ…)
 * vivem em Latin-1 (0xA0–0xFF) e passam intactos; números e datas formatados
 * (dígitos, "€", "·", "—") também são todos codificáveis, por isso ficam iguais.
 */

// Pontuação tipográfica do CP1252 no bloco 0x80–0x9F (aspas curvas, travessões,
// reticências, €, ™…). São os únicos pontos acima de 0x7F fora de Latin-1 que o
// WinAnsi codifica; tudo o resto nesse bloco é indefinido.
const WINANSI_EXTRA: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/**
 * Substitui por "?" qualquer caráter que o WinAnsi (CP1252) não codifique.
 *
 * NORMALIZA PARA NFC PRIMEIRO. Sem isso, "Decoração" escrito na forma
 * decomposta — "c" + cedilha, "a" + til, que é o que sai de alguns teclados,
 * do macOS e de texto colado — saía "Decorac?a?o": as marcas combinatórias
 * (U+0300–U+036F) não vivem no Latin-1 e viravam "?", deixando a letra base
 * órfã. Em NFC as mesmas palavras passam a "ç" e "ã" de um só ponto de código,
 * que o WinAnsi codifica, e chegam ao PDF inteiras.
 *
 * As duas formas são a MESMA palavra em Unicode e ninguém que escreve no back
 * office sabe qual está a produzir — a diferença não pode chegar ao PDF.
 */
export function winAnsiSafe(input: string): string {
  const cabe = (ch: string) => {
    const cp = ch.codePointAt(0) ?? 0;
    return (
      cp === 0x0a || // a quebra de linha: ver `RETORNOS` — virava «?» no papel
      (cp >= 0x20 && cp <= 0x7e) || // ASCII imprimível
      (cp >= 0xa0 && cp <= 0xff) || // Latin-1 (acentos PT incluídos)
      WINANSI_EXTRA.has(cp) // pontuação tipográfica do CP1252
    );
  };
  let out = "";
  for (const ch of arrumar(input)) {
    if (cabe(ch)) {
      out += ch;
      continue;
    }
    // Antes do «?», a letra sem o acento que a codificação não tem: «Wiśniewski»
    // vale mais como «Wisniewski» do que como «Wi?niewski». Ver `semAcento`.
    const base = semAcento(ch);
    out += base && [...base].every(cabe) ? base : "?";
  }
  return out;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O APELIDO QUE PERDIA LETRAS — «Michał Wiśniewski» → «Micha Winiewski»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nenhuma das duas fontes desta casa cobre o latino ESTENDIDO: a Carlito que o
 * documento da proposta embute vem em subconjunto (329 glifos, o CP1252 e pouco
 * mais) e as fontes-padrão do pdf-lib são WinAnsi por definição. Fora ficam o
 * polaco (ł ś ń ż ę ć ź ą), o checo (ř ů), o húngaro (ő ű), o turco (ğ ş ı) e o
 * romeno (ș ț) — letras que, à vista de quem escreve o nome no back office,
 * são letras normais.
 *
 * O que acontecia a cada uma dessas letras era diferente conforme o caminho, e
 * as duas coisas são más:
 *
 *   · no documento da proposta DESAPARECIA (é a regra do `textoParaFonte`, e
 *     está certa para um emoji): o nome do casal saía «Micha Winiewski», em
 *     corpo 52, no meio da capa;
 *   · nos papéis desenhados com as fontes-padrão virava «?»: «Wi?niewski».
 *
 * Um nome próprio não é um emoji. Tirar-lhe o acento é o que qualquer pessoa
 * faz quando o teclado não o tem, e é uma transformação EXACTA e reversível de
 * ler: «ś» é, em Unicode, «s» mais um acento (NFD), e tirar o acento devolve
 * a letra que lá está. Não há adivinhação nenhuma — é a mesma normalização que
 * o `arrumar` já faz no outro sentido.
 *
 * As poucas letras que não se decompõem (o «ł» polaco, o «đ» croata, o «ı»
 * turco) não têm acento nenhum para tirar: são um glifo próprio com uma base
 * latina universalmente aceite, e essa base está escrita na tabela abaixo. Só
 * lá entra o que não tem discussão.
 *
 * O que não for letra latina — o emoji, o «Ω», o «李» — continua exactamente
 * como estava: cai no caminho de sempre de quem o chamou.
 */
const BASE_SEM_DECOMPOSICAO: Readonly<Record<string, string>> = {
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
  Ŧ: "T",
  ŧ: "t",
  ı: "i",
  İ: "I",
  Ø: "O",
  ø: "o",
  Ɖ: "D",
  Ǥ: "G",
  ǥ: "g",
};

/**
 * A letra sem o acento, ou `""` quando não há letra latina nenhuma por baixo.
 *
 * Nunca lança e nunca inventa: devolve `""` para tudo o que não seja uma letra
 * latina com decomposição (ou uma das poucas da tabela acima).
 */
function semAcento(ch: string): string {
  const daTabela = BASE_SEM_DECOMPOSICAO[ch];
  if (daTabela) return daTabela;
  const decomposto = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return decomposto && decomposto !== ch ? decomposto : "";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE VEM COLADO DO WORD, DO CANVA E DO INSTAGRAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma legenda de mood board escrita à mão no back office é texto limpo. Uma
 * legenda COLADA traz passageiros que não se vêem em lado nenhum: espaços
 * estreitos (U+2009, U+202F), espaços de largura zero (U+200B), a marca de
 * ordem de bytes (U+FEFF), hífenes que não quebram (U+2011), marcas de
 * direcção de texto. No ecrã do back office são invisíveis ou parecem espaços
 * normais — no PDF viravam «?», um por cada um, e a proposta que ia para o
 * casal ficava com pontos de interrogação a meio das frases.
 *
 * Isto arruma-os ANTES de qualquer decisão sobre o que a fonte sabe desenhar:
 *
 *   · o que é invisível desaparece — não ocupa espaço nenhum no papel, portanto
 *     tirá-lo não muda nada do que se lê;
 *   · o que é um espaço disfarçado passa a espaço normal;
 *   · o que é um traço disfarçado passa ao traço equivalente que as fontes têm.
 *
 * Não é adivinhação: cada linha desta tabela é um caráter com um equivalente
 * EXACTO. O que não tiver equivalente não é tocado aqui — essa decisão é de
 * quem sabe que fonte vai desenhar o texto.
 */
const ESPACOS = /[\u2000-\u200A\u202F\u205F\u3000]/g;
const INVISIVEIS =
  /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const TRACOS: ReadonlyArray<[RegExp, string]> = [
  [/[\u2010\u2011]/g, "-"], // hífen tipográfico e hífen que não quebra
  [/\u2012/g, "\u2013"], // traço de dígitos → meia-risca
  [/\u2015/g, "\u2014"], // barra horizontal → travessão
  [/\u2044/g, "/"], // barra de fracção
];

/**
 * O RETORNO DE CARRETO — o «?» que ela viu, e a razão de ser este e não outro.
 *
 * «zona da piscina. ?Arranjo Floral no bar» — o «?» está exactamente onde ela
 * carregou no Enter. Uma caixa de texto de um navegador devolve as quebras de
 * linha como `\r\n` (é o que a norma do HTML manda), e o `\r` sozinho não é
 * imprimível: virava «?» no papel, colado à primeira letra da linha seguinte.
 * O `\n` ao lado dele fazia o seu trabalho e mudava de linha, o que tornava o
 * «?» ainda mais estranho de explicar — parecia um caráter a mais do nada.
 *
 * Normalizar as três formas (`\r\n`, `\r` sozinho do mundo antigo do Mac, e
 * `\n`) numa só ANTES de tudo o resto é o que faz o resto do ficheiro poder
 * tratar de quebras de linha sem pensar nisto outra vez.
 *
 * ── E AS TRÊS QUE NÃO SE ESCREVEM, COLAM-SE ────────────────────────────────
 *
 * O `\r` chega do Enter. Mas há mais três quebras de linha na norma, e nenhuma
 * delas vem de um teclado — vêm do COLAR que esta parte do ficheiro existe para
 * tratar:
 *
 *   · U+2028 LINE SEPARATOR      — o shift+Enter do Word e do Google Docs, e o
 *                                  que sai de copiar texto de dentro de um PDF;
 *   · U+2029 PARAGRAPH SEPARATOR — o fim de parágrafo vindo do mesmo sítio;
 *   · U+0085 NEL                 — o «next line» de exportações e ficheiros
 *                                  herdados.
 *
 * Caíam no mesmo buraco do `\r` e caíam pior: o `\r` vinha acompanhado de um
 * `\n` que ainda mudava de linha, deixando só um «?» a mais; estas vêm
 * sozinhas, portanto o parágrafo colado ficava TODO numa linha só, com um «?»
 * exactamente onde devia estar a mudança de linha. Nenhuma é imprimível e
 * todas são, por definição da norma, uma quebra — não há aqui adivinhação
 * nenhuma, é a mesma tradução exacta que o resto da tabela faz.
 */
const RETORNOS = /\r\n?|[\u2028\u2029\u0085]/g;

function arrumar(input: string): string {
  /**
   * `String(input ?? "")` e não `input`: os tipos dizem que aqui só chega
   * texto, e o que chega vem de um `doc` que ninguém validou campo a campo (o
   * corpo de um pedido, um rascunho antigo do `localStorage`, uma cópia de
   * segurança restaurada). Um campo em falta dava `undefined.normalize is not a
   * function` — um 500 no botão «Gerar» por causa de uma propriedade que não
   * estava lá. Esta função promete NÃO LANÇAR; passa a prometê-lo também
   * quando lhe mentem sobre o tipo.
   */
  let s = String(input ?? "")
    .normalize("NFC")
    .replace(RETORNOS, "\n")
    .replace(INVISIVEIS, "")
    .replace(ESPACOS, " ");
  for (const [de, para] of TRACOS) s = s.replace(de, para);
  return s;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TEXTO SEGURO PARA UMA FONTE EMBEBIDA — e porque é que isto não é o WinAnsi
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O documento da proposta **embebe a sua própria fonte** (Carlito, por fontkit
 * — ver `proposal-doc-pdf.ts`). Uma fonte embebida desenha tudo o que tiver no
 * ficheiro: latino com acentos, grego, cirílico, símbolos. O WinAnsi não tem
 * nada a ver com ela: é a codificação das fontes-PADRÃO do pdf-lib, que outros
 * documentos nossos (fatura, contrato) ainda usam.
 *
 * Só que o documento da proposta continuava a passar todo o texto pelo
 * `winAnsiSafe`, herdado de quando também usava as fontes-padrão. Resultado: a
 * legenda perdia para «?» caracteres que a Carlito desenha perfeitamente —
 * castigada por uma limitação de uma fonte que não é a dela.
 *
 * Aqui pergunta-se à FONTE, que é quem sabe. O que ela tiver, passa. O que ela
 * não tiver **desaparece em vez de virar «?»**: um ponto de interrogação a meio
 * de uma frase parece um erro NOSSO na proposta que o casal recebe; a ausência
 * de um emoji não parece nada. (E se a fonte não souber responder — versão
 * diferente do pdf-lib, fonte-padrão — volta-se ao WinAnsi, que nunca lança.)
 */
export function textoParaFonte(fonte: unknown, input: string): string {
  const cobre = coberturaDaFonte(fonte);
  if (!cobre) return winAnsiSafe(input);
  const temGlifo = (s: string) => [...s].every((c) => cobre(c.codePointAt(0) ?? 0));
  let out = "";
  for (const ch of arrumar(input)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x0a || cp === 0x09) {
      out += ch; // quebras e tabulações são tratadas por quem parte as linhas
      continue;
    }
    if (cobre(cp)) {
      out += ch;
      continue;
    }
    // A Carlito embutida vem em SUBCONJUNTO e não tem o latino estendido: sem
    // isto, «Michał Wiśniewski» sai «Micha Winiewski» na capa da proposta —
    // letras a menos num nome próprio, em corpo 52, sem nada que o denuncie.
    // Ver `semAcento`. O emoji e o que não é letra latina continuam a
    // desaparecer, que é a regra escrita aqui em cima.
    const base = semAcento(ch);
    if (base && temGlifo(base)) out += base;
  }
  return out;
}

/** Cache por fonte: `hasGlyphForCodePoint` é barato, mas chegar até ele passa
 *  por campos internos do pdf-lib e não vale a pena repetir a travessia a cada
 *  caráter de cada linha de cada página. */
const COBERTURAS = new WeakMap<object, ((cp: number) => boolean) | null>();

/**
 * A pergunta «esta fonte sabe desenhar este caráter?», feita ao fontkit que
 * vive dentro do pdf-lib.
 *
 * É API interna, e por isso está toda embrulhada: se um dia o pdf-lib mudar a
 * arrumação por dentro, isto devolve `null` e o texto volta ao caminho antigo
 * do WinAnsi — pior, mas a funcionar. O que não pode acontecer é o PDF deixar
 * de ser gerado por causa de uma mudança de versão numa biblioteca.
 */
function coberturaDaFonte(fonte: unknown): ((cp: number) => boolean) | null {
  if (!fonte || typeof fonte !== "object") return null;
  const guardada = COBERTURAS.get(fonte as object);
  if (guardada !== undefined) return guardada;

  let cobre: ((cp: number) => boolean) | null = null;
  try {
    const interna = (
      fonte as {
        embedder?: { font?: { hasGlyphForCodePoint?: (cp: number) => boolean } };
      }
    ).embedder?.font;
    if (interna && typeof interna.hasGlyphForCodePoint === "function") {
      cobre = (cp) => {
        try {
          return interna.hasGlyphForCodePoint!(cp);
        } catch {
          return false;
        }
      };
    }
  } catch {
    cobre = null;
  }
  COBERTURAS.set(fonte as object, cobre);
  return cobre;
}
