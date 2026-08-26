"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Field } from "./ui";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { useToast } from "./Toast";
import { useAccaoDeGuardarTudo, useInscritos } from "./registo-de-gravacoes";
import { entrarComDispositivo, mensagemDeErro, suportaPasskeys } from "@/lib/passkeys-cliente";
import { limparMarcaDeSessao, marcarSessaoAberta } from "./entrada-destino";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SESSÃO CAIU A MEIO — E O QUE ESTAVA A SER ESCRITO NÃO SE PERDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É esta a ferida deste projecto: uma proposta perdida a meio. A gravação
 * automática já cobre a parte «o servidor recusou uma vez»; o que não estava
 * coberto era o servidor passar a recusar TUDO porque a sessão expirou — a
 * partir daí cada gravação falha, e o desfecho anterior era um redireccionamento
 * para o ecrã de entrada, que desmonta o back office inteiro e leva com ele o
 * parágrafo que estava a ser escrito.
 *
 * Aqui não se navega para lado nenhum. Põe-se um painel POR CIMA, autentica-se,
 * fecha-se, e o que estava escrito continua exactamente onde estava — porque
 * nunca chegou a desmontar. A seguir, se houver trabalho por gravar, ele é
 * gravado sem se pedir mais nada: quem acabou de reautenticar não devia ter de
 * se lembrar de carregar num botão para não perder o que já tinha escrito.
 *
 * ── COMO É QUE SE SABE QUE A SESSÃO CAIU ──────────────────────────────────
 * Pelo único sinal que existe: uma resposta 401/403 a um pedido nosso. Não há
 * evento de «o cookie expirou», e um relógio local a contar 30 dias mentia à
 * primeira vez que o `SESSION_VERSION` fosse rodado ou que alguém saísse noutro
 * separador.
 *
 * Para o ver, o `fetch` do browser é EMBRULHADO enquanto o back office está
 * montado. É uma coisa que se faz com os olhos abertos, e por isso:
 *
 *  · só se LÊ o `status` — o corpo nunca é tocado, portanto quem chamou recebe
 *    a resposta intacta (ler o corpo aqui consumia-o e partia tudo);
 *  · a resposta e os erros seguem tal e qual, sem nada apanhado pelo caminho;
 *  · desembrulha-se ao desmontar, e só se o embrulho ainda for o nosso (outro
 *    código pode ter embrulhado por cima; nesse caso deixa-se estar);
 *  · e as rotas de ENTRADA estão de fora: um 401 do `/api/admin/login` é uma
 *    palavra-passe errada, não uma sessão expirada — abrir aí este painel era
 *    responder a um erro de escrita com um aviso de catástrofe.
 *
 * A alternativa seria mudar as ~40 chamadas do back office para passarem por um
 * cliente comum. É a solução limpa, é meio dia de trabalho em ficheiros que
 * estão a ser mexidos por outra frente agora, e falha por omissão: a chamada que
 * alguém escrever amanhã com `fetch` directo fica de fora do aviso.
 */

/** Rotas onde um 401 significa «credenciais erradas», não «sessão expirada». */
const ENTRADAS = [
  "/api/admin/login",
  "/api/admin/recuperar",
  "/api/admin/passkeys/entrada",
  "/api/admin/logout",
];

