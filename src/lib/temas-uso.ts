import "server-only";
import { listAllProposals } from "./proposals-store";
import { refsDeTemaNoDoc } from "./theme-materializar";
import { caminhoDoRefDeTema, themeIdOfPath } from "./theme-ref";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EM QUANTAS PROPOSTAS É QUE ESTE TEMA JÁ SAIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cartão de um tema dizia quantas FOTOS tem e quando foi mexido pela última
 * vez. Nenhuma das duas responde à pergunta que se faz a olhar para uma
 * biblioteca de 25 temas: qual é que eu uso mesmo?
 *
 * Um tema com 80 fotos que nunca saiu de casa e um com 12 que foi a metade dos
 * casamentos do ano parecem iguais na grelha — e são o oposto um do outro.
 *
 * ── COMO É QUE SE CONTA ───────────────────────────────────────────────────
 *
 * Desde a referência (`theme-ref.ts`), uma foto da Biblioteca dentro de uma
 * proposta é uma string `tema:<pasta>/<ficheiro>`. Contar é portanto procurar
 * essas strings nos documentos gravados — e a varredura já existe, escrita
 * para o caso em que ela conta a sério: o `refsDeTemaNoDoc`, que o módulo da
 * materialização usa antes de deixar apagar uma foto.
 *
 * Conta-se por PROPOSTA e não por foto: «usado em 7 propostas» é a frase que
 * responde à pergunta. «342 fotos usadas» soa a muito e não quer dizer nada —
 * são sete mood boards.
 *
 * ── PORQUE É QUE NÃO ENTRAM OS RASCUNHOS ──────────────────────────────────
 *
 * Porque um rascunho é uma proposta a meio, e a que está aberta agora é dela.
 * Um número que sobe enquanto ela escolhe fotos e desce se ela desistir não é
 * um histórico — é um espelho do que está a fazer, e não serve para decidir
 * nada.
 *
 * ── PORQUE É QUE ISTO NÃO VIVE NO `/api/temas` ────────────────────────────
 *
 * Porque lê os documentos TODOS. A rota da lista de temas é a que desenha o
 * primeiro ecrã da Biblioteca, e a Fase 1 foi passada a tirar-lhe trabalho de
 * cima; pôr-lhe uma varredura de propostas em cima era desfazê-la. Isto vive
 * numa rota à parte, que o ecrã pede DEPOIS de os cartões já estarem
 * desenhados — o número aparece a seguir, e a sua ausência não atrasa nada.
 */

/** Quanto tempo é que uma contagem serve. */
const VALIDADE_MS = 5 * 60 * 1000;

let cache: { em: number; por: Map<string, number> } | null = null;

/** Deita fora a contagem guardada. Para os testes, e para quem grave uma
 *  proposta e queira o número certo já a seguir. */
export function esquecerUsoDosTemas(): void {
  cache = null;
}

/**
 * Quantas PROPOSTAS gravadas usam fotos de cada tema, por id de tema.
 *
 * Um tema que nunca saiu não aparece no mapa — `undefined` é «zero», e é a
 * resposta normal numa biblioteca acabada de encher.
 *
 * Nunca lança: uma leitura falhada devolve o que estiver em cache, ou um mapa
 * vazio. O número é uma informação de arrumação, e nenhuma parte da Biblioteca
 * pode deixar de abrir por causa dele.
 */
export async function usoDosTemas(agora = Date.now()): Promise<Map<string, number>> {
  if (cache && agora - cache.em < VALIDADE_MS) return cache.por;
  try {
    const propostas = await listAllProposals();
    const por = new Map<string, number>();
    for (const p of propostas) {
      if (!p.doc) continue;
      // Por PROPOSTA: um tema com catorze fotos no mesmo mood board conta uma
      // vez. É para isso que o conjunto existe.
      const temas = new Set<string>();
      for (const ref of refsDeTemaNoDoc(p.doc)) {
        const id = themeIdOfPath(caminhoDoRefDeTema(ref));
        if (id) temas.add(id);
      }
      for (const id of temas) por.set(id, (por.get(id) ?? 0) + 1);
    }
    cache = { em: agora, por };
    return por;
  } catch (e) {
    log.warn("temas: contagem de uso falhou", { erro: String(e) });
    return cache?.por ?? new Map();
  }
}
