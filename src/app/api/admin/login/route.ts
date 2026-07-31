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
  // SÓ AS TENTATIVAS FALHADAS GASTAM O CONTADOR, e por isso ele é consultado
  // depois de verificar as credenciais, não antes. Quando era consultado antes,
  // gastava-se em qualquer pedido: bastavam vinte pedidos anónimos com o nome
  // "Catarina" — que está no site — para a própria, com a palavra-passe certa,
  // levar 429 durante uma hora (medido: 20 falhas de IPs diferentes → 429 com
  // Retry-After 3598). E como o limitador distribuído renova o PEXPIRE a cada
  // toque, um pedido por hora mantinha o back office fechado para sempre.
  //
  // Contar só as falhas não afrouxa o tecto: quem procura às cegas falha SEMPRE,
  // logo é sempre contado, e continua preso às vinte por hora. O que deixa de
  // acontecer é um estranho poder fechar a porta a quem sabe a palavra-passe.
  //
  // A chave usa o nome tal como foi escrito, em minúsculas e já truncado a 40
  // caracteres. Não abre um oráculo de enumeração: uma conta inexistente e uma
  // palavra-passe errada seguem exactamente o mesmo caminho (`!user`), gastam o
  // mesmo contador e devolvem a mesma resposta. Só escapa ao contador quem já
  // acertou nas credenciais — e esse já sabe o que o oráculo lhe diria.
  const chaveConta = `login-conta:${name.toLowerCase()}`;

  /** 429 do tecto por conta, gastando uma tentativa. */
  async function gastarTentativaDaConta(): Promise<NextResponse | null> {
    const conta = await rateLimit(chaveConta, 20, 3_600_000);
    if (conta.ok) return null;
    log.warn("admin login rate-limited por conta", { ip, name });
    return NextResponse.json(
      { error: "Demasiadas tentativas nesta conta. Tente mais tarde." },
      { status: 429, headers: { "Retry-After": String(conta.retryAfter ?? 3600) } },
    );
  }

  const user = await verifyCredentials(name, password);
  if (!user) {
    const travado = await gastarTentativaDaConta();
    if (travado) return travado;
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
      // O código errado é a tentativa que mais interessa travar: é aqui que
      // quem já tem a palavra-passe procura os 6 dígitos.
      const travado = await gastarTentativaDaConta();
      if (travado) return travado;
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
