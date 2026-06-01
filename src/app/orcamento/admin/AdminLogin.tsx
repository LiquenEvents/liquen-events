"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image
            src="/logo-liquen-branco.png"
            alt="Líquen Events"
            width={100}
            height={60}
            priority
            className="h-14 w-auto opacity-90"
          />
        </div>
        <p className="text-foreground/22 text-[10px] tracking-[0.5em] uppercase mb-6 text-center">
          Área Restrita
        </p>
        <h1
          className="text-foreground font-bold text-center mb-10"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 2.6vw, 30px)" }}
        >
          Painel de Gestão
        </h1>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <div>
            <label
              htmlFor="login-name"
              className="block text-[10px] text-foreground/28 tracking-[0.45em] uppercase mb-3"
            >
              O teu nome
            </label>
            <input
              id="login-name"
              name="name"
              type="text"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full bg-transparent border-b border-foreground/15 pb-3 text-sm text-foreground placeholder-foreground/18 focus:outline-none focus:border-moss/55 transition-colors duration-300"
              placeholder="Ex: Catarina"
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="block text-[10px] text-foreground/28 tracking-[0.45em] uppercase mb-3"
            >
              Palavra-passe
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={error ? true : undefined}
              className="w-full bg-transparent border-b border-foreground/15 pb-3 text-sm text-foreground placeholder-foreground/18 focus:outline-none focus:border-moss/55 transition-colors duration-300"
              placeholder="••••••••"
            />
          </div>
          {needs2fa && (
            <div>
              <label
                htmlFor="login-code"
                className="block text-[10px] text-foreground/28 tracking-[0.45em] uppercase mb-3"
              >
                Código de verificação (2FA)
              </label>
              <input
                id="login-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                className="w-full bg-transparent border-b border-foreground/15 pb-3 text-center text-lg tracking-[0.5em] text-foreground placeholder-foreground/18 focus:outline-none focus:border-moss/55 transition-colors duration-300"
                placeholder="000000"
              />
            </div>
          )}
          {error && (
            <p role="alert" aria-live="assertive" className="text-moss/80 text-xs">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-moss text-cream text-[11px] tracking-[0.2em] uppercase rounded-sm hover:bg-moss-dark transition-colors disabled:opacity-40"
          >
            {loading ? "A verificar…" : needs2fa ? "Verificar →" : "Entrar →"}
          </button>
        </form>
      </div>
    </div>
  );
}
