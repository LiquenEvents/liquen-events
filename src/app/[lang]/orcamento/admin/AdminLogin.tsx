"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/orcamento/admin/ui";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

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
      style={{ background: "linear-gradient(135deg, #1b2119 0%, #232c21 60%, #1e2a1c 100%)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Brand mark */}
        <Image
          src="/logo-liquen-branco.png"
          alt="Líquen Events"
          width={210}
          height={125}
          preload
          className="h-16 w-auto object-contain opacity-95"
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
        </Card>

        <p className="text-[10px] tracking-[0.3em] uppercase text-white/25">
          Líquen Events · Évora
        </p>
      </div>
    </div>
  );
}
