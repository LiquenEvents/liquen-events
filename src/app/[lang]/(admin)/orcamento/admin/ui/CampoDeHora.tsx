"use client";

import { useId, useMemo } from "react";
import { Escolha } from "./Escolha";
import { cn } from "./cn";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A HORA DEIXA DE SER UMA LISTA DO SISTEMA OPERATIVO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ela mandou a captura de um `<input type="time">` aberto — duas colunas de
 * números com o realce AZUL do sistema, «12» e «48» em caixas azuis, tudo fora
 * do desenho da casa — e escreveu: «vamos melhorar isto para o software da
 * Apple e com uma boa animação».
 *
 * ── E A RESPOSTA JÁ ESTAVA ESCRITA AQUI AO LADO ────────────────────────────
 *
 * É a MESMA queixa que ela fez sobre os `<select>`, e o `Escolha.tsx` desta
 * pasta já lhe respondeu, com a razão escrita no cabeçalho: a lista de um
 * controlo nativo é desenhada pelo SISTEMA OPERATIVO, fora do documento. Não é
 * «CSS difícil» — é CSS impossível. O azul que ela fotografou é o azul de
 * selecção do sistema, e nenhuma cor desta casa lá chega.
 *
 * Por isso este ficheiro NÃO inventa um terceiro mecanismo. Compõe o que já
 * existe: duas `Escolha` — as horas e os minutos —, e com elas vem tudo o que
 * custou a fazer e que um selector novo teria de refazer mal:
 *
 *  · teclado completo (setas, Home/End, escrever para saltar);
 *  · `role="listbox"`, `role="option"`, leitor de ecrã a sério;
 *  · a animação de abrir da casa, a mesma dos outros menus;
 *  · e o NATIVO NO TOQUE, que é a melhor parte da decisão que lá está: no
 *    telemóvel o controlo do sistema abre a roda colada em baixo, com inércia
 *    e com o VoiceOver a funcionar. Substituir isso é trocar uma coisa boa por
 *    uma imitação.
 *
 * ── OS MINUTOS DE CINCO EM CINCO, E O QUE JÁ LÁ ESTIVER ────────────────────
 *
 * Sessenta minutos numa lista são sessenta linhas para escolher «e meia». Um
 * dia de evento marca-se aos quartos e às meias horas — nenhuma montagem
 * começa às 09:07 —, portanto a lista é de cinco em cinco: doze linhas, que
 * cabem sem rolo.
 *
 * Mas uma hora que já esteja escrita fora do degrau NÃO se perde nem se
 * arredonda em silêncio: entra na lista como está, no seu lugar. Arredondar o
 * que ela escreveu à mão era mudar-lhe o guião sem lho dizer.
 */

/** Duas casas, sempre. «9» e «09» são a mesma hora e só uma delas alinha. */
function duasCasas(n: number): string {
  return String(n).padStart(2, "0");
}

const HORAS = Array.from({ length: 24 }, (_, h) => duasCasas(h));
const DEGRAU_DOS_MINUTOS = 5;

export interface CampoDeHoraProps {
  /** «HH:MM», ou vazio quando ainda não há hora. */
  value: string;
  onChange: (valor: string) => void;
  /** O nome que quem ouve o ecrã recebe — «Hora de início», «Hora». */
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  id?: string;
}

/**
 * Parte uma hora escrita em horas e minutos.
 *
 * Devolve vazio nas duas metades quando não há nada legível — e não zeros: um
 * campo por preencher que se mostre «00:00» está a afirmar meia-noite.
 */
function partir(valor: string): { h: string; m: string } {
  const encontro = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!encontro) return { h: "", m: "" };
  const h = Number(encontro[1]);
  const m = Number(encontro[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return { h: "", m: "" };
  return { h: duasCasas(h), m: duasCasas(m) };
}

export function CampoDeHora({
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
  containerClassName,
  id,
}: CampoDeHoraProps) {
  const automatico = useId();
  const { h, m } = partir(value);

  /**
   * Os minutos: os degraus, mais o que lá estiver se estiver fora deles.
   *
   * O `sort` numérico e não alfabético — «5» antes de «45» é o que se espera,
   * e uma ordenação por texto punha «05, 10, 15, 5» a quem escrevesse sem o
   * zero à frente.
   */
  const minutos = useMemo(() => {
    const degraus = Array.from({ length: 60 / DEGRAU_DOS_MINUTOS }, (_, i) =>
      duasCasas(i * DEGRAU_DOS_MINUTOS),
    );
    if (m && !degraus.includes(m)) {
      return [...degraus, m].sort((a, b) => Number(a) - Number(b));
    }
    return degraus;
  }, [m]);

  /**
   * Escolher metade de uma hora tem de dar uma hora inteira.
   *
   * Quem escolhe as horas num campo vazio não escreveu minutos nenhuns — e um
   * «14:» não é uma hora. Os minutos que faltam nascem a `00`, que é o que o
   * controlo nativo também faz. Ao contrário: escolher os minutos primeiro
   * sem horas não pode inventar uma hora, portanto fica à espera dela.
   */
  function mudarHora(nova: string) {
    if (!nova) return onChange("");
    onChange(`${nova}:${m || "00"}`);
  }

  function mudarMinuto(novo: string) {
    if (!h) return;
    onChange(`${h}:${novo || "00"}`);
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1", containerClassName)}
      role="group"
      aria-label={ariaLabel}
    >
      <Escolha
        id={id ?? `${automatico}-h`}
        aria-label={`${ariaLabel} — horas`}
        opcoes={HORAS.map((v) => ({ valor: v, rotulo: v }))}
        valor={h}
        aoMudar={mudarHora}
        vazio="--"
        disabled={disabled}
        className={cn("text-sm tabular-nums", className)}
        containerClassName="w-[68px]"
      />
      {/* Os dois pontos são do RELÓGIO e não de nenhum dos dois controlos, por
          isso vivem entre eles e não dentro de um. `aria-hidden` porque quem
          ouve já recebeu «horas» e «minutos» nos nomes de cada um — ler-lhe
          «dois pontos» pelo meio era ruído. */}
      <span aria-hidden="true" className="text-sm text-[var(--bo-text-faint)]">
        :
      </span>
      <Escolha
        aria-label={`${ariaLabel} — minutos`}
        opcoes={minutos.map((v) => ({ valor: v, rotulo: v }))}
        valor={m}
        aoMudar={mudarMinuto}
        vazio="--"
        disabled={disabled || !h}
        className={cn("text-sm tabular-nums", className)}
        containerClassName="w-[68px]"
      />
    </span>
  );
}
