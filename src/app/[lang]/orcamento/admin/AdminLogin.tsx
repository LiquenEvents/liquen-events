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
    <div
      className="min-h-screen flex"
      style={{ background: "linear-gradient(135deg, #1b2119 0%, #232c21 60%, #1e2a1c 100%)" }}
    >
      {/* Left decorative panel — hidden on mobile */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center px-16 relative overflow-hidden">
        {/* Subtle circle */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 50%, #8aad85 0%, transparent 60%), radial-gradient(circle at 80% 20%, #637a5f 0%, transparent 40%)",
          }}
        />
        <div className="relative z-10 text-center">
          <Image
            src="/logo-liquen-branco.png"
            alt="Líquen Events"
            width={210}
            height={125}
            priority
            className="h-20 w-auto object-contain opacity-95 mx-auto mb-8"
          />
          <p
            className="text-white/70 font-bold leading-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 3vw, 38px)" }}
          >
            Gestão de Eventos
          </p>
          <p className="text-white/25 text-sm mt-3 max-w-xs mx-auto leading-relaxed">
            Área de administração exclusiva para a equipa Líquen Events.
          </p>
        </div>
        <p className="absolute bottom-8 text-white/15 text-[10px] tracking-[0.3em] uppercase">
          Líquen Events · Évora
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 lg:max-w-md flex flex-col items-center justify-center px-8 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <Image
            src="/logo-liquen-branco.png"
            alt="Líquen Events"
            width={210}
            height={125}
            priority
            className="h-14 w-auto object-contain opacity-95"
          />
        </div>

        <div className="w-full max-w-sm">
          {/* Card */}
          <div
            className="rounded-2xl p-8 border"
            style={{
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.09)",
              backdropFilter: "blur(24px)",
            }}
          >
            <p className="text-white/25 text-[9px] tracking-[0.45em] uppercase mb-2 text-center">
              Área Restrita
            </p>
            <h1
              className="text-white/88 font-bold text-center mb-8"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.2vw, 26px)" }}
            >
              Painel de Gestão
            </h1>

            <form onSubmit={submit} className="flex flex-col gap-5">
              <div>
                <label
                  htmlFor="login-name"
                  className="block text-white/30 text-[9px] tracking-[0.4em] uppercase mb-2"
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
                  className="w-full rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/20 focus:outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                    e.currentTarget.style.borderColor = "rgba(138,173,133,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                  }}
                  placeholder="Ex: Catarina"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-white/30 text-[9px] tracking-[0.4em] uppercase mb-2"
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
                  className="w-full rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/20 focus:outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                    e.currentTarget.style.borderColor = "rgba(138,173,133,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                  }}
                  placeholder="••••••••"
                />
              </div>

              {needs2fa && (
                <div>
                  <label
                    htmlFor="login-code"
                    className="block text-white/30 text-[9px] tracking-[0.4em] uppercase mb-2"
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
                    className="w-full rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em] text-white/80 placeholder-white/20 focus:outline-none transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                      e.currentTarget.style.borderColor = "rgba(138,173,133,0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                    }}
                    placeholder="000000"
                  />
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="text-[#8aad85] text-xs text-center"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 mt-1 text-white text-[11px] tracking-[0.22em] uppercase rounded-xl transition-all duration-200 disabled:opacity-40"
                style={{ background: loading ? "#4d6350" : "#637a5f" }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "#4d6350";
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = "#637a5f";
                }}
              >
                {loading ? "A verificar…" : needs2fa ? "Verificar →" : "Entrar →"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
