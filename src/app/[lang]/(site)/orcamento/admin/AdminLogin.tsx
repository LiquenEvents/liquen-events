"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, Field, Button } from "@/app/[lang]/(site)/orcamento/admin/ui";
import {
  armarEntradaAutomatica,
  cancelarCerimonia,
  entrarComDispositivo,
  mensagemDeErro,
  suportaAutofillDePasskeys,
  suportaPasskeys,
} from "@/lib/passkeys-cliente";
import { EntradaComFotografia, RodapeDaEntrada } from "./EntradaComFotografia";
import {
  PARAM_DESTINO,
  consumirMarcaDeSaida,
  consumirMarcaDeSessao,
  destinoSeguro,
} from "./entrada-destino";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desenho da PÁGINA (a fotografia, o véu, as medidas) vive no
 * `EntradaComFotografia.tsx` e o cabeçalho dele explica-o. Aqui está o que se
 * FAZ na porta, e a ordem por que se faz.
 *
 * ── PRIMEIRO O APARELHO, DEPOIS A PALAVRA-PASSE ───────────────────────────
 * Estava ao contrário: o formulário em cima e «Entrar com este dispositivo» lá
 * em baixo, depois de um «ou», com três linhas a explicá-lo. Ou seja, o método
 * mais rápido E mais seguro dos dois — não há segredo partilhado para roubar, e
 * a assinatura está presa à origem que o browser vê, portanto não se pode dar
 * por engano num site cópia — estava desenhado como a alternativa.
 *
 * Agora é o botão principal, e o aparelho já registado nem espera pelo clique:
 * `armarEntradaAutomatica` deixa a passkey proposta na lista do preenchimento
 * automático, e escolhê-la basta.
 *
 * ── E O CAMINHO INVERSO, QUE NÃO EXISTIA ──────────────────────────────────
 * Nada nesta página dizia como se REGISTA um aparelho novo. Quem trocasse de
 * telemóvel via um botão que não funcionava e nenhuma explicação — e registar
 * exige sessão aberta, portanto a resposta («entra com a palavra-passe e regista
 * lá dentro») não é adivinhável. Está escrita, em duas linhas, no fundo do
 * cartão.
 *
 * ── O QUE ISTO CUSTOU À DOBRA DO TELEMÓVEL, medido ────────────────────────
 * A 390x844 (o iPhone que ela usa), fundo de cada botão contado do topo do
 * ecrã. A condição que o `EntradaComFotografia` põe é que o botão de entrar
 * caiba acima da dobra:
 *
 *                          antes    depois
 *   «Entrar com este dispositivo»     800       465    ← passou a ser o primeiro
 *   entrar com palavra-passe          660       831    ← desceu, e continua acima
 *
 * A palavra-passe desce 171 px: é o preço de a passkey passar para cima, e é
 * pago com 13 px de folga para a dobra, não com fé. Foram precisos três cortes
 * para lá chegar, e cada um está anotado onde foi feito — o maior é a caixa de
 * «manter a sessão iniciada», que só explica o que se perde DEPOIS de ser
 * desligada. A página inteira passa de 975 para 1150 px de altura; o que cresce
 * fica todo abaixo do botão (a recuperação e o «mudaste de telemóvel?»).
 *
 * ── O QUE NÃO PODE MUDAR DAQUI ────────────────────────────────────────────
 * A frase de recusa vem do servidor e é a MESMA haja ou não haja conta com
 * aquele endereço. O plano B local nunca pode ser mais específico do que ela.
 */

/** Onde vive a lista de dispositivos, dito por palavras e não por um link que
 *  daqui não se pode seguir (o ecrã está atrás da sessão). */
