import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_NAME_COOKIE,
  createSession,
  verifyCredentials,
  totpRequired,
  checkTotp,
} from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  // Throttle brute-force attempts on the login endpoint.
  sweep();
  const limited = await rateLimit(`login:${ip}`, 8, 60_000);
  if (!limited.ok) {
    log.warn("admin login rate-limited", { ip });
    return NextResponse.json(
      { error: "Demasiadas tentativas. Aguarde um momento." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
    );
  }

  let password = "";
  let name = "";
  let code = "";
  try {
    const body = await request.json();
    password = String(body.password ?? "");
    name = String(body.name ?? "")
      .trim()
      .slice(0, 40);
    code = String(body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // ── Tecto POR CONTA, independente do endereço ─────────────────────────────
  //
  // O tecto acima conta por IP, e sozinho não chega. Quem tenha a palavra-passe
  // (reutilizada, apanhada num phishing, saída numa fuga de outro serviço) fica
  // só com o código de 6 dígitos à frente — e um código de 6 dígitos com uma
  // janela de tolerância é um espaço de busca pequeno. Bastava rodar endereços,
  // que é barato, para ter tentativas ilimitadas ao segundo factor: cada IP novo
  // trazia oito tentativas novas.
  //
  // Este contador é o mesmo para todos os endereços do mundo, portanto rodar
  // endereços deixa de comprar tentativas. Vinte por hora deixa passar uma
  // pessoa que se engane várias vezes (o relógio dessincronizado do telemóvel é
  // a causa mais comum) e fecha a porta a uma busca automática.
  //
  // A chave usa o nome TAL COMO FOI ESCRITO e já truncado a 40 caracteres: o
  // contador tem de ser incrementado ANTES de saber se a conta existe, senão
  // dizia por omissão quais os nomes válidos. Pelo mesmo motivo a resposta é a
  // mesma para conta inexistente e palavra-passe errada.
  const contaLimitada = await rateLimit(`login-conta:${name.toLowerCase()}`, 20, 3_600_000);
  if (!contaLimitada.ok) {
    log.warn("admin login rate-limited por conta", { ip, name });
    return NextResponse.json(
      { error: "Demasiadas tentativas nesta conta. Tente mais tarde." },
      { status: 429, headers: { "Retry-After": String(contaLimitada.retryAfter ?? 3600) } },
    );
  }

  const user = await verifyCredentials(name, password);
  if (!user) {
    log.warn("admin login failed", { ip, name, reason: "credentials" });
    return NextResponse.json({ error: "Credenciais incorretas" }, { status: 401 });
  }

  // Second factor (TOTP), when configured for this account.
  if (totpRequired(user.name)) {
    if (!code) {
      return NextResponse.json(
        { needs2fa: true, error: "Introduza o código de verificação." },
        { status: 401 },
      );
    }
    if (!checkTotp(user.name, code)) {
      log.warn("admin login failed", { ip, name: user.name, reason: "totp" });
      return NextResponse.json(
        { needs2fa: true, error: "Código de verificação inválido." },
        { status: 401 },
      );
    }
  }

  log.info("admin login ok", { ip, name: user.name, mfa: totpRequired(user.name) });
  const res = NextResponse.json({ ok: true });
  const cookieBase = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  };
  res.cookies.set(ADMIN_COOKIE, createSession(user.name), { httpOnly: true, ...cookieBase });
  // Who is logged in — used to greet the partner and default task ownership.
  res.cookies.set(ADMIN_NAME_COOKIE, user.name, { httpOnly: false, ...cookieBase });
  return res;
}
