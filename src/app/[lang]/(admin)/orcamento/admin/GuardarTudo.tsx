"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  enumerarNomes,
  frasesDaResposta,
  useAccaoDeGuardarTudo,
  useInscritos,
} from "./registo-de-gravacoes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO QUE GRAVA TUDO — E QUE DIZ, ITEM A ITEM, O QUE ACONTECEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que o botão guardar seja incrível e guarde tudo aquilo que foi feito
 * no back office.» Ela perdeu uma proposta esta semana; o que pediu não foi
 * mais um botão por ecrã, foi a certeza de que nada fica para trás quando ela
 * fecha o portátil e vai para o carro.
 *
 * Este botão **não guarda nada por si**: manda gravar quem sabe (ver
 * `registo-de-gravacoes`). Fazer aqui uma segunda gravação seria pôr dois
 * mecanismos a escrever a mesma coisa — e é assim que se volta a ter um deles a
 * dizer «guardado» sem saber o que o outro fez.
 *
 * ── O QUE ELE DIZ ANTES DE SE CARREGAR NELE ───────────────────────────────
 *
 * É metade do valor, e a metade que se esquece: um botão que só fala depois do
 * clique obriga a carregar nele para saber se era preciso. Este diz o número —
 * «Guardar tudo (2)» — e, sem pendências, diz «Tudo guardado» e fica quieto: um
 * estado calmo, não um alarme. O `title` nomeia quem está por gravar, para a
 * pergunta «o quê?» ter resposta sem clique nenhum.
 *
 * ── E DEPOIS DO CLIQUE: SEM ARREDONDAR PARA MELHOR ────────────────────────
 *
 * A resposta é item a item. Se falhar um de cinco, a resposta é «Faltou guardar
 * 1 de 5» com o nome de quem faltou — nunca «guardado» com um aviso pequeno ao
 * lado, que é a mesma mentira com outra tipografia. E o que correu mal FICA no
 * ecrã até ela o dispensar; só o que correu bem se apaga sozinho, porque uma
 * boa notícia que se lê uma vez já cumpriu o que tinha a fazer.
 */

/** Quanto tempo fica a boa notícia no ecrã. O suficiente para se ler a
 *  confirmação, curto que chegue para não virar mobília. */
const DESAPARECE_APOS_MS = 6000;