const ONDE_SE_REGISTA = "Os meus dispositivos";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aEntrarComDispositivo, setAEntrarComDispositivo] = useState(false);
  /** Bloco 3: escrever às cegas no telemóvel é das coisas mais irritantes. */
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  /**
   * «Manter a sessão iniciada.» Ligada por omissão: era o que já acontecia
   * (30 dias), e mudar o valor por omissão punha a equipa a voltar a entrar
   * todos os dias sem ninguém ter pedido nada. Ver `duracaoDaSessao`.
   */
  const [manterSessao, setManterSessao] = useState(true);
  // Recuperação: painel fechado por omissão, para a página continuar a ser uma
  // página de ENTRADA. Só abre a quem o pedir.
  const [aRecuperar, setARecuperar] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState("");
  const [aEnviarLigacao, setAEnviarLigacao] = useState(false);
  const [respostaRecuperacao, setRespostaRecuperacao] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);
  /** A sessão caiu a meio do trabalho nesta aba? Ver `entrada-destino.ts`. */
  const [sessaoExpirou, setSessaoExpirou] = useState(false);
  const router = useRouter();
  const capsId = useId();

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  useEffect(() => {
    // A marca é consumida ao ler: o aviso é para esta chegada à entrada, não
    // para todas as que venham a seguir dentro da mesma aba.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessaoExpirou(consumirMarcaDeSessao());
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

  /**
   * ── PARA ONDE SE VOLTA DEPOIS DE ENTRAR ───────────────────────────────────
   *
   * Lido do `?destino=` e VALIDADO em `destinoSeguro` — que só deixa passar
   * caminhos internos do back office, porque «vai para onde o URL disser» é um
   * redireccionamento aberto e o cabeçalho do `entrada-destino.ts` explica ao
   * que sabe. Sai daqui `null` ou um caminho que começa por `/`.
   *
   * Lido do `window` e não do `useSearchParams`: o instantâneo do servidor é
   * `null`, portanto o HTML sai igual em qualquer caso e não há hidratação
   * dividida nem fronteira de `Suspense` a montar por uma linha de texto.
   */
  const destino = useSyncExternalStore(
    () => () => {},
    lerDestinoDoUrl,
    () => null,
  );

  /** Depois de a sessão estar aberta: ou se vai ao sítio pedido, ou se fica. */
  const entrou = useCallback(() => {
    /**
     * VOLTA-SE AO TOPO ANTES DE ENTRAR.
     *
     * Esta página passou a ser alta — a fotografia ocupa o ecrã inteiro — e o
     * browser guarda a posição do scroll quando o conteúdo é substituído no
     * lugar (`router.refresh()`). Resultado medido num ecrã de 375×568: quem
     * entrava caía no back office já a 66 px do topo, com o cabeçalho a
     * aparecer encolhido, como se a página já tivesse sido lida.
     *
     * Foi o passeio móvel que o apanhou, e apanhou-o bem: media o cabeçalho
     * «no topo» quando ele já não estava no topo.
     */
    window.scrollTo(0, 0);
    if (destino && destino !== window.location.pathname + window.location.search) {
      router.replace(destino);
      return;
    }
    // Sem destino, a própria página onde estamos passa a ter sessão: basta
    // voltar a pedi-la ao servidor. É também o caso do `/carregamento/[id]`,
    // que desenha esta entrada NO LUGAR e portanto já está no sítio certo.
    router.refresh();
  }, [destino, router]);

  const manterSessaoRef = useRef(manterSessao);
  useEffect(() => {
    manterSessaoRef.current = manterSessao;
  });

  /**
   * O Caps Lock, lido do próprio evento de teclado.
   *
   * `getModifierState` é a única forma de o saber: não existe um evento de «o
   * Caps Lock mudou». Ler no `keydown` E no `keyup` é o que faz o aviso
   * aparecer e desaparecer na própria tecla que o liga — no `keydown` da tecla
   * Caps Lock o estado ainda é o antigo, e no `keyup` já é o novo.
   *
   * Nos teclados de telemóvel `getModifierState` devolve sempre `false`, e é o
   * que se quer: lá não há Caps Lock, há a maiúscula automática, que é outra
   * coisa e não é um engano.
   */
  const aoTeclar = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (typeof e.getModifierState !== "function") return;
    setCapsLock(e.getModifierState("CapsLock"));
  }, []);

  /**
   * ── A PASSKEY PROPOSTA SEM SE CARREGAR EM NADA ────────────────────────────
   *
   * `mediation: "conditional"` (via `useBrowserAutofill`): o browser junta as
   * passkeys deste domínio à lista do preenchimento automático do campo do
   * email — que tem `autoComplete="username webauthn"` por causa disto. Num
   * aparelho já registado, entrar passa a ser escolher uma linha.
   *
   * Só arma onde o browser o sabe fazer; onde não sabe, fica o botão, que
   * continua a ser o caminho principal e não um plano B.
   */
  useEffect(() => {
    if (!temPasskeys) return;
    // QUEM ACABOU DE SAIR FICA FORA. A marca é consumida aqui, uma vez por
    // chegada à porta — ver `consumirMarcaDeSaida`. Medido: sem isto, entre o
    // clique em «Sair» e o ecrã de entrada assentar passavam 600 ms e a sessão
    // estava aberta outra vez, sem um único toque.
    if (consumirMarcaDeSaida()) return;
    let desarmar: (() => void) | undefined;
    let cancelado = false;
    void suportaAutofillDePasskeys().then((podeAutofill) => {
      if (cancelado || !podeAutofill) return;
      desarmar = armarEntradaAutomatica({
        aoEntrar: () => entrou(),
        // Uma falha do caminho automático não pode pintar de vermelho um ecrã
        // onde ninguém pediu nada: a pessoa continua a poder escrever a
        // palavra-passe, e o botão continua lá.
        aoFalhar: () => {},
        manterSessao: () => manterSessaoRef.current,
      });
    });
    return () => {
      cancelado = true;
      desarmar?.();
    };
  }, [temPasskeys, entrou]);

  async function entrarPorDispositivo() {
    if (aEntrarComDispositivo || loading) return;
    setAEntrarComDispositivo(true);
    setError(null);
    try {
      await entrarComDispositivo({ manterSessao });
      entrou();
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
    // O duplo envio fecha-se aqui e no botão (`loading` desactiva-o): o Enter
    // repetido não passa pelo botão nenhuma vez.
    if (loading) return;
    setLoading(true);
    setError(null);
    // A cerimónia do autofill fica pendurada à espera de uma escolha que já não
    // vai acontecer — e uma cerimónia viva impede a próxima de arrancar.
    cancelarCerimonia();
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, email, code, manterSessao }),
      });
      if (res.ok) {
        entrou();
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
          <div className="mb-5 text-center">
            <p className="bo-eyebrow mb-2">Área Restrita</p>
            <h1 className="font-display text-2xl leading-tight text-foreground/90">
              Painel de Gestão
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-foreground/55">
              Bem-vinda. Escolhe como queres entrar.
            </p>
          </div>

          {/* ── A sessão caiu a meio ────────────────────────────────────────
              Um redireccionamento seco para a entrada não explica nada: quem
              estava a meio de uma proposta fica sem saber se perdeu o trabalho.
              A frase diz as duas coisas — o que aconteceu e o que não se
              perdeu. */}
          {sessaoExpirou && (
            <p
              role="status"
              className="mb-5 rounded-xl bg-[#fbf7ec] px-3.5 py-3 text-sm leading-relaxed text-[#6b5720]"
            >
              A tua sessão expirou. Entra outra vez — tudo o que já tinha sido guardado está
              guardado.
            </p>
          )}

          {/* ── 1. O APARELHO, que é o caminho principal ─────────────────── */}
          {temPasskeys && (
            <div className="mb-4">
              <Button
                type="button"
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

              {/* Uma linha, e não três. O que a pessoa precisa de saber para
                  decidir se carrega é o gesto que lhe vai ser pedido. */}
              <p className="mt-2 text-center text-xs leading-relaxed text-foreground/45">
                Com o rosto, a impressão digital ou o PIN deste aparelho.
              </p>

              <div className="my-4 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-foreground/10" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/35">
                  ou
                </span>
                <span className="h-px flex-1 bg-foreground/10" />
              </div>
            </div>
          )}

          {/* ── 2. A PALAVRA-PASSE, a alternativa ────────────────────────── */}
          <form onSubmit={submit} className="flex flex-col gap-3.5" onFocus={aoFocarCampo}>
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
               * `spellCheck={false}` e `autoCapitalize="none"` evitam o
               * «Catarina@…» que o teclado de iOS faz sozinho.
               *
               * `autoComplete="username webauthn"`: `username` é o par que os
               * gestores de palavras-passe esperam encontrar ao lado do
               * `current-password` — sem ele, muitos não oferecem nada. O
               * `webauthn` NO FIM é o que a norma exige para o browser juntar
               * as passkeys a essa mesma lista (ver `armarEntradaAutomatica`);
               * fora do fim, é ignorado.
               *
               * SEM EXEMPLO, e é de propósito: estava aqui o nome verdadeiro
               * de quem trabalha na empresa, numa página que qualquer pessoa
               * na internet consegue abrir. Quem tenta entrar sem ser
               * convidado precisa de um identificador válido e de uma
               * palavra-passe — e nós dávamos a primeira metade.
               */
              type="email"
              inputMode="email"
              autoComplete={temPasskeys ? "username webauthn" : "username"}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyUp={aoTeclar}
              /* Bloco 3: ambos os campos são obrigatórios, portanto ambos
                 levam o asterisco. Ter só um marcado dizia que o outro não
                 era — e era. */
              required
              autoFocus
            />

            {/* O olho de mostrar/ocultar. `relative` no invólucro e o botão
                encostado ao FUNDO: o campo é o último filho do `Field`, logo o
                fundo do invólucro é o fundo do campo — e continua a ser quando
                a letra do telemóvel cresce para os 16 px. */}
            <div className="relative">
              <Field
                label="Palavra-passe"
                name="password"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={aoTeclar}
                onKeyDown={aoTeclar}
                required
                placeholder="••••••••"
                /* O aviso do Caps Lock vive fora do `Field` (senão empurrava o
                   olho para baixo ao aparecer); a ligação para quem usa leitor
                   de ecrã faz-se à mão. */
                aria-describedby={capsLock ? capsId : undefined}
                /* Espaço para o olho. Em estilo e não numa classe: o `cn` desta
                   casa não resolve conflitos do Tailwind, e um `pr-12` ao lado
                   do `px-3.5` do `Field` decidia-se pela ordem da folha de
                   estilos, que não é coisa que se queira adivinhar. */
                style={{ paddingRight: "2.75rem" }}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                /* 40 px com rato, 44 no dedo — o mínimo das HIG, o mesmo que o
                   `ui/Button` usa. */
                className="absolute bottom-0 right-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-foreground/40 transition-colors hover:text-foreground/70 pointer-coarse:h-11 pointer-coarse:w-11"
                aria-label={mostrarSenha ? "Ocultar a palavra-passe" : "Mostrar a palavra-passe"}
                aria-pressed={mostrarSenha}
                /* Fora da ordem de tabulação: quem anda de campo em campo com o
                   teclado quer ir do email para a palavra-passe e daí para o
                   botão de entrar, não parar num olho pelo meio. Continua
                   alcançável pelo rato, pelo dedo e por leitor de ecrã. */
                tabIndex={-1}
              >
                {mostrarSenha ? <OlhoFechado /> : <OlhoAberto />}
              </button>
            </div>

            {/* Caps Lock. Um aviso, não um erro: a palavra-passe pode muito bem
                ter maiúsculas de propósito. */}
            {capsLock && (
              <p
                id={capsId}
                role="status"
                className="-mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[#6b5720]"
              >
                <span aria-hidden="true">⇪</span>
                <span>O Caps Lock está ligado.</span>
              </p>
            )}

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
                required
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

            {/* ── Manter a sessão iniciada ──────────────────────────────────
                Com a duração dita por extenso: «manter-me com sessão iniciada»
                sem número é uma promessa que cada pessoa lê como quer. O alvo
                de toque é a linha inteira (`alvo-toque` no rótulo), não o
                quadrado de 16 px.

                A CONSEQUÊNCIA DE DESLIGAR só aparece depois de desligada, e é
                de propósito: ligada é o que já acontecia e não precisa de
                explicação nenhuma, e as três linhas do «se desligares…»
                custavam 54 px que empurravam o botão de submeter para baixo da
                dobra do telemóvel (medido a 390x844). Quem desliga vê logo o
                que trocou. */}
            <label className="alvo-toque flex cursor-pointer items-start gap-2.5 text-left">
              <input
                type="checkbox"
                name="manterSessao"
                checked={manterSessao}
                onChange={(e) => setManterSessao(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#4d6350]"
              />
              <span className="text-xs leading-relaxed text-foreground/60">
                Manter a sessão iniciada 30 dias neste aparelho.
                {!manterSessao && (
                  <span className="block text-foreground/45">
                    Desligada, a sessão dura 12 horas e fecha-se ao fechares o browser.
                  </span>
                )}
              </span>
            </label>

            <Button
              type="submit"
              /* Secundário porque a passkey é que é o caminho principal — mas
                 só quando ela existe. Onde o browser não sabe o que é uma
                 passkey, isto é a única porta e tem de ter o peso de uma. */
              variant={temPasskeys ? "secondary" : "primary"}
              size="lg"
              fullWidth
              loading={loading}
              className="mt-1"
              iconRight={<span aria-hidden="true">→</span>}
            >
              {loading ? "A verificar…" : needs2fa ? "Verificar" : "Entrar com palavra-passe"}
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
              className="alvo-toque mt-4 w-full text-center text-xs text-foreground/50 underline underline-offset-4 hover:text-foreground/75"
            >
              Esqueceste-te da palavra-passe?
            </button>
          ) : (
            <form
              onSubmit={pedirLigacao}
              className="mt-5 flex flex-col gap-3 border-t border-foreground/10 pt-5"
              onFocus={aoFocarCampo}
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
                  className="alvo-toque text-xs text-foreground/50 underline underline-offset-4 hover:text-foreground/75"
                >
                  Voltar
                </button>
              </div>
            </form>
          )}

          {/* ── O CAMINHO INVERSO: registar um aparelho novo ────────────────
              Isto é o que faltava. Um botão «entrar com este dispositivo» num
              telemóvel novo não faz nada, e não havia uma palavra sobre porquê
              nem sobre o que fazer a seguir. Registar EXIGE sessão aberta — é
              essa a razão de a primeira entrada de cada aparelho ser sempre com
              a palavra-passe — e isso tem de estar escrito aqui, que é onde a
              pessoa está quando faz a pergunta. */}
          {temPasskeys && (
            <div className="mt-5 border-t border-foreground/10 pt-4">
              <p className="text-xs font-medium text-foreground/70">
                Mudaste de telemóvel ou de computador?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/50">
                Entra aqui com o email e a palavra-passe. Já dentro, abre{" "}
                <span className="font-medium text-foreground/70">«{ONDE_SE_REGISTA}»</span>, no
                fundo da barra lateral, e regista este aparelho. Da próxima vez entras só com o
                rosto ou a impressão digital. Podes registar mais do que um — e apagar de lá o que
                já não usas.
              </p>
            </div>
          )}
        </Card>

        <RodapeDaEntrada />
      </div>
    </EntradaComFotografia>
  );
}

