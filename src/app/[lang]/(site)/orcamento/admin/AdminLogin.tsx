"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/(site)/orcamento/admin/ui";
import { entrarComDispositivo, mensagemDeErro, suportaPasskeys } from "@/lib/passkeys-cliente";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aEntrarComDispositivo, setAEntrarComDispositivo] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  /**
   * A entrada por dispositivo só aparece onde o browser a percebe — um botão
   * que falha ao ser tocado é pior do que um botão que não existe.
   *
   * `useSyncExternalStore` e não um efeito com `setState`: isto é uma
   * capacidade do ambiente, não um estado que muda. O servidor devolve `false`
   * (não há `window`), o browser devolve o que sabe, e o React trata da
   * diferença sem um segundo desenho pedido à mão. A subscrição não faz nada
   * de propósito: a resposta nunca muda durante a vida da página.
   */
  const temPasskeys = useSyncExternalStore(
    () => () => {},
    suportaPasskeys,
    () => false,
  );

  async function entrarPorDispositivo() {
    if (aEntrarComDispositivo || loading) return;
    setAEntrarComDispositivo(true);
    setError(null);
    try {
      await entrarComDispositivo();
      router.refresh();
    } catch (err) {
      // Cancelar não é falhar: `mensagemDeErro` devolve null e o ecrã fica
      // como estava, sem aviso vermelho por a pessoa ter mudado de ideias.
      const msg = mensagemDeErro(err);
      if (msg) setError(msg);
      setAEntrarComDispositivo(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, name, code }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.needs2fa) {
        setNeeds2fa(true);
        setError(code ? "Código de verificação inválido." : "Introduza o código de verificação.");
      } else {
        setError(data?.error ?? "Palavra-passe incorreta.");
      }
      setLoading(false);
    } catch {
      setError("Erro de ligação. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(180deg, #ffffff 0%, #f4f5f3 100%)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Brand mark — colour logo on the light, calm entry screen */}
        <Image
          src="/logo-liquen.png"
          alt="Líquen Events"
          width={210}
          height={125}
          priority
          className="h-16 w-auto object-contain"
        />

        {/* Login card */}
        <Card padding="lg" className="w-full">
          <div className="mb-6 text-center">
            <p className="bo-eyebrow mb-2">Área Restrita</p>
            <h1 className="font-display text-2xl leading-tight text-foreground/90">
              Painel de Gestão
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-foreground/55">
              Bem-vindo. Introduza as suas credenciais para continuar.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="O teu nome"
              name="name"
              type="text"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Ex.: Catarina"
            />

            <Field
              label="Palavra-passe"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />

            {needs2fa && (
              <Field
                label="Código de verificação (2FA)"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                hint="Introduza o código de 6 dígitos da sua aplicação de autenticação."
                placeholder="000000"
                className="text-center text-lg tracking-[0.4em]"
              />
            )}

            {error && (
              <p
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-1.5 text-sm leading-relaxed text-[#8a2a22]"
              >
                <span aria-hidden="true">⚠</span>
                <span>{error}</span>
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={loading}
              className="mt-1"
              iconRight={<span aria-hidden="true">→</span>}
            >
              {loading ? "A verificar…" : needs2fa ? "Verificar" : "Entrar"}
            </Button>
          </form>

          {temPasskeys && (
            <>
              <div className="my-5 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-foreground/10" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/35">
                  ou
                </span>
                <span className="h-px flex-1 bg-foreground/10" />
              </div>

              <Button
                type="button"
                variant="secondary"
                size="lg"
                fullWidth
                loading={aEntrarComDispositivo}
                onClick={entrarPorDispositivo}
                iconLeft={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
                  </svg>
                }
              >
                {aEntrarComDispositivo ? "A confirmar…" : "Entrar com este dispositivo"}
              </Button>

              <p className="mt-3 text-center text-xs leading-relaxed text-foreground/45">
                Usa o rosto, a impressão digital ou o PIN deste aparelho. Só funciona em
                dispositivos que já tenha registado aqui dentro.
              </p>
            </>
          )}
        </Card>

        <p className="text-[10px] tracking-[0.3em] uppercase text-white/25">
          Líquen Events · Évora
        </p>
      </div>
    </div>
  );
}
