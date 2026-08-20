"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import { contar, type TextosDaPagina } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MOOD BOARDS EM ECRÃ INTEIRO — A RAZÃO DE ESTA PÁGINA EXISTIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «46 fotos de mood board comprimidas em páginas A4 ficam
 * pequenas, quando o trabalho é visual e merece ecrã inteiro.»
 *
 * ── O QUE ISTO NÃO É: UMA FOLHA A4 ────────────────────────────────────────
 *
 * Já existe um desenho fiel de uma página de mood board — o `PreviaDaPagina`
 * do estúdio, que lê as caixas de `proposal-geometria` e as divide pela folha.
 * Não se reaproveita AQUI, e não é distração: a folha A4 é exactamente o
 * problema que esta página existe para resolver. Aqui não há caixas, não há
 * pontos de PDF, não há uma proporção de página a respeitar. Há uma coluna de
 * fotografias com a largura do ecrã.
 *
 * ── A GRELHA: COLUNAS QUE FLUEM, SEM RECORTAR ─────────────────────────────
 *
 * `columns` do CSS, e não uma grelha de células de proporção fixa. A razão é
 * dela e está escrita no `ProposalDoc.enquadramento`: uma foto ao alto metida
 * numa célula ao baixo perde 68% da área — «uma foto de um portão coberto de
 * flores chegava à proposta com dois terços do portão de fora». Aqui cada
 * fotografia tem a forma que tem, e o que se ajusta é a coluna.
 *
 * UMA coluna no telemóvel, de propósito. Duas dariam ~185 px de largura num
 * ecrã de 390 — que é, ao pixel, o tamanho a que as fotografias já saem na
 * folha A4. Voltar a esse tamanho num ecrã seria fazer o trabalho todo para
 * não resolver nada.
 *
 * MEDIDO no mesmo documento de 46 fotografias:
 *
 *      390 px   1 coluna    fotografia com 350 px de largura
 *      768 px   2 colunas
 *     1440 px   3 colunas   fotografia com 333 px (a principal, 1024)
 *
 * e nenhuma das duas larguras faz a página rolar na horizontal
 * (`scrollWidth === clientWidth` nas duas).
 *
 * ── PORQUE É QUE A CÉLULA NASCE COM ALTURA ────────────────────────────────
 *
 * Cada foto declara o seu `aspect-ratio` a partir da forma guardada
 * (`formasDeCaminhos`). Sem isso, 46 células nascem com altura zero e a página
 * salta por baixo do dedo de quem está a ler.
 *
 * MEDIDO num Chromium a 390×844, com um documento de três boards e 46
 * fotografias, comparando a página sem imagens carregadas com a página depois
 * de todas chegarem:
 *
 *     com a forma guardada    o «Orçamento» fica onde estava       0 px
 *     sem a forma guardada    o «Orçamento» desce            10 833 px
 *
 * Dez mil pixels é o documento inteiro a fugir por baixo de quem estava a ler
 * uma condição. Num ecrã de 1440 o desvio com a forma é o mesmo: zero.
 *
 * Quando a forma não se sabe — fotografias anteriores às colunas de dimensão —
 * a célula fica sem `aspect-ratio` nenhum e cresce com a imagem: um salto, e
 * não uma mentira sobre a forma da fotografia.
 *
 * ── OS BYTES ──────────────────────────────────────────────────────────────
 *
 * A grelha pede as MINIATURAS (~30–60 KB); o original (~2,6 MB) só entra
 * quando a lupa abre. Com 46 fotografias é a diferença entre ~2 MB e ~120 MB.
 * O `/_next/image` está desligado neste projecto, portanto não há
 * redimensionamento a pedido: ou se pede a derivada certa, ou se paga o
 * ficheiro inteiro. Ver o cabeçalho de `proposta-fotos.ts`.
 *
 * ── PORQUE É QUE ISTO NÃO REAPROVEITA O `PhotoLightbox` DO ESTÚDIO ────────
 *
 * Porque ele é do estúdio: as palavras estão em português à letra (esta página
 * é bilingue e segue a língua da PROPOSTA), traz o botão «Transferir» (a
 * biblioteca do estúdio é para escolher fotos; a proposta é para as ver) e
 * puxa as peças de interface do back office (`./ui`, `AvisoDeFalha`).
 * Importá-lo era pendurar o que o casal vê num ramo do back office.
 *
 * O que É partilhado é a parte que tem de ser a mesma: a cascata de uma
 * fotografia cujo URL assinado morreu (`useFotoComPlanoB`) e o contrato de
 * teclado — Escape fecha, setas andam, o foco fica preso enquanto está aberto.
 * Fica DITO que as mecânicas do diálogo estão escritas duas vezes: extrair um
 * `useLightbox` comum é o passo certo e mexe num ficheiro com testes seus, por
 * isso não se faz de passagem.
 */

