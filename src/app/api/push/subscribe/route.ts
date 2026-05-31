import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { saveSubscription, removeSubscription, pushConfigured } from "@/lib/push";
import { pushSubscriptionSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Expose whether push is configured + the public key for the client.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const raw = await request.json().catch(() => null);
    const parsed = pushSubscriptionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Subscrição inválida" }, { status: 400 });
    }
    await saveSubscription(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push subscribe]", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { endpoint } = await request.json();
    if (endpoint) await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
