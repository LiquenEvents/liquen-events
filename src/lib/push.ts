import "server-only";
import webpush from "web-push";
import { promises as fs } from "fs";
import path from "path";
import { getSupabase } from "./supabase";
import { oFicheiroEhEfemero } from "./app-state";
import { pushSubscriptionSchema } from "./validation";
import { log } from "./logger";

/**
 * Web Push delivery + subscription storage.
 *
 * Requires VAPID keys in the environment (generate once with
 * `npx web-push generate-vapid-keys`):
 *   VAPID_PUBLIC_KEY       (also exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY)
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT          e.g. mailto:liquen.alentejo@gmail.com
 *
 * Subscriptions live in Supabase when configured, else a local JSON file.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MAS O FICHEIRO SÓ É UM SÍTIO NA MÁQUINA DE ALGUÉM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este era o ÚLTIMO recurso a ficheiro sem guarda de produção da casa: o
 * `repository` recusa gravar (`assertWritableInProd`) e o restauro recusa
 * repor, e isto escrevia alegremente.
 *
 * O percurso que isso produz, por extenso: ela liga as notificações no
 * telemóvel, o browser pede autorização, ela dá, o ecrã confirma. A subscrição
 * fica no disco da função. O deploy seguinte apaga esse disco — e o telemóvel
 * continua a mostrar as notificações como ACTIVAS, porque do lado do browser a
 * subscrição existe mesmo. Nunca mais chega nenhuma. Não há erro nenhum em
 * lado nenhum: um pedido de orçamento entra às três da tarde e fica sem aviso,
 * e a primeira vez que se percebe é quando o cliente pergunta porque é que
 * ninguém respondeu.
 *
 * Entre ligar por engano e não ligar, não ligar é melhor: quem carrega no botão
 * e vê uma recusa com uma frase que diz o que falta pode resolver o assunto;
 * quem vê «ligado» não tem por onde desconfiar.
 *
 * A regra de ambiente é a MESMA do `app-state` e do `repository` — importada,
 * e não recopiada, para não haver duas ideias de «isto é produção» a divergirem
 * com o tempo.
 */

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const TABLE = "push_subscriptions";
const DATA_FILE = path.join(process.cwd(), "data", "push-subscriptions.json");

let configured = false;
export function pushConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:liquen.alentejo@gmail.com",
      pub,
      priv,
    );
    configured = true;
  }
  return true;
}

// ── Subscription storage ──────────────────────────────────────────
async function fileRead(): Promise<PushSub[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}
async function fileWrite(subs: PushSub[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(subs, null, 2));
}

/**
 * O ficheiro conta como sítio? Sem Supabase, só fora de produção.
 *
 * Nome e mensagem seguem o `repository.assertWritableInProd` de propósito: o
 * `isPersistenceUnavailable` reconhece a forma da mensagem, e é isso que deixa
 * a rota responder 503 com uma frase útil em vez de um 500 «Erro».
 */
function ficheiroServeDeSitio(): boolean {
  return !oFicheiroEhEfemero();
}

function recusarPorFaltaDeSitio(): never {
  log.error(
    "push: subscrição recusada — Supabase não configurado em produção; o ficheiro é apagado no deploy seguinte e as notificações deixariam de chegar sem aviso. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
  );
  throw new Error("Persistence unavailable: Supabase not configured in production");
}

export async function saveSubscription(sub: PushSub): Promise<void> {
  // Sanitise the network-provided subscription into a strict, known-good object
  // before it is persisted (validates the endpoint is an https URL, caps sizes).
  const parsed = pushSubscriptionSchema.parse(sub);
  const safe: PushSub = {
    endpoint: parsed.endpoint,
    keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth },
  };

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from(TABLE)
      .upsert({ endpoint: safe.endpoint, keys: safe.keys }, { onConflict: "endpoint" });
    if (error) throw error;
    return;
  }
  if (!ficheiroServeDeSitio()) recusarPorFaltaDeSitio();
  const subs = await fileRead();
  if (!subs.some((s) => s.endpoint === safe.endpoint)) {
    subs.push(safe);
    await fileWrite(subs);
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.from(TABLE).delete().eq("endpoint", endpoint);
    return;
  }
  // DESLIGAR TEM DE FUNCIONAR SEMPRE. Recusar aqui deixava alguém preso a uma
  // subscrição que não consegue apagar — e não há nada para apagar: o sítio
  // onde ela estaria já não sobreviveu ao deploy. Silêncio é a resposta certa.
  if (!ficheiroServeDeSitio()) return;
  const subs = await fileRead();
  await fileWrite(subs.filter((s) => s.endpoint !== endpoint));
}

async function listSubscriptions(): Promise<PushSub[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.from(TABLE).select("endpoint, keys");
    return (data ?? []).map((r) => ({
      endpoint: r.endpoint as string,
      keys: r.keys as PushSub["keys"],
    }));
  }
  /**
   * Em produção sem base de dados, o `data/push-subscriptions.json` que existir
   * no disco da função veio do REPOSITÓRIO — é a fotografia congelada do que lá
   * estivesse no momento do commit. Mandar notificações para esses endereços é
   * mandá-las para browsers que já ninguém tem, e faria o registo dizer
   * «enviadas 3» sobre três nadas.
   */
  if (!ficheiroServeDeSitio()) {
    log.warn(
      "push: sem base de dados em produção não há subscrições — nenhuma notificação foi enviada (falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
    return [];
  }
  return fileRead();
}

// ── Sending ───────────────────────────────────────────────────────
interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Sends a push to every subscriber. Never throws; prunes dead subs. */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number }> {
  if (!pushConfigured()) return { sent: 0 };

  const subs = await listSubscriptions();
  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as webpush.PushSubscription, body);
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await removeSubscription(sub.endpoint).catch(() => {});
        }
      }
    }),
  );

  return { sent };
}