/** Um board como o ecrã precisa dele: sem geometria, só o que se lê e vê. */
export interface BoardParaEcra {
  /** Identidade estável, para chaves de React. */
  chave: string;
  titulo: string;
  subtitulo?: string;
  nota?: string;
  /** Os ids das fotografias deste board, pela ordem dela. */
  fotos: string[];
  /**
   * A foto que manda na página — POSIÇÃO dentro de `fotos`.
   *
   * No papel, duas das cinco disposições dão-lhe muito mais área
   * (`proposal-moodboard.ts`). Aqui não há disposições: dá-se-lhe a largura
   * toda, sozinha em cima, e o resto flui por baixo. É a mesma intenção dela
   * traduzida para um ecrã — e não a geometria do PDF, que não se partilha.
   */
  principal?: number;
}

/** Quantas fotos entram antes de o navegador deixar de carregar à frente. */
const FOTOS_ANSIOSAS = 4;

/**
 * A posição da foto marcada como principal, ou `null` quando não há marca.
 *
 * `null` e não «a primeira»: no papel, ausente quer dizer «a primeira», porque
 * ALGUMA foto tem sempre de calhar à caixa grande. Aqui não há caixa grande a
 * preencher — sem marca dela, a grelha trata as fotografias todas por igual, e
 * não se inventa um destaque que ela não pediu.
 */
function destacada(board: BoardParaEcra): number | null {
  const p = board.principal;
  if (typeof p !== "number" || !Number.isInteger(p)) return null;
  if (p < 0 || p >= board.fotos.length) return null;
  return p;
}

