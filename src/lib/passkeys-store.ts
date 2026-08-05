import "server-only";
import { createRepository, type Mapper } from "./repository";

/**
 * Os dispositivos registados para entrar no back office sem palavra-passe.
 *
 * ── O que é uma passkey, em duas linhas ───────────────────────────────────
 * O aparelho gera um par de chaves POR SÍTIO. A privada nunca sai de lá — vive
 * no Secure Enclave do iPhone, no TEE do Android, no Windows Hello — e só é
 * usada depois do rosto, da impressão digital ou do PIN do próprio aparelho. O
 * servidor guarda apenas a chave PÚBLICA, que não serve para entrar.
 *
 * Daí as duas propriedades que motivaram esta escolha:
 *
 *  • **não há segredo partilhado.** Uma cópia desta tabela — ou uma fuga do
 *    Supabase inteiro — não deixa ninguém entrar. Compare-se com a palavra-passe,
 *    onde o hash roubado é pelo menos material para atacar offline;
 *  • **não se pode dar por engano.** A assinatura está presa à ORIGEM que o
 *    browser vê. Num site cópia, o aparelho não assina — não porque desconfie,
 *    mas porque as chaves de `liquen-events.com` não existem em `liquen-eventos.com`.
 *    É a única defesa contra phishing que não depende de a pessoa reparar.
 *
 * ── Uma linha por DISPOSITIVO, não por pessoa ─────────────────────────────
 * Quem tiver telemóvel e portátil regista os dois. Perder um não fecha a porta,
 * e remover um não mexe no outro. É também o que permite responder à pergunta
 * "quem entrou de onde" sem inventar sessões.
 *
 * ── `counter`, e porque é que 0 não é um defeito ──────────────────────────
 * Alguns autenticadores contam as assinaturas e mandam o número. Se um dia esse
 * número vier IGUAL ou MENOR do que o guardado, há duas cópias da mesma
 * credencial no mundo — que é precisamente o que uma chave presa ao aparelho
 * devia impedir. Ver {@link contadorRetrocedeu}.
 *
 * Só que a maioria dos autenticadores modernos (iCloud Keychain, Google Password
 * Manager) NÃO conta: manda sempre 0, porque a credencial é sincronizada entre
 * os aparelhos da pessoa de propósito. Tratar 0 como retrocesso fechava a porta
 * a toda a gente. A regra distingue os dois casos.
 */

export interface Passkey {
  /** Credential ID em base64url — a identidade que o browser devolve. */
  id: string;
  /** A conta a que este dispositivo pertence. */
  userName: string;
  /** Chave pública COSE em base64url. NÃO é um segredo. */
  publicKey: string;
  counter: number;
  /** "internal", "hybrid", "usb"… — só serve para o browser sugerir melhor. */
  transports: string[];
  /** O domínio onde a credencial foi criada. Verificado a cada entrada. */
  rpId: string;
  /** Nome dado por quem registou: "iPhone da Catarina", "Portátil do escritório". */
  deviceLabel: string;
  createdAt: string;
  /** Última entrada com este dispositivo, ou null se nunca foi usado. */
  lastUsedAt: string | null;
}

/** Tecto do nome do dispositivo. Generoso; existe para não guardar um livro. */
export const MAX_DEVICE_LABEL = 60;

/**
 * Tecto de dispositivos por conta.
 *
 * Não é uma medida de segurança — é uma rede contra um ciclo de registo em
 * fuga, e contra a lista ficar impossível de gerir (o que leva a pessoa a
 * deixar lá aparelhos que já não tem, que é o verdadeiro risco).
 */
export const MAX_PASSKEYS_POR_CONTA = 10;

export const mapper: Mapper<Passkey> = {
  table: "passkeys",
  fileName: "passkeys.json",
  getId: (p) => p.id,
  toRow: (p) => ({
    id: p.id,
    user_name: p.userName,
    public_key: p.publicKey,
    counter: p.counter,
    transports: p.transports,
    rp_id: p.rpId,
    device_label: p.deviceLabel,
    created_at: p.createdAt,
    last_used_at: p.lastUsedAt,
  }),
  fromRow: (r) => ({
    id: String(r.id ?? ""),
    userName: String(r.user_name ?? ""),
    publicKey: String(r.public_key ?? ""),
    counter: Number.isFinite(Number(r.counter)) ? Number(r.counter) : 0,
    transports: Array.isArray(r.transports) ? r.transports.map(String) : [],
    rpId: String(r.rp_id ?? ""),
    deviceLabel: typeof r.device_label === "string" ? r.device_label : "",
    createdAt: String(r.created_at ?? new Date(0).toISOString()),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
  }),
  order: { column: "created_at", ascending: true },
  fileCompare: (a, b) => a.createdAt.localeCompare(b.createdAt),
};

const repo = createRepository(mapper);

/** Comparação de nomes de conta: sem espaços à volta e sem distinguir maiúsculas. */
export function mesmaConta(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function listPasskeys(): Promise<Passkey[]> {
  return repo.list();
}

/** Os dispositivos de uma conta, do mais antigo para o mais recente. */
export async function listPasskeysFor(userName: string): Promise<Passkey[]> {
  const all = await repo.list();
  return all.filter((p) => mesmaConta(p.userName, userName));
}

export async function getPasskey(id: string): Promise<Passkey | null> {
  if (!id) return null;
  return repo.get(id);
}

export async function createPasskey(p: Passkey): Promise<void> {
  await repo.create(p);
}

/**
 * Remove um dispositivo — SÓ se pertencer a quem está a pedir.
 *
 * O dono é verificado aqui, e não só no ecrã, porque a rota recebe um id vindo
 * do cliente: sem esta verificação bastava conhecer o id da credencial de outra
 * pessoa para lha apagar, e apagar a última credencial de alguém é trancá-lo
 * fora. Devolve false quando não existe ou não é dessa conta — a mesma resposta
 * para os dois casos, para não dizer a estranhos que ids existem.
 */
export async function removePasskeyOwnedBy(id: string, userName: string): Promise<boolean> {
  const existente = await repo.get(id);
  if (!existente || !mesmaConta(existente.userName, userName)) return false;
  await repo.remove(id);
  return true;
}

/**
 * Houve retrocesso no contador de assinaturas?
 *
 * `0 → 0` é o caso normal dos autenticadores sincronizados (iCloud, Google), que
 * não contam nada. Só há sinal de clone quando ALGUÉM dos dois lados conta —
 * isto é, quando o guardado ou o novo é maior que zero — e mesmo assim o novo
 * não avançou.
 */
export function contadorRetrocedeu(guardado: number, novo: number): boolean {
  if (guardado === 0 && novo === 0) return false;
  return novo <= guardado;
}

/** Regista uma entrada bem sucedida: contador novo e data de utilização. */
export async function marcarUso(id: string, counter: number): Promise<void> {
  await repo.update(id, { counter, lastUsedAt: new Date().toISOString() });
}
