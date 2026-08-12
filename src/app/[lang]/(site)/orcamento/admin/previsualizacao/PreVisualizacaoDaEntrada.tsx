"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FICHEIRO TEMPORÁRIO — A BANCADA DE MEDIÇÃO DA ENTRADA. APAGAR DEPOIS.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. O `EntradaComFotografia` é para pendurar no `AdminLogin.tsx`,
 * que está a ser mexido NOUTRA FRENTE (email como identificador, recuperação de
 * palavra-passe). Editá-lo para medir era pedir um conflito. Esta página
 * desenha o MESMO cartão dentro do componente novo, num caminho próprio
 * (`/orcamento/admin/previsualizacao`, com `noindex`), para o
 * `scripts/medir-entrada-admin.mjs` ter o que medir.
 *
 * O QUE ESTÁ AQUI DENTRO É UMA CÓPIA da coluna interior do `AdminLogin` tal
 * como ela está HOJE — email, palavra-passe, «Esqueceste-te da palavra-passe?»
 * e o bloco de entrada por dispositivo. A cópia tem de ser fiel ou a medição
 * mente: o que interessa saber é onde é que o botão «Entrar» acaba no ecrã de
 * um telemóvel, e isso muda com CADA campo que o cartão ganhar. A versão
 * anterior deste ficheiro ainda tinha o campo «O teu nome» e não tinha nem a
 * recuperação nem os passkeys — media um cartão que já não existe.
 *
 * Nada aqui submete nada: os `onSubmit` são inertes de propósito. Isto é uma
 * fotografia do ecrã, não uma segunda porta de entrada.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/(site)/orcamento/admin/ui";
import { suportaPasskeys } from "@/lib/passkeys-cliente";
import {
  EntradaComFotografia,
  RodapeDaEntrada,
} from "@/app/[lang]/(site)/orcamento/admin/EntradaComFotografia";

export default function PreVisualizacaoDaEntrada() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [aRecuperar, setARecuperar] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState("");

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  // O mesmo teste do AdminLogin, para o cartão medido ter a mesma ALTURA que o
  // cartão verdadeiro: o bloco dos passkeys aparece em todo o browser moderno,
  // e ignorá-lo dava uma medição de dobra optimista em ~120 px.
  const temPasskeys = useSyncExternalStore(
    () => () => {},
    suportaPasskeys,
    () => false,
  );

  return (
    <EntradaComFotografia>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <Image
          src="/logo-liquen.png"
          alt="Líquen Events"
          width={210}
          height={125}
          priority
          className="h-16 w-auto object-contain"
        />

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

          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
            <Field
              label="O teu email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <Button
              type="submit"
              size="lg"
              fullWidth
              className="mt-1"
              iconRight={<span aria-hidden="true">→</span>}
            >
              Entrar
            </Button>
          </form>

          {!aRecuperar ? (
            <button
              type="button"
              onClick={() => {
                setARecuperar(true);
                setEmailRecuperacao(email);
              }}
              className="mt-4 w-full text-center text-xs text-foreground/50 underline underline-offset-4 hover:text-foreground/75"
            >
              Esqueceste-te da palavra-passe?
            </button>
          ) : (
            <form
              onSubmit={(e) => e.preventDefault()}
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
              />
              <div className="flex items-center gap-2">
                <Button type="submit" variant="secondary" size="sm">
                  Enviar ligação
                </Button>
                <button
                  type="button"
                  onClick={() => setARecuperar(false)}
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
                Entrar com este dispositivo
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