export default function Inspiracao({
  boards,
  fotosIniciais,
  token,
  textos,
}: {
  boards: BoardParaEcra[];
  /** O mapa `id → fotografia`, já assinado no servidor. Sem cascata na 1.ª pintura. */
  fotosIniciais: Record<string, FotoDaProposta>;
  /** Para voltar a pedir assinaturas quando as de agora morrerem. */
  token: string;
  textos: TextosDaPagina;
}) {
  const [fotos, setFotos] = useState(fotosIniciais);
  /**
   * A LUPA. Guarda-se o board e a posição, e não a fotografia: as setas andam
   * DENTRO do board, que é como o documento está organizado — saltar de
   * «Decoração Cerimónia» para «Copo de água» a meio de uma seta seria uma
   * viagem que ninguém pediu.
   */
  const [aberta, setAberta] = useState<{ board: number; i: number } | null>(null);
  const [arecarregar, setARecarregar] = useState(false);
  /** Quem abriu a lupa, para o foco voltar exactamente ao sítio de onde saiu. */
  const origemDoFoco = useRef<HTMLElement | null>(null);

  /**
   * ── VOLTAR A PEDIR AS ASSINATURAS ────────────────────────────────────────
   *
   * Os URLs da Biblioteca de Temas valem 6 horas. Um separador deixado aberto
   * durante uma tarde fica com fotografias mortas, e sem isto a única saída era
   * recarregar a página inteira e voltar a pagar tudo. Pede-se a rota, que
   * reassina o que está NAQUELE documento — nunca se lhe manda um caminho.
   */
  const recarregar = useCallback(async () => {
    setARecarregar(true);
    try {
      const r = await fetch(`/api/proposta/${encodeURIComponent(token)}/fotos`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const corpo = (await r.json()) as { fotos?: FotoDaProposta[] };
      if (!corpo.fotos) return;
      setFotos(Object.fromEntries(corpo.fotos.map((f) => [f.id, f])));
    } catch {
      /* sem rede — fica o que está, e o botão continua lá */
    } finally {
      setARecarregar(false);
    }
  }, [token]);

  const abrir = useCallback((board: number, i: number, alvo: HTMLElement | null) => {
    origemDoFoco.current = alvo;
    setAberta({ board, i });
  }, []);

  const fechar = useCallback(() => {
    setAberta(null);
    // O foco volta ao botão que abriu — sem isto, quem navega por teclado sai
    // do diálogo e reaparece no topo da página, dez mil pixels acima.
    origemDoFoco.current?.focus();
  }, []);

  const andar = useCallback(
    (delta: number) => {
      setAberta((a) => {
        if (!a) return a;
        const n = boards[a.board]?.fotos.length ?? 0;
        const i = a.i + delta;
        if (i < 0 || i >= n) return a;
        return { ...a, i };
      });
    },
    [boards],
  );

  const boardAberto = aberta ? boards[aberta.board] : null;
  const fotoAberta = boardAberto ? fotos[boardAberto.fotos[aberta!.i]] : undefined;

  return (
    <>
      {boards.map((board, b) => (
        <section key={board.chave} className="mt-14 first:mt-0">
          <h3
            className="text-foreground/90 text-balance"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 3.4vw, 34px)" }}
          >
            {board.titulo}
          </h3>
          {board.subtitulo && (
            <p className="text-foreground/72 mt-1.5 text-sm leading-relaxed">{board.subtitulo}</p>
          )}

          {/* ── A FOTO QUE MANDA ─────────────────────────────────────────────
              Sozinha em cima, com a largura toda. No papel são o «destaque» e
              o «mosaico» que lhe dão a caixa maior; aqui não há caixas, há
              largura — a mesma intenção dela, sem uma linha da geometria do
              PDF. Quando não está marcada, não há destaque nenhum e as fotos
              entram todas na grelha, como sempre. */}
          {destacada(board) !== null && (
            <div className="mt-5">
              <Celula
                foto={fotos[board.fotos[destacada(board)!]]}
                ansiosa
                rotulo={contar(textos.contagem, destacada(board)! + 1, board.fotos.length)}
                textos={textos}
                aoAmpliar={(alvo) => abrir(b, destacada(board)!, alvo)}
              />
            </div>
          )}

          {/* ── A GRELHA ─────────────────────────────────────────────────────
              `columns` e não `grid`: a fotografia entra com a forma que tem.
              O `break-inside: avoid` (a classe `.foto-inteira`, em globals.css)
              é o que impede uma foto de ser partida ao meio entre colunas. */}
          <div className="mt-3 columns-1 gap-3 sm:columns-2 lg:columns-3 [&>*]:mb-3">
            {board.fotos.map((id, i) =>
              i === destacada(board) ? null : (
                <Celula
                  key={id}
                  foto={fotos[id]}
                  ansiosa={i < FOTOS_ANSIOSAS}
                  rotulo={contar(textos.contagem, i + 1, board.fotos.length)}
                  textos={textos}
                  aoAmpliar={(alvo) => abrir(b, i, alvo)}
                />
              ),
            )}
          </div>

          {board.nota && (
            <p className="text-foreground/72 border-moss/40 mt-5 border-l-2 pl-5 text-sm leading-relaxed">
              {board.nota}
            </p>
          )}
        </section>
      ))}

      {/* O botão de reassinar vive no fim da secção, discreto: só faz falta
          quando alguma coisa correu mal, e não é para ser lido quando não faz. */}
      <p className="mt-10 text-center">
        <button
          type="button"
          onClick={recarregar}
          disabled={arecarregar}
          className="alvo-toque text-foreground/60 hover:text-moss inline-flex items-center justify-center text-[11px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50"
        >
          {textos.recarregarFotos}
        </button>
      </p>

      {boardAberto && aberta && (
        <Lupa
          foto={fotoAberta}
          rotulo={contar(textos.contagem, aberta.i + 1, boardAberto.fotos.length)}
          temAnterior={aberta.i > 0}
          temSeguinte={aberta.i < boardAberto.fotos.length - 1}
          textos={textos}
          aoFechar={fechar}
          aoAndar={andar}
        />
      )}
    </>
  );
}

