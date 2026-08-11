import "server-only";
import { lerPdf } from "./leitura";
import { camposDoDocumento } from "./campos";
import { fotosDoPdf } from "./imagens";
import type { Aviso, FotoDoPdf, RascunhoDePdf } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOTOR — um PDF entra, um rascunho de proposta sai
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Imagina que eu ponho um PDF de uma proposta nossa dentro do back office e
 * ele adapta-se a essa proposta para eu continuar a editá-la.» É isto.
 *
 * A Líquen tem anos de propostas feitas à mão, em Word e no Canva, exportadas
 * em PDF. Refazer cada uma no estúdio é uma tarde. Este motor lê o ficheiro e
 * devolve o que conseguiu ler — campo a campo, cada um com a confiança e com o
 * pedaço de texto de onde saiu — para ela passar a CORRIGIR em vez de copiar.
 *
 * ── O QUE ISTO NÃO FAZ, E É DE PROPÓSITO ──────────────────────────────────
 *
 * · Não devolve um `ProposalDoc`. Devolve campos com origem e confiança. Quem
 *   monta o documento é `documentoDeCampos`, com os que ela aceitar.
 * · Não escreve em lado nenhum. Não toca na base de dados, não toca no
 *   armazenamento, não substitui proposta nenhuma. Isto produz um rascunho
 *   para rever.
 * · Não adivinha. Um campo que não se lê com confiança fica vazio e é DITO,
 *   com a razão, em `porLer`.
 *
 * ── OS TECTOS ─────────────────────────────────────────────────────────────
 *
 * Como as outras rotas pesadas deste projecto: tamanho ({@link MAX_PDF_BYTES}),
 * páginas ({@link MAX_PAGINAS}) e tempo ({@link ORCAMENTO_MS}). O tempo é
 * verificado ENTRE páginas e o que já se leu é devolvido com um aviso — meia
 * proposta lida poupa-lhe meia tarde; um 504 não lhe poupa nada.
 */

/**
 * ⚠ Este ficheiro é `server-only` — quem o importar arrasta o pdf.js e o sharp.
 *
 * O ECRÃ que vier a seguir corre no navegador e NÃO deve importar daqui:
 * importa de `@/lib/proposta-de-pdf/tipos`, que tem as formas todas e o
 * `documentoDeCampos` e não puxa nada do servidor.
 */
export { MAX_PDF_BYTES, MAX_PAGINAS, ORCAMENTO_MS } from "./leitura";
export { MAX_FOTOS } from "./imagens";
export * from "./tipos";
export type { Linha, PedacoDeTexto, PaginaLida } from "./linhas";

export type ResultadoDoMotor =
  | { ok: true; rascunho: RascunhoDePdf }
  | { ok: false; porque: string };

/**
 * Lê um PDF de proposta e devolve o rascunho a rever.
 *
 * Nunca lança por causa do conteúdo do ficheiro: um PDF cifrado, truncado, sem
 * texto nenhum ou que nem sequer é um PDF sai como `{ ok: false, porque }` com
 * uma frase que se pode mostrar a alguém.
 */
