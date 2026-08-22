import "server-only";
import { listThemes } from "./themes-store";
import { listQuoteSummaries } from "./quotes-store";
import { themeFolder } from "./theme-storage";
import { THEME_BUCKET } from "./theme-ref";
import { PROPOSAL_BUCKET } from "./proposal-storage";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PASTA CHAMA-SE `d2f8b1c4-…`; O TEMA CHAMA-SE «BOUQUETS CAMPESTRES»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel das miniaturas mostrava as pastas do Storage como elas são no
 * Storage: um UUID de trinta e seis caracteres, uma seta, e o nome interno de
 * um bucket. Doze linhas dessas, e a seguir «… e mais 55».
 *
 * Isso não é informação — é o dump de uma consulta posto num ecrã. Quem olha
 * não sabe de que tema se trata, portanto não sabe se importa, portanto não faz
 * nada com aquilo. E quando não se faz nada com um número, o número podia não
 * lá estar.
 *
 * Aqui traduz-se a pasta para o nome por que ela conhece a coisa: o nome do
 * tema na Biblioteca, e os nomes dos noivos (ou de quem escreveu) no pedido.
 *
 * ── PORQUE É QUE ISTO NUNCA REBENTA ───────────────────────────────────────
 *
 * Porque um nome é uma cortesia e a contagem é o trabalho. Se a tabela dos
 * temas não responder, o painel mostra o id — feio, mas certo — em vez de não
 * mostrar nada. Uma leitura decorativa que derruba um diagnóstico é um defeito
 * pior do que o que vinha diagnosticar.
 */

/** O que se mostra quando o nome não veio: o id, curto, e dito como id. */
export function nomeDeReserva(pasta: string): string {
  const curto = pasta.length > 12 ? `${pasta.slice(0, 8)}…` : pasta;
  return `Pasta ${curto}`;
}

/** O nome de um pedido: os noivos, ou quem escreveu, ou nada. */
function nomeDoPedido(q: { partnerA?: string; partnerB?: string; name?: string }): string {
  const noivos = [q.partnerA, q.partnerB].map((n) => (n ?? "").trim()).filter(Boolean);
  if (noivos.length === 2) return `${noivos[0]} e ${noivos[1]}`;
  if (noivos.length === 1) return noivos[0];
  return (q.name ?? "").trim();
}

/**
 * `<bucket de origem>/<pasta>` → o nome legível.
 *
 * A chave leva o bucket porque um id de tema e um id de pedido vivem em
 * espaços diferentes e nada impede que colidam — improvável, e mesmo assim não
 * é motivo para pôr o nome de um casal por cima de um tema.
 */
export async function nomesDasPastas(): Promise<Map<string, string>> {
  const por = new Map<string, string>();

  const [temas, pedidos] = await Promise.all([
    listThemes().catch((e) => {
      log.warn("pastas-com-nome: temas não vieram", { erro: String(e) });
      return [];
    }),
    listQuoteSummaries().catch((e) => {
      log.warn("pastas-com-nome: pedidos não vieram", { erro: String(e) });
      return [];
    }),
  ]);

  for (const t of temas) {
    const nome = (t.name ?? "").trim();
    if (nome) por.set(`${THEME_BUCKET}/${themeFolder(t.id)}`, nome);
  }
  for (const q of pedidos) {
    const nome = nomeDoPedido(q);
    // A mesma higienização que escreveu a pasta (`proposal-storage`): sem ela,
    // um id com um caractere fora do alfabeto não casava com a pasta e o nome
    // ficava por aplicar exactamente nos casos estranhos.
    if (nome) por.set(`${PROPOSAL_BUCKET}/${q.id.replace(/[^a-zA-Z0-9_-]/g, "")}`, nome);
  }

  return por;
}