/**
 * Uma célula da grelha.
 *
 * É um `<button>` e não uma `<div>` com `onClick`: quem navega por teclado tem
 * de lá chegar com Tab e abrir com Enter, e um `role="button"` inventado à mão
 * não traz nada disso de borla.
 */
function Celula({
  foto,
  ansiosa,
  rotulo,
  textos,
  aoAmpliar,
}: {
  foto?: FotoDaProposta;
  ansiosa: boolean;
  rotulo: string;
  textos: TextosDaPagina;
  aoAmpliar: (alvo: HTMLElement | null) => void;
}) {
  // A grelha pede a MINIATURA. O original é o plano B — e é plano B, não
  // primeira escolha: as fotografias anteriores ao bucket das miniaturas não
  // têm nenhuma, e essas pagam o ficheiro inteiro porque não há alternativa.
  const { alvo, desistiu, aoFalhar, tentarDeNovo } = useFotoComPlanoB(
    foto?.miniatura ?? foto?.original,
    foto?.original,
  );
  const proporcao = foto?.largura && foto?.altura ? `${foto.largura} / ${foto.altura}` : undefined;

  return (
    <figure className="foto-inteira m-0">
      <button
        type="button"
        onClick={(e) => aoAmpliar(e.currentTarget)}
        disabled={!alvo || desistiu}
        aria-label={`${textos.ampliar}: ${rotulo}`}
        className="group focus-visible:outline-moss relative block w-full cursor-zoom-in overflow-hidden rounded-sm bg-[color-mix(in_srgb,var(--color-moss)_12%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
        style={proporcao ? { aspectRatio: proporcao } : undefined}
      >
        {/* O `lqip` é um `data:` de poucos bytes que já vem no HTML: a célula
            nunca é um rectângulo vazio, nem sequer no primeiro fotograma. */}
        {foto?.lqip && !desistiu && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.lqip}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-105 object-cover blur-md"
          />
        )}
        {desistiu || !alvo ? (
          <span className="text-foreground/60 block px-4 py-8 text-center text-xs leading-relaxed">
            {textos.fotoFalhou}
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={alvo}
            src={alvo}
            alt=""
            /* `loading="lazy"` em tudo menos nas primeiras: com 46 fotografias,
               carregá-las todas de uma vez é a conta que esta página existe
               para não fazer. As primeiras entram ansiosas porque estão à
               vista antes de qualquer rolar. */
            loading={ansiosa ? "eager" : "lazy"}
            decoding="async"
            onError={aoFalhar}
            className="relative block h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.02]"
          />
        )}
      </button>
      {desistiu && (
        <button
          type="button"
          onClick={tentarDeNovo}
          className="alvo-toque text-moss mt-1 inline-flex w-full items-center justify-center text-[11px] hover:underline"
        >
          {textos.recarregarFotos}
        </button>
      )}
    </figure>
  );
}

/**
 * A LUPA — uma fotografia a ocupar o ecrã.
 *
 * Teclado: Escape fecha, ← e → andam, e o Tab não sai daqui enquanto isto está
 * aberto (senão o cursor desaparecia para uma página que está tapada).
 * Gesto: arrastar para o lado anda; a distância mínima existe para um toque
 * trémulo não passar de fotografia sem querer.
 */