export async function lerPropostaDePdf(
  bytes: Uint8Array,
  opcoes: { orcamentoMs?: number } = {},
): Promise<ResultadoDoMotor> {
  const inicio = Date.now();
  const lida = await lerPdf(bytes, opcoes);
  if (!lida.ok) return lida;
  const { paginas, imagens, cortada, documento } = lida.leitura;

  const avisos: Aviso[] = [];
  if (cortada)
    avisos.push({ tipo: "tempo-esgotado", mensagem: cortada.porque, pagina: cortada.pagina });

  const pedacos = paginas.reduce((n, p) => n + p.pedacos.length, 0);

  try {
    /**
     * ── UM PDF DIGITALIZADO NÃO SE LÊ, E DIZ-SE ─────────────────────────────
     *
     * Uma proposta antiga que tenha sido impressa e passada pelo scanner é uma
     * fotografia de uma folha: tem imagens e não tem uma única letra. Ler zero
     * campos e devolver um rascunho vazio pareceria uma avaria nossa. Devolver
     * as FOTOGRAFIAS com o aviso é a verdade — e ainda assim é metade do
     * trabalho poupado, porque as fotos estão lá dentro na mesma.
     */
    if (pedacos === 0) {
      const { fotos, avisos: avisosDeFoto } = await fotosDoPdf(documento, imagens);
      return {
        ok: true,
        rascunho: {
          campos: [],
          porLer: [],
          fotos: fotos.map((f) => ({ ...f, destino: null })),
          avisos: [
            ...avisos,
            ...avisosDeFoto,
            {
              tipo: "pdf-sem-texto",
              mensagem:
                "Este PDF não tem texto nenhum — é uma digitalização ou uma exportação em imagem. Só se conseguiram tirar as fotografias.",
            },
          ],
          medidas: {
            paginas: paginas.length,
            pedacos: 0,
            imagens: imagens.length,
            ms: Date.now() - inicio,
          },
        },
      };
    }

    const colheita = camposDoDocumento(paginas);
    const { fotos, avisos: avisosDeFoto } = await fotosDoPdf(documento, imagens);

    return {
      ok: true,
      rascunho: {
        campos: colheita.campos,
        porLer: colheita.porLer,
        fotos: arrumarFotos(fotos, paginas, colheita.paginasDeMoodboard),
        avisos: [...avisos, ...avisosDeFoto],
        medidas: {
          paginas: paginas.length,
          pedacos,
          imagens: imagens.length,
          ms: Date.now() - inicio,
        },
      },
    };
  } finally {
    // O pdf.js guarda os pixéis descodificados enquanto o documento estiver
    // aberto. Numa função serverless que trate três propostas seguidas, três
    // documentos por fechar são umas dezenas de megabytes de imagens em cache
    // a somarem-se até a função morrer sem dizer porquê.
    await documento.destroy().catch(() => {});
  }
}

/**
 * Diz onde é que cada fotografia parecia pertencer.
 *
 * Não é uma adivinha sobre o conteúdo da foto: é onde ela estava DESENHADA. Uma
 * imagem que ocupa a altura toda da primeira página é uma foto de capa, e o
 * lado onde estava impressa é o lado onde vai voltar a ser impressa — foi essa
 * exacta simetria que fez o gerador guardar as capas por posição e nunca as
 * compactar. Uma imagem numa página de inspiração pertence ao mood board dessa
 * página.
 *
 * O que não cair em nenhuma das duas fica com `destino: null`, e o ecrã mostra-a
 * na mesma: uma foto sem sítio é melhor do que uma foto arrumada no sítio
 * errado, que é o género de coisa que só se descobre com a proposta impressa.
 */
function arrumarFotos(
  fotos: readonly FotoDoPdf[],
  paginas: readonly { numero: number; largura: number; altura: number }[],
  paginasDeMoodboard: readonly number[],
): FotoDoPdf[] {
  const daPagina = (n: number) => paginas.find((p) => p.numero === n);
  let capas = 0;
  return fotos.map((f) => {
    const pagina = daPagina(f.origem.pagina);
    const altura = pagina?.altura ?? 0;
    const deCapa = altura > 0 && f.origem.altura >= altura * 0.9;
    if (deCapa && capas < 2) {
      // O lado onde estava é o lado onde volta a ser impressa.
      const meio = f.origem.x + f.origem.largura / 2;
      const lado = meio < (pagina?.largura ?? 0) / 2 ? 0 : 1;
      capas += 1;
      return { ...f, destino: `coverImages[${lado}]` };
    }
    const board = paginasDeMoodboard.indexOf(f.origem.pagina);
    if (board >= 0) return { ...f, destino: `moodBoards[${board}].images` };
    return { ...f, destino: null };
  });
}
