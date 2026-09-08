"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";
import { SAIDA, useSaidaDeUmSo } from "./saida";

/**
 * AS ACÇÕES DE UM ITEM — reveladas ao passar o rato no computador, sempre
 * visíveis onde não há rato.
 *
 * ── A regra, numa frase ─────────────────────────────────────────────────────
 * **Num ecrã táctil, "aparece no hover" quer dizer "não existe".** Não é um
 * inconveniente: a função fica invisível e ninguém a descobre. Este componente
 * é o sítio onde essa regra passa a ser aplicada uma vez, em vez de ser
 * relembrada em cada ecrã — e esquecida num.
 *
 * A decisão usa o PONTEIRO, não a largura (ver `adaptativo.ts`): um portátil
 * com ecrã táctil é largo e tem dedo, e um monitor grande ligado a um telemóvel
 * é estreito e tem rato. Esconder por largura acertava nos dois casos comuns e
 * falhava nos dois interessantes.
 *
 * ── E A DECISÃO É EM CSS, NÃO EM JAVASCRIPT ─────────────────────────────────
 * Isto lia `usePodeEsconderNoHover()`, que responde à mesma pergunta — e que
 * continua a ser a ferramenta certa para diferenças ESTRUTURAIS. Aqui era a
 * errada: o hook devolve `false` no servidor (tem de devolver, senão há
 * desencontro de hidratação), portanto o primeiro desenho no computador
 * mostrava as acções todas e o segundo escondia-as. MEDIDO: um piscar em cada
 * linha, em cada carregamento — numa tabela de trinta linhas, trinta.
 *
 * As variantes `com-rato:` / `sem-rato:` (globals.css) fazem o mesmo teste,
 * mas a media query já é verdadeira quando o primeiro píxel é pintado. Zero
 * JavaScript, zero piscar, e o mesmo desenho do lado do servidor.
 */

export interface AccaoDeItem {
  id: string;
  rotulo: string;
  onAccao: () => void;
  icone?: ReactNode;
  /** Acções que apagam ou são irreversíveis. Ficam a vermelho e SEPARADAS das
   *  outras — no telemóvel, "apagar" ao lado de "duplicar" é um engano à
   *  espera de acontecer. */
  destrutiva?: boolean;
  desativada?: boolean;
}

export interface MenuDeAccoesProps {
  accoes: readonly AccaoDeItem[];
  /** O que este menu governa, para o rótulo acessível ("Acções de Terracotta").
   *  Sem isto, dez menus na mesma página chamam-se todos "Acções". */
  sobre: string;
  /** Quantas acções aparecem soltas (em vez de dentro do menu) quando há
   *  espaço. As restantes ficam no "…". */
  soltasNoEcraGrande?: number;
  className?: string;
}

/**
 * ── E O MENU TAMBÉM SAI ─────────────────────────────────────────────────────
 *
 * O menu entrava com a `.bo-entrada` e fechava A SECO: o `{aberto && …}`
 * passava a falso e o painel desaparecia entre dois fotogramas. Meio gesto —
 * e é a metade que se vê mais vezes, porque um menu abre-se uma vez e fecha-se
 * sempre (Escape, clique fora, escolher uma acção: três saídas, todas seco).
 *
 * A palavra já existia (`.bo-saida`, 200 ms, `--ease-in`, quatro píxeis — a
 * distância de um item de menu) e o gancho que segura o nó montado durante os
 * 200 ms também. Aqui só se liga uma à outra, pelo atalho de quem tem UM nó só
 * (`useSaidaDeUmSo`, em `ui/saida.ts` — o contrato está escrito lá).
 */
