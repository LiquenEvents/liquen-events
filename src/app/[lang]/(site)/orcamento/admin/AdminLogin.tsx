"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/(site)/orcamento/admin/ui";
import { entrarComDispositivo, mensagemDeErro, suportaPasskeys } from "@/lib/passkeys-cliente";
import { EntradaComFotografia, RodapeDaEntrada } from "./EntradaComFotografia";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aEntrarComDispositivo, setAEntrarComDispositivo] = useState(false);
  // Recuperação: painel fechado por omissão, para a página continuar a ser uma
  // página de ENTRADA. Só abre a quem o pedir.
  const [aRecuperar, setARecuperar] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState("");
  const [aEnviarLigacao, setAEnviarLigacao] = useState(false);
  const [respostaRecuperacao, setRespostaRecuperacao] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);
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
        body: JSON.stringify({ password, email, code }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.needs2fa) {
        setNeeds2fa(true);
        setError(code ? "Código de verificação inválido." : "Introduz o código de verificação.");
      } else {
        // A frase vem do servidor e é a MESMA para «esta conta não existe» e
        // «a palavra-passe está errada». O plano B nunca pode ser mais
        // específico do que ela — era por aí que voltava a distinção.
        setError(data?.error ?? "Credenciais incorretas.");
      }
      setLoading(false);
    } catch {
      setError("Erro de ligação. Tenta novamente.");
      setLoading(false);
    }
  }

  /**
   * Pedir a ligação para definir uma palavra-passe nova.
   *
   * A resposta do servidor é NEUTRA de propósito — não diz se o endereço
   * existe — e é essa frase que se mostra, tal e qual. Escrever aqui um
   * «enviámos!» mais simpático transformava esta caixa num verificador de
   * endereços da equipa.
   */
  async function pedirLigacao(e: React.FormEvent) {
    e.preventDefault();
    if (aEnviarLigacao) return;
    setAEnviarLigacao(true);
    setRespostaRecuperacao(null);
    try {
      const res = await fetch("/api/admin/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailRecuperacao }),
      });
      const data = await res.json().catch(() => ({}));
      setRespostaRecuperacao(
        res.ok
          ? { tipo: "ok", texto: data?.mensagem ?? "Pedido registado." }
          : {
              tipo: "erro",
              texto: data?.error ?? "Não foi possível tratar o pedido. Tenta daqui a bocado.",
            },
      );
    } catch {
      setRespostaRecuperacao({ tipo: "erro", texto: "Erro de ligação. Tenta novamente." });
    }
    setAEnviarLigacao(false);
  }

  return (
    <EntradaComFotografia>
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
              Bem-vinda. Entra com o teu email para continuares.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="O teu email"
              name="email"
              /**
               * ── PORQUE É QUE ISTO É UM EMAIL E NÃO UM NOME ─────────────
               *
               * Um nome próprio é curto, está escrito no site, colide assim
               * que a equipa cresça, e nenhum gestor de palavras-passe o sabe
               * guardar — o que empurra toda a gente para palavras-passe
               * repetidas e decoradas. O email resolve as quatro coisas.
               *
               * `type="email"` traz o teclado com o @ no telemóvel;
               * `autoComplete="username"` é o par que os gestores de
               * palavras-passe esperam encontrar ao lado do
               * `current-password` — sem ele, muitos não oferecem nada.
               * `spellCheck={false}` e `autoCapitalize="none"` evitam o
               * «Catarina@…» que o teclado de iOS faz sozinho.
               *
               * SEM EXEMPLO, e é de propósito: estava aqui o nome verdadeiro
               * de quem trabalha na empresa, numa página que qualquer pessoa
               * na internet consegue abrir. Quem tenta entrar sem ser
               * convidado precisa de um identificador válido e de uma
               * palavra-passe — e nós dávamos a primeira metade.
               */
              type="email"
              inputMode="email"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
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
                hint="Escreve o código de 6 dígitos da tua aplicação de autenticação."
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

          {/* ── Recuperação ────────────────────────────────────────────────
              Fica FORA do <form> de entrada: dois formulários encaixados são
              HTML inválido, e o Enter dentro do painel submetia a entrada. */}
          {!aRecuperar ? (
            <button
              type="button"
              onClick={() => {
                setARecuperar(true);
                // Leva o que já estava escrito: quem chegou aqui é porque a
                // palavra-passe falhou, e reescrever o email é atrito a mais.
                setEmailRecuperacao(email);
              }}
              className="mt-4 w-full text-center text-xs text-foreground/50 underline underline-offset-4 hover:text-foreground/75"
            >
              Esqueceste-te da palavra-passe?
            </button>
          ) : (
            <form
              onSubmit={pedirLigacao}
              className="mt-5 flex flex-col gap-3 border-t border-foreground/10 pt-5"
            >
              <p className="text-xs leading-relaxed text-foreground/55">
                Escreve o teu email e enviamos-te uma ligação para definires uma palavra-passe nova.
                A ligação serve uma vez e dura 30 minutos.
              </p>
              <Field
                label="Email da tua conta"
                name="email-recuperacao"
                type="email"
                inputMode="email"
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                value={emailRecuperacao}
                onChange={(e) => setEmailRecuperacao(e.target.value)}
                required
                autoFocus
              />
              {respostaRecuperacao && (
                <p
                  role="status"
                  aria-live="polite"
                  className={
                    respostaRecuperacao.tipo === "ok"
                      ? "text-xs leading-relaxed text-foreground/70"
                      : "flex items-start gap-1.5 text-xs leading-relaxed text-[#8a2a22]"
                  }
                >
                  {respostaRecuperacao.tipo === "erro" && <span aria-hidden="true">⚠</span>}
                  <span>{respostaRecuperacao.texto}</span>
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" variant="secondary" size="sm" loading={aEnviarLigacao}>
                  {aEnviarLigacao ? "A enviar…" : "Enviar ligação"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setARecuperar(false);
                    setRespostaRecuperacao(null);
                  }}
                  className="text-xs text-foreground/50 underline underline-offset-4 hover:text-foreground/75"
                >
                  Voltar
                </button>
              </div>
            </form>
          )}

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
                dispositivos que já tenhas registado aqui dentro.
              </p>
            </>
          )}
        </Card>

        <RodapeDaEntrada />
      </div>
    </EntradaComFotografia>
  );
}
