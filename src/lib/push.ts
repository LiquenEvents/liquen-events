import webpush from "web-push";
import { promises as fs } from "fs";
import path from "path";
import { getSupabase } from "./supabase";
import { pushSubscriptionSchema } from "./validation";

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
      priv
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
  const subs = await fileRead();
  await fileWrite(subs.filter((s) => s.endpoint !== endpoint));
}

async function listSubscriptions(): Promise<PushSub[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.from(TABLE).select("endpoint, keys");
    return (data ?? []).map((r) => ({ endpoint: r.endpoint as string, keys: r.keys as PushSub["keys"] }));
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
    })
  );

  return { sent };
}