const DISTANCIA_DO_GESTO = 48;

function Lupa({
  foto,
  rotulo,
  temAnterior,
  temSeguinte,
  textos,
  aoFechar,
  aoAndar,
}: {
  foto?: FotoDaProposta;
  rotulo: string;
  temAnterior: boolean;
  temSeguinte: boolean;
  textos: TextosDaPagina;
  aoFechar: () => void;
  aoAndar: (delta: number) => void;
}) {
  const dialogo = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [carregou, setCarregou] = useState(false);

  // AQUI o original é a primeira escolha e a miniatura é o plano B: é o único
  // sítio da página em que os pixéis todos valem os bytes.
  const { alvo, desistiu, aoFalhar, tentarDeNovo } = useFotoComPlanoB(
    foto?.original ?? foto?.miniatura,
    foto?.miniatura,
  );

  // Recomeçar a cada alvo novo, DURANTE o desenho — o padrão da casa (ver
  // `PhotoLightbox`): assim não há um fotograma com a opacidade da fotografia
  // anterior por cima de uma imagem que ainda não pediu nada.
  const [alvoVisto, setAlvoVisto] = useState(alvo);
  if (alvoVisto !== alvo) {
    setAlvoVisto(alvo);
    setCarregou(false);
  }

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        aoAndar(1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        aoAndar(-1);
        return;
      }
      if (e.key !== "Tab") return;
      const focaveis = dialogo.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, aoAndar]);

  useEffect(() => {
    botaoFechar.current?.focus();
  }, []);

  // Enquanto a lupa está aberta, a página por baixo não rola.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  return (
    <div
      ref={dialogo}
      role="dialog"
      aria-modal="true"
      aria-label={rotulo}
      className="fixed inset-0 z-50 flex flex-col bg-black/94"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        toque.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const inicio = toque.current;
        toque.current = null;
        const t = e.changedTouches[0];
        if (!inicio || !t) return;
        const dx = t.clientX - inicio.x;
        const dy = t.clientY - inicio.y;
        // Horizontal a sério: um dedo a rolar a página não pode mudar de foto.
        if (Math.abs(dx) < DISTANCIA_DO_GESTO || Math.abs(dx) <= Math.abs(dy)) return;
        aoAndar(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs tabular-nums text-white/70">{rotulo}</span>
        <button
          ref={botaoFechar}
          type="button"
          onClick={aoFechar}
          aria-label={textos.fechar}
          className="alvo-toque ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          ×
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) aoFechar();
        }}
      >
        {temAnterior && (
          <button
            type="button"
            onClick={() => aoAndar(-1)}
            aria-label={textos.anterior}
            className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ‹
          </button>
        )}

        {/* A miniatura por baixo enquanto o original não chega — há sempre
            fotografia no ecrã, em vez de um rectângulo preto. */}
        {!carregou && !desistiu && foto?.miniatura && alvo !== foto.miniatura && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.miniatura}
            alt=""
            aria-hidden
            className="absolute max-h-full max-w-full object-contain blur-sm"
          />
        )}

        {desistiu || !alvo ? (
          <div className="max-w-xs text-center">
            <p className="text-sm leading-relaxed text-white/80">{textos.fotoFalhou}</p>
            <button
              type="button"
              onClick={tentarDeNovo}
              className="alvo-toque mt-4 inline-flex items-center justify-center rounded-md border border-white/30 px-5 py-2.5 text-xs tracking-[0.16em] text-white uppercase hover:bg-white/10"
            >
              {textos.recarregarFotos}
            </button>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={alvo}
            src={alvo}
            alt=""
            onLoad={() => setCarregou(true)}
            onError={aoFalhar}
            className={`max-h-full max-w-full object-contain motion-safe:transition-opacity ${
              carregou ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {temSeguinte && (
          <button
            type="button"
            onClick={() => aoAndar(1)}
            aria-label={textos.seguinte}
            className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
