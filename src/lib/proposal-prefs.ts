import "server-only";
import { getState, setState } from "./app-state";
import { DEFAULT_VALID_DAYS } from "./proposal-doc";

/**
 * PREFERÊNCIAS DO ESTÚDIO — o que ela não quer voltar a escrever.
 *
 * Para já é uma só: os dias de validade. Palavras da missão — «validade com
 * valor por omissão configurável, para eu não escrever 30 sempre».
 *
 * ── Porque é que não é uma constante ──────────────────────────────────────
 * `DEFAULT_VALID_DAYS` é 30 e está no código. Mudar a política da casa para 45
 * dias obrigava a um commit e a um deploy — o que quer dizer que, na prática,
 * nunca mudava, e ela continuava a corrigir o campo à mão em todas as
 * propostas.
 *
 * ── Onde ficam ────────────────────────────────────────────────────────────
 * Em `app_state`, como os rascunhos e os modelos, pela mesma razão: é uma
 * chave para um valor JSON e não obriga a correr SQL à mão numa instalação já
 * a funcionar.
 *
 * ── Nunca lança ───────────────────────────────────────────────────────────
 * Sem base de dados devolve o valor de sempre. Uma preferência que não se
 * consegue ler não pode impedir ninguém de escrever uma proposta.
 */

export interface PreferenciasProposta {
  /** Dias de validade por omissão nas propostas novas. */
  validUntilDays: number;
}

const CHAVE = "proposal-prefs";

/** Um ano é o tecto: acima disso é engano de dedo, não política. */
export const MAX_DIAS = 365;

export const PREFERENCIAS_POR_OMISSAO: PreferenciasProposta = {
  validUntilDays: DEFAULT_VALID_DAYS,
};

function saoValidas(v: unknown): PreferenciasProposta {
  if (!v || typeof v !== "object") return PREFERENCIAS_POR_OMISSAO;
  const dias = (v as PreferenciasProposta).validUntilDays;
  if (typeof dias !== "number" || !Number.isFinite(dias) || dias < 1 || dias > MAX_DIAS) {
    return PREFERENCIAS_POR_OMISSAO;
  }
  return { validUntilDays: Math.round(dias) };
}

export async function lerPreferencias(): Promise<PreferenciasProposta> {
  return saoValidas(await getState<unknown>(CHAVE));
}

export async function gravarPreferencias(
  p: Partial<PreferenciasProposta>,
): Promise<PreferenciasProposta> {
  const atuais = await lerPreferencias();
  const proximas = saoValidas({ ...atuais, ...p });
  await setState(CHAVE, proximas);
  return proximas;
}