// ── Peças pequenas ─────────────────────────────────────────────────────────

/** O destino pedido no URL, já limpo. Só corre no browser. */
function lerDestinoDoUrl(): string | null {
  try {
    return destinoSeguro(new URLSearchParams(window.location.search).get(PARAM_DESTINO));
  } catch {
    return null;
  }
}

/**
 * O CAMPO FOCADO TEM DE FICAR ACIMA DO TECLADO.
 *
 * No telemóvel o teclado tapa a metade de baixo do ecrã, e o cartão desta
 * página é alto: com a fotografia em faixa no topo, o campo da palavra-passe e
 * o botão «Entrar» caem por baixo dele. O browser leva o campo focado para a
 * vista, mas encosta-o à borda — o que deixa o botão de submeter escondido, e o
 * gesto seguinte é sempre esse.
 *
 * `block: "center"` põe o campo a meio do que sobra do ecrã, portanto o botão
 * logo abaixo fica à vista. Os 300 ms são o tempo da animação de abertura do
 * teclado no iOS: antes disso a área visível ainda é a antiga e a conta sai
 * errada. Só com o dedo — com rato não há teclado a tapar nada e mexer no
 * scroll seria movimento que ninguém pediu.
 *
 * No `onFocus` do `<form>` e não em cada campo: o evento borbulha, e assim um
 * campo acrescentado amanhã (o do 2FA, por exemplo) fica coberto sem ter de se
 * lembrar disto.
 */
function aoFocarCampo(e: React.FocusEvent<HTMLFormElement>) {
  const alvo = e.target as HTMLElement;
  if (!alvo?.matches?.("input, textarea, select")) return;
  if (typeof window === "undefined") return;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  window.setTimeout(() => {
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 300);
}

function OlhoAberto() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path
        d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function OlhoFechado() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path
        d="M4 5.5C6 8.4 8.8 10.2 12 10.2S18 8.4 20 5.5"
        strokeLinecap="round"
        transform="translate(0 6)"
      />
      <path d="m5 17 -1.4 2.2M12 18.2V21M19 17l1.4 2.2" strokeLinecap="round" />
    </svg>
  );
}