export default function BotaoGuardarTudo() {
  const inscritos = useInscritos();
  const accao = useAccaoDeGuardarTudo();

  const pendentes = useMemo(() => inscritos.filter((i) => i.porGravar), [inscritos]);
  const nomes = useMemo(() => pendentes.map((i) => i.nome), [pendentes]);

  const resposta = accao?.resposta ?? null;
  const frases = useMemo(() => (resposta ? frasesDaResposta(resposta) : null), [resposta]);

  /**
   * A boa notícia apaga-se sozinha; a má fica.
   *
   * O `quando` da resposta é a dependência (e não a resposta inteira) para que
   * duas gravações seguidas com o mesmo desfecho reiniciem mesmo o relógio.
   */
  const dispensar = useRef(accao?.dispensarResposta);
  useEffect(() => {
    dispensar.current = accao?.dispensarResposta;
  });
  useEffect(() => {
    if (!frases?.tudoBem || !resposta) return;
    const t = setTimeout(() => dispensar.current?.(), DESAPARECE_APOS_MS);
    return () => clearTimeout(t);
  }, [frases?.tudoBem, resposta]);

  // Sem registo o botão não pode falar por ninguém — e um botão que não sabe de
  // ninguém dizendo «tudo guardado» seria a mentira por omissão que este
  // trabalho existe para acabar.
  if (!accao) return null;

  const quantos = pendentes.length;
  const rotulo = quantos > 0 ? `Guardar tudo (${quantos})` : "Tudo guardado";
  const titulo =
    quantos > 0
      ? `Guardar já: ${enumerarNomes(nomes)} (⌘S)`
      : "Não há nada por gravar nos ecrãs abertos (⌘S)";

  return (
    // `pointer-coarse:static` — e é isto que arruma o painel lá em baixo.
    //
    // MEDIDO a 375 px: o painel de resposta media 343 px de largura e nascia
    // em `x = -92`. Noventa e dois píxeis fora do ecrã, pela ESQUERDA, com o
    // `body { overflow-x: clip }` a cortá-los — «Faltou guardar 1 de 1»
    // começava fora da página. A causa é esta caixa: `relative` e do tamanho
    // do botão, com o painel `absolute right-0` colado à direita DELE. Só que
    // este botão não é o último da fila (a lupa e o «Novo pedido» vêm a
    // seguir), portanto a sua direita fica a 124 px da margem do ecrã — e um
    // painel de 343 px pendurado aí só tem para onde ir para fora.
    //
    // Tirando-lhe o `position` no telemóvel, o painel passa a resolver contra
    // o antepassado posicionado seguinte, que é o `<header>` (é `sticky`, logo
    // é bloco de contenção). Ganha-se as duas coisas de uma vez e sem número
    // mágico nenhum: `right-4` passa a ser a margem do ECRÃ, e o
    // `top-[calc(100%+8px)]` passa a contar 100% da altura do CABEÇALHO — ou
    // seja, oito píxeis abaixo dele, seja qual for a altura que ele tenha
    // (encolhe ao descer, de 65 para 57 px).
    //
    // No computador fica tudo como estava: aí o painel é um balão do botão.
    <div className="relative pointer-coarse:static">
      <button
        type="button"
        onClick={() => void accao.guardarTudo()}
        aria-busy={accao.aGravar || undefined}
        // O nome anunciado é a frase inteira, esteja ou não escrita no ecrã: no
        // telemóvel o rótulo encolhe para o número (o cabeçalho tem 375 px e o
        // título da vista vive ali ao lado), e quem ouve o ecrã não pode ficar
        // com «botão, 2».
        aria-label={rotulo}
        title={titulo}
        className={
          quantos > 0
            ? "alvo-toque flex items-center gap-2 rounded-lg bg-[#4d6350] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#415440] pointer-coarse:min-h-11"
            : "alvo-toque flex items-center gap-2 rounded-lg border border-[var(--bo-hairline)] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-[var(--bo-text-faint)] transition-colors hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text-muted)] pointer-coarse:min-h-11"
        }
      >
        {accao.aGravar ? (
          <svg
            className="motion-safe:animate-spin shrink-0"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : quantos > 0 ? (
          // Um disquete não: o gesto é «pôr a salvo», e a seta para baixo dentro
          // de uma bandeja é o que a maior parte dos programas usa hoje.
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {/* No computador a frase inteira; no telemóvel só o número, que é a
            parte que muda e a que ela procura. Sem pendências não fica número
            nenhum: o visto sozinho é o estado calmo. */}
        <span className="hidden sm:inline">{rotulo}</span>
        {quantos > 0 && <span className="sm:hidden tabular-nums">{quantos}</span>}
      </button>

      {frases && (
        <div
          // Uma gravação que não chegou ao servidor tem de ser ANUNCIADA, não
          // descoberta: quem usa leitor de ecrã ficaria com o mesmo silêncio de
          // sempre, que é o problema de origem.
          role={frases.tudoBem ? "status" : "alert"}
          aria-live={frases.tudoBem ? "polite" : "assertive"}
          className="absolute right-0 pointer-coarse:right-4 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--bo-hairline)] bg-white p-3 text-left shadow-[var(--bo-sombra-suspensa)]"
        >
          <div className="flex items-start gap-2">
            <p
              className={
                frases.tudoBem
                  ? "flex-1 text-[12px] font-semibold text-foreground/80"
                  : "flex-1 text-[12px] font-semibold text-[#a03123]"
              }
            >
              {frases.titulo}
            </p>
            {/* 32×32 px, medido — e é o ÚNICO alvo deste painel. A boa
                notícia apaga-se sozinha ao fim de seis segundos; a má FICA (é
                a regra desta caixa, e está certa). Logo, este × é a única
                forma de tirar do ecrã o aviso de que uma gravação não chegou
                ao servidor, e tinha três quartos da largura mínima.
                `alvo-toque` dá-lhe 44×44; o × desenhado não muda de tamanho. */}
            <button
              type="button"
              onClick={accao.dispensarResposta}
              aria-label="Fechar"
              className="alvo-toque -mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/35 hover:bg-foreground/[0.06] hover:text-foreground/70"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {frases.linhas.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {frases.linhas.map((l) => (
                <li
                  key={l.nome}
                  className={
                    l.mau
                      ? "text-[11px] leading-snug text-[#a03123]"
                      : "text-[11px] leading-snug text-foreground/55"
                  }
                >
                  <span aria-hidden>{l.mau ? "⚠ " : "✓ "}</span>
                  <span className="font-medium">{l.nome}</span> — {l.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