/** O caminho de um pedido, quando ele é para nós. `null` para tudo o resto. */
export function caminhoDoPedido(entrada: unknown, origem: string): string | null {
  try {
    const bruto =
      typeof entrada === "string"
        ? entrada
        : entrada instanceof Request
          ? entrada.url
          : entrada instanceof URL
            ? entrada.href
            : typeof (entrada as { url?: unknown })?.url === "string"
              ? (entrada as { url: string }).url
              : null;
    if (bruto === null) return null;
    const url = new URL(bruto, origem);
    if (url.origin !== origem) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/**
 * Esta resposta quer dizer «a sessão acabou»?
 *
 * Fora daqui não há como distinguir uma coisa da outra, e é a distinção que
 * decide entre um painel a meio do ecrã e um silêncio.
 */
export function ehSessaoExpirada(caminho: string | null, status: number | undefined): boolean {
  if (caminho === null || typeof status !== "number") return false;
  if (status !== 401 && status !== 403) return false;
  if (!caminho.startsWith("/api/")) return false;
  return !ENTRADAS.some((e) => caminho === e || caminho.startsWith(`${e}/`));
}

export default function SessaoExpirada() {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  const [aEntrarComDispositivo, setAEntrarComDispositivo] = useState(false);
  /**
   * A MESMA ESCOLHA QUE A ENTRADA, E COM A MESMA OMISSÃO.
   *
   * Sem este campo, o corpo do `POST /api/admin/login` ia sem `manterSessao` —
   * e o servidor lê a ausência como `true`, por retrocompatibilidade com
   * separadores antigos. Resultado: quem tinha DELIBERADAMENTE recusado a
   * sessão longa (a omissão da entrada é recusar) saía desta reautenticação
   * com um cookie de 30 dias. E é aqui que isso mais custa: este painel
   * aparece a meio do trabalho, no portátil que anda para quintas e hotéis —
   * exactamente o aparelho que a omissão a `false` existe para cobrir.
   */
  const [manterSessao, setManterSessao] = useState(false);
  // Declarado ANTES da armadilha de foco de propósito: os efeitos correm por
  // ordem de declaração, portanto a página já está trancada quando o foco entra
  // na caixa. Não custa nada e tira uma ordem de que ninguém quer depender.
  useTrincoDeScroll(aberto);
  const dialogRef = useFocusTrap<HTMLDivElement>(aberto);
  const { toast } = useToast();
  const accao = useAccaoDeGuardarTudo();
  const inscritos = useInscritos();

  const temPasskeys = useSyncExternalStore(
    () => () => {},
    suportaPasskeys,
    () => false,
  );

  /** Quantos ecrãs têm trabalho que ainda não está no servidor. */
  const porGravar = inscritos.filter((i) => i.porGravar).length;

  // ── A marca de «esta aba esteve cá dentro» ───────────────────────────────
  // Serve o ecrã de entrada: sem ela, uma sessão que expire durante uma
  // navegação (um link seguido, um F5) leva a pessoa a um formulário de entrada
  // que não explica nada. Ver `entrada-destino.ts`.
  useEffect(() => {
    marcarSessaoAberta();
  }, []);

  /** Sempre fresco para o `concluir`, que corre fora do desenho. */
  const pendenteRef = useRef({ guardar: accao?.guardarTudo, quantos: porGravar });
  useEffect(() => {
    pendenteRef.current = { guardar: accao?.guardarTudo, quantos: porGravar };
  });

  // ── O vigia ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    const original = window.fetch;
    const origem = window.location.origin;

    /**
     * Um `Proxy` e não uma função nova.
     *
     * A diferença é que o `fetch` continua a SER o mesmo objecto para quem lhe
     * olhe para as propriedades: um `fetch` simulado num teste continua a ter o
     * `mockResolvedValue`, e qualquer coisa que o browser lhe tenha pendurado
     * continua lá. Com uma função nova por cima, o objecto original desaparecia
     * do sítio onde toda a gente o vai buscar — e isso não é um pormenor de
     * testes, é o embrulho a ser MENOS transparente do que diz ser.
     *
     * O `this` é reposto no `window`: o `fetch` nativo recusa ser chamado
     * solto em alguns browsers, e quem chama `fetch(...)` sem objecto chegava
     * aqui com `undefined`.
     */
    const embrulho = new Proxy(original, {
      apply(alvo, esteObjecto, args: Parameters<typeof window.fetch>) {
        return Promise.resolve(Reflect.apply(alvo, esteObjecto ?? window, args)).then(
          (resposta: Response) => {
            const caminho = caminhoDoPedido(args[0], origem);
            // Sair de propósito não é a sessão a expirar: tira-se a marca para
            // que o ecrã de entrada não diga a quem carregou em «Sair» que
            // alguma coisa correu mal.
            if (caminho === "/api/admin/logout") limparMarcaDeSessao();
            if (ehSessaoExpirada(caminho, resposta?.status)) setAberto(true);
            return resposta;
          },
        );
      },
    });

    window.fetch = embrulho;
    return () => {
      // Só se o embrulho ainda for o nosso: desfazer por cima do de outra
      // pessoa deixava a aplicação com um `fetch` que já não é o dela.
      if (window.fetch === embrulho) window.fetch = original;
    };
  }, []);

  const concluir = useCallback(() => {
    setAberto(false);
    setPassword("");
    setCode("");
    setNeeds2fa(false);
    setErro(null);
    marcarSessaoAberta();
    // A gravação do que ficou por gravar. Não é um extra: as gravações que
    // falharam enquanto a sessão estava morta ficaram marcadas como «não chegou
    // ao servidor» e ninguém as volta a tentar sozinho — o `useGravacaoAutomatica`
    // trata um 4xx como definitivo, e bem.
    //
    // Só quando há mesmo coisa por gravar: sem isso, o «Guardar tudo» responde
    // «não havia nada por gravar», que é uma resposta a uma pergunta que
    // ninguém fez e que ensina a ignorar aquele painel.
    const { guardar, quantos } = pendenteRef.current;
    if (guardar && quantos > 0) {
      void guardar();
    } else {
      toast("Sessão renovada. Podes continuar.", "success");
    }
  }, [toast]);

  async function entrarComSenha(e: React.FormEvent) {
    e.preventDefault();
    if (aEntrar) return;
    setAEntrar(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code, manterSessao }),
      });
      if (res.ok) {
        concluir();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.needs2fa) {
        setNeeds2fa(true);
        setErro(code ? "Código de verificação inválido." : "Introduz o código de verificação.");
      } else {
        // A mesma frase do servidor, tal e qual: aqui também não se pode dizer
        // mais do que ela diz sobre a existência da conta.
        setErro(data?.error ?? "Credenciais incorretas.");
      }
    } catch {
      setErro("Erro de ligação. Tenta novamente.");
    } finally {
      setAEntrar(false);
    }
  }

  async function entrarPorDispositivo() {
    if (aEntrarComDispositivo || aEntrar) return;
    setAEntrarComDispositivo(true);
    setErro(null);
    try {
      await entrarComDispositivo({ manterSessao });
      concluir();
    } catch (err) {
      const msg = mensagemDeErro(err);
      if (msg) setErro(msg);
    } finally {
      setAEntrarComDispositivo(false);
    }
  }

  /**
   * Sair de vez. Recarrega a página INTEIRA (`location.reload`) em vez de
   * navegar pelo router: o que se quer é o servidor a voltar a decidir quem
   * está autenticado e a desenhar o ecrã de entrada, sem restos do back office
   * antigo em memória. A marca de sessão fica, para o ecrã de entrada poder
   * dizer porque é que a pessoa foi ali parar.
   */
  function sairEVoltarAEntrada() {
    window.location.reload();
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      {/*
       * O fundo NÃO fecha o painel ao ser clicado, e não há botão de fechar.
       * É a única coisa nesta casa desenhada assim, e é de propósito: com a
       * sessão morta, tudo o que se fizer por trás falha em silêncio e dá a
       * impressão de estar a funcionar. Fechar isto sem reautenticar seria pôr
       * a pessoa a escrever para o vazio — que é exactamente o que aconteceu da
       * primeira vez.
       */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sessao-expirada-titulo"
        className="relative flex max-h-[88dvh] w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-2xl border border-foreground/10 bg-white p-6 shadow-2xl"
      >
        <p className="bo-eyebrow">Sessão</p>
        <h2
          id="sessao-expirada-titulo"
          className="font-display mt-1 text-xl leading-tight text-foreground/90"
        >
          A tua sessão expirou
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/60">
          {porGravar > 0
            ? "Nada se perdeu: o que estavas a escrever continua aqui, nesta página. Entra outra vez e é guardado logo a seguir."
            : "Nada se perdeu — esta página continua como estava. Entra outra vez para continuares."}
        </p>

        {temPasskeys && (
          <>
            <Button
              type="button"
              size="lg"
              fullWidth
              className="mt-5"
              loading={aEntrarComDispositivo}
              onClick={entrarPorDispositivo}
            >
              {aEntrarComDispositivo ? "A confirmar…" : "Entrar com este dispositivo"}
            </Button>
            <div className="my-4 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-foreground/10" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/35">ou</span>
              <span className="h-px flex-1 bg-foreground/10" />
            </div>
          </>
        )}

        <form
          onSubmit={entrarComSenha}
          className={`flex flex-col gap-3 ${temPasskeys ? "" : "mt-5"}`}
        >
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
            required
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
              required
              autoFocus
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em]"
            />
          )}
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
            </span>
          </label>
          {erro && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-sm leading-relaxed text-[#8a2a22]"
            >
              <span aria-hidden="true">⚠</span>
              <span>{erro}</span>
            </p>
          )}
          <Button
            type="submit"
            variant={temPasskeys ? "secondary" : "primary"}
            size="lg"
            fullWidth
            loading={aEntrar}
          >
            {aEntrar ? "A verificar…" : needs2fa ? "Verificar" : "Entrar com palavra-passe"}
          </Button>
        </form>

        {/* A saída, que tem de existir mesmo não sendo a que se quer.
            Um painel sem forma nenhuma de sair pelo teclado é uma armadilha
            (WCAG 2.1.2), e a alternativa honesta não é um «fechar» que deixava
            a pessoa a escrever para o vazio: é dizer-lhe que sair daqui é
            começar de novo, e quanto é que isso custa. */}
        <button
          type="button"
          onClick={sairEVoltarAEntrada}
          className="alvo-toque mt-4 w-full text-center text-xs text-foreground/45 underline underline-offset-4 hover:text-foreground/70"
        >
          {porGravar > 0
            ? "Prefiro sair e voltar à entrada (perde-se o que não foi guardado)"
            : "Prefiro sair e voltar à entrada"}
        </button>
      </div>
    </div>
  );
}
