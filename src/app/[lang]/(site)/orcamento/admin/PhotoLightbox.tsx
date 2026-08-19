"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeImage } from "@/lib/theme-types";
import { Button } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { useFotoComPlanoB } from "./useFotoComPlanoB";

/**
 * VER UMA FOTO EM GRANDE, dentro da biblioteca de temas.
 *
 * A grelha mostra miniaturas de 400 px porque é o que faz uma página de 60
 * fotos custar 1,5 MB em vez de 150. Mas para decidir se uma foto entra numa
 * proposta é preciso vê-la a sério, e até aqui a única forma era descarregá-la.
 *
 * Mostra-se o ORIGINAL (`image.url`), não a miniatura: é este o único sítio da
 * biblioteca onde os pixéis todos valem os bytes. Enquanto ele chega, fica a
 * miniatura esticada por baixo, para haver sempre alguma coisa no ecrã em vez
 * de um retângulo vazio.
 *
 * ── QUANDO O ORIGINAL NÃO CHEGA ────────────────────────────────────────────
 * A grelha ao lado já sabia disto e este ecrã não: sem `onError`, um URL
 * assinado que expirou ou uma foto apagada noutro separador deixavam o
 * «carregou» a `false` para sempre — a miniatura desfocada eternamente ou,
 * nas fotos que não têm nenhuma (precisamente as que o painel «Miniaturas»
 * existe para reparar), um retângulo preto sem uma palavra. Aqui usa-se a
 * mesma cascata do resto da casa (`useFotoComPlanoB`): tenta-se o original,
 * cai-se para a miniatura, e só depois se diz que não foi — com o botão para
 * voltar a tentar, porque desistir nunca quer dizer para sempre.
 */

export interface PhotoLightboxProps {
  images: ThemeImage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Transferir a foto que está à vista. */
  onDownload: (image: ThemeImage, index: number) => void;
  downloading?: boolean;
}

export default function PhotoLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  onDownload,
  downloading,
}: PhotoLightboxProps) {
  const image = images[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // O original ainda não chegou: mostra-se a miniatura esticada.
  const [loaded, setLoaded] = useState(false);
  const { alvo, desistiu, aoFalhar, tentarDeNovo } = useFotoComPlanoB(image?.url, image?.thumbUrl);

  // Recomeçar do princípio a cada alvo novo — outra foto, ou a queda do
  // original para a miniatura. Ajustado DURANTE o desenho, e não num efeito,
  // que é o padrão da casa (ver `ImagemComPlanoB`): assim não há um fotograma
  // com a opacidade da foto anterior por cima de uma imagem que ainda não
  // pediu nada.
  const [alvoVisto, setAlvoVisto] = useState(alvo);
  if (alvoVisto !== alvo) {
    setAlvoVisto(alvo);
    setLoaded(false);
  }

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= images.length) return;
      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  // Teclado: fechar, andar, e o foco presume-se cá dentro enquanto está aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
        return;
      }
      if (e.key !== "Tab") return;
      // Prender o foco: sem isto o Tab saía para a grelha por baixo, que está
      // tapada, e ninguém percebia onde tinha ido parar o cursor.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // O foco entra no diálogo ao abrir. Quem o devolve ao mosaico de origem é
  // quem abriu (a grelha guarda o elemento activo).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Enquanto está aberto, a página por baixo não rola.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!image) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${index + 1} de ${images.length}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/92"
      onClick={(e) => {
        // Clicar no fundo fecha; clicar na foto ou nos botões não.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <span className="text-sm tabular-nums text-white/80">
          {index + 1} / {images.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={downloading}
            onClick={() => onDownload(image, index)}
          >
            Transferir
          </Button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            // 36×36 medidos a 375 px. As setas ao lado já têm 44 (`h-11 w-11`)
            // e esta — a única forma de sair de um ecrã preto inteiro — tinha
            // menos. `.alvo-toque` iguala-a a elas, só ao dedo.
            className="alvo-toque flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ×
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Foto anterior"
            className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ‹
          </button>
        )}
        {/* A miniatura por baixo enquanto o original não chega: há sempre
            imagem, em vez de um retângulo preto durante um segundo. Deixa de
            fazer sentido quando é ELA o alvo (seria a mesma foto desfocada por
            baixo de si própria) ou quando já não há nada por onde tentar. */}
        {!loaded && !desistiu && image.thumbUrl && alvo !== image.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.thumbUrl}
            alt=""
            aria-hidden
            className="absolute max-h-full max-w-full object-contain blur-sm"
          />
        )}
        {desistiu || !alvo ? (
          <AvisoDeFalha
            titulo="Não foi possível mostrar esta fotografia"
            mensagem="A ligação pode ter caído, ou a foto pode ter sido removida noutro separador. O ficheiro continua no tema."
            aoTentarDeNovo={tentarDeNovo}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={alvo}
            src={alvo}
            alt={`Foto ${index + 1} de ${images.length}`}
            onLoad={() => setLoaded(true)}
            onError={aoFalhar}
            className={`max-h-full max-w-full object-contain motion-safe:transition-opacity ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Foto seguinte"
            className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