export function MenuDeAccoes({
  accoes,
  sobre,
  soltasNoEcraGrande = 0,
  className,
}: MenuDeAccoesProps) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const abridorRef = useRef<HTMLButtonElement>(null);

  // Reabrir a meio da saída traz o menu de volta: o `aberto` é que manda, e
  // não a marca — a regra vem de dentro do gancho.
  const aSairAgora = useSaidaDeUmSo(aberto);

  /**
   * ── O FOCO VOLTA A QUEM ABRIU ─────────────────────────────────────────────
   *
   * As duas saídas do menu apagam o elemento que tem o foco: o item escolhido
   * desaparece com o menu, e o Escape fecha-o por baixo dos pés. Sem devolver
   * o foco ele cai no `<body>` — e o Tab seguinte recomeça no princípio da
   * página. Numa tabela de trinta linhas isso é voltar a percorrê-las todas
   * para chegar à linha onde se estava.
   *
   * O clique FORA não conta: aí o foco vai para onde se carregou, que é
   * exactamente onde a pessoa quis ir.
   */
  const fecharEDevolverFoco = () => {
    setAberto(false);
    abridorRef.current?.focus();
  };

  // Fechar ao clicar fora e ao Escape. `pointerdown` e não `click`: com `click`
  // o menu fechava só depois de a acção de baixo já ter disparado.
  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: PointerEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        abridorRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", foraDaqui);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  /* ── A COLUNA SÓ EXISTE SE HOUVER ÍCONES ─────────────────────────────────
     A fila alinhada é o que impede um menu misto de ficar com os rótulos em
     duas colunas. Num menu em que NENHUMA acção tem ícone ela não alinha nada:
     é uma goteira de 26 px à esquerda de tudo. Por isso pergunta-se ao menu, e
     não ao item. */
  const temIcones = accoes.some((a) => a.icone);

  const soltas = accoes.slice(0, soltasNoEcraGrande);
  const noMenu = accoes.slice(soltas.length);

  return (
    <div ref={caixaRef} className={cn("relative flex items-center gap-1", className)}>
      {soltas.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={a.desativada}
          onClick={a.onAccao}
          aria-label={a.rotulo}
          title={a.rotulo}
          className={cn(
            // O `transition-opacity` que aqui estava não tinha `motion-safe:`.
            // O `ESTADO` traz a opacidade na lista, portanto o esconder-no-rato
            // continua a esbater-se — agora nos 120 ms da escala.
            `alvo-toque flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-30 ${ESTADO} ${PRESSAO}`,
            a.destrutiva
              ? "text-[#8a3d2f] active:bg-[#8a3d2f]/[0.12]"
              : "text-[var(--bo-text-muted)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)]",
            // O coração deste componente: só se esconde onde há mesmo rato.
            "opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100",
          )}
        >
          {a.icone ?? a.rotulo.slice(0, 1)}
        </button>
      ))}

      {noMenu.length > 0 && (
        <>
          <button
            ref={abridorRef}
            type="button"
            aria-label={`Acções de ${sobre}`}
            aria-haspopup="menu"
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
            className={cn(
              `alvo-toque flex h-11 w-11 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)] ${ESTADO} ${PRESSAO}`,
              // Aberto fica sempre visível: escondê-lo por baixo do seu próprio
              // menu deixava o menu a flutuar sem nada que o segurasse.
              aberto
                ? "opacity-100"
                : "opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100",
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>

          {(aberto || aSairAgora) && (
            <div
              /* A SAIR, ISTO JÁ NÃO É UM MENU. O nó fica montado 200 ms para
                 ter o que animar, mas para quem ouve o ecrã e para quem anda de
                 Tab a escolha acabou no instante do gesto: sem `role`, sem
                 nome, e fora do fio do teclado. O `pointer-events` vem dentro
                 da própria `.bo-saida` (ver `globals.css`), no MESMO commit —
                 nunca num `setTimeout`, que é a janela que ele existe para
                 fechar. */
              role={aSairAgora ? undefined : "menu"}
              aria-label={aSairAgora ? undefined : `Acções de ${sobre}`}
              aria-hidden={aSairAgora || undefined}
              inert={aSairAgora}
              className={cn(
                "absolute right-0 top-full z-30 mt-1 min-w-48 overflow-hidden",
                /* ── O MATERIAL ─────────────────────────────────────────────
                   Era `rounded-xl border … bg-[var(--bo-surface)] py-1`. O
                   `rounded-xl` media 8 px (o bloco dos raios do `globals.css`
                   colapsa a escala do Tailwind para o conteúdo), e o `py-1`
                   dava folga em cima e em baixo mas nenhuma aos lados — que é
                   a razão de o realce de uma linha só poder ser uma faixa.
                   A `.bo-material` traz o raio de 12 px, o fio e a superfície
                   translúcida; o desfoque vem à parte, para se poder baixar
                   num sítio só. */
                "bo-material bo-material-desfoque p-[var(--bo-material-folga)]",
                "shadow-[var(--bo-sombra-suspensa)]",
                aSairAgora ? SAIDA : "bo-entrada",
              )}
            >
              {noMenu.map((a, i) => {
                // Uma linha a separar antes da primeira destrutiva: é o que
                // impede o toque distraído em "Eliminar" quando se queria
                // "Duplicar", que fica logo por cima.
                const primeiraDestrutiva =
                  a.destrutiva && !noMenu.slice(0, i).some((x) => x.destrutiva);
                return (
                  <Fragment key={a.id}>
                    {/* ── O FILETE SAIU DE DENTRO DO ITEM ───────────────────
                        Era um `border-t` na própria linha destrutiva. Com o
                        realce a passar a pastilha isso deixa de funcionar: o
                        filete ficava a fazer parte da caixa que se pinta de
                        vermelho ao passar o rato, e desaparecia debaixo dela.
                        Passa a ser um elemento seu, entre as duas linhas, com
                        a folga da pastilha — para as três fronteiras verticais
                        (moldura, filete, pastilha) lerem como uma coluna só. */}
                    {primeiraDestrutiva && i > 0 && (
                      <div
                        aria-hidden="true"
                        className="mx-2.5 my-1 border-t border-[var(--bo-hairline)]"
                      />
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={a.desativada}
                      onClick={() => {
                        // Devolver o foco ANTES da acção: se ela abrir um
                        // diálogo, é este botão que a armadilha de foco memoriza
                        // para devolver no fim (ver `useFocusTrap`).
                        fecharEDevolverFoco();
                        a.onAccao();
                      }}
                      className={cn(
                        `alvo-toque flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left text-sm disabled:opacity-30 ${ESTADO} ${PRESSAO}`,
                        "rounded-[var(--bo-material-raio-pastilha)]",
                        /* ── A LINHA SOB O RATO É UMA PASTILHA CHEIA ────────
                           Era uma lavagem de 6% de preto (e de 7% de vermelho).
                           Sobre um material translúcido, seis por cento não
                           chega a ser um estado: lê-se como sujidade do fundo.

                           Preenchimento e texto invertido, que é o gesto das
                           capturas. Medido: branco sobre `--bo-accent` dá
                           6,55:1 e branco sobre o vermelho da casa 7,53:1 — as
                           duas passam AA com folga.

                           O `active:` repete a pastilha de propósito: o `hover:`
                           do Tailwind vive dentro de `@media (hover: hover)` e
                           no dedo não existe. Sem esta segunda metade, tocar
                           num item do telemóvel não pintava nada e só ficava o
                           afundar. */
                        a.destrutiva
                          ? "text-[#8a3d2f] hover:bg-[#8a3d2f] hover:text-white active:bg-[#8a3d2f] active:text-white"
                          : "text-[var(--bo-tinta-72)] hover:bg-[var(--bo-accent)] hover:text-white active:bg-[var(--bo-accent)] active:text-white",
                      )}
                    >
                      {/* A COLUNA DOS ÍCONES, COM LARGURA MESMO QUANDO ESTÁ
                          VAZIA. Sem ela, um menu com três acções com ícone e
                          duas sem ficava com os rótulos em duas colunas — que
                          é o que se vê na captura e que aqui não acontecia por
                          acaso, mas por não haver coluna nenhuma. */}
                      {temIcones && (
                        <span
                          aria-hidden="true"
                          className="flex w-[var(--bo-material-coluna)] shrink-0 items-center justify-center"
                        >
                          {a.icone}
                        </span>
                      )}
                      {a.rotulo}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
