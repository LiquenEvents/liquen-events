import "server-only";
import { createHash } from "node:crypto";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CHAVE DO PDF, SEM TRAZER O DESENHADOR ATRÁS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, outra vez: «quero que isto se torne ultra rápido».
 *
 * O caminho rápido de abrir uma proposta em PDF já não desenha nada. O ficheiro
 * fica guardado no envio, e os dois `route.ts` que o servem — o do link do
 * casal e o do portal — só têm de fazer três coisas: ler a proposta, calcular a
 * chave do documento, e mandar o browser directamente ao armazenamento com um
 * endereço assinado. Nenhuma delas precisa de desenhar um PDF.
 *
 * Só que a `chaveDoPdf` vivia no `proposal-pdf-cache`, e esse importa o
 * `proposal-doc-render`, que importa o `pdf-lib` e o `sharp`. Um `import` no
 * topo do ficheiro é pago SEMPRE — portanto cada clique carregava o desenhador
 * inteiro para depois não o usar.
 *
 * MEDIDO nesta máquina, com o disco quente: `pdf-lib` 135 ms, `sharp` 77 ms —
 * 212 ms antes de a função correr a primeira linha. Num arranque a frio de
 * servidor sem estado, e num telemóvel em 4G à espera do outro lado, esse
 * número é o pior de todos, porque é pago exactamente quando ela carrega no
 * botão.
 *
 * Estas três coisas não precisam de nada disso: um `sha256` do documento, e uma
 * classe de erro. Vivem aqui, e o `proposal-pdf-cache` reexporta-as para quem já
 * as importava de lá não ter de mudar.
 */

/**
 * O documento com as chaves ordenadas e sem `undefined`, para o mesmo
 * documento dar sempre o mesmo `sha256`.
 */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      // `undefined` não sobrevive a uma ida à base — deixá-lo entrar aqui fazia
      // o documento em memória e o documento lido divergirem outra vez, pelo
      // mesmo motivo e sem se ver.
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entradas.map(([k, v]) => [k, canonico(v)]));
  }
  return valor;
}

/** A identidade de um documento numa língua: mesmo conteúdo, mesma chave. */
export function chaveDoPdf(doc: ProposalDoc, idioma: IdiomaDaProposta): string {
  return createHash("sha256")
    .update(`${idioma}:${JSON.stringify(canonico(doc))}`)
    .digest("base64url")
    .slice(0, 32);
}

/**
 * A proposta sairia com fotografias a menos — e por isso não sai.
 *
 * Vive aqui e não com o desenhador porque quem a APANHA (`instanceof`, no
 * `catch` das rotas) tem de a conhecer sem carregar o desenhador. Era isso, e
 * só isso, que obrigava o caminho rápido a importar tudo.
 */
export class PropostaIncompleta extends Error {
  constructor(public readonly emFalta: number) {
    super(`A proposta sairia com ${emFalta} fotografia(s) em falta.`);
    this.name = "PropostaIncompleta";
  }
}
