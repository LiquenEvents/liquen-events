"use client";

import { useLayoutEffect, useRef } from "react";
import { chaveDoCampo, type CampoDeTexto } from "@/lib/proposal-ortografia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SEGUNDA CAIXA — A MESMA COISA, OUTRA VEZ, EM INGLÊS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vive POR BAIXO da caixa portuguesa, nunca ao lado. Três razões:
 *
 *  1. As linhas do `ServicesEditor` já vivem apertadas, com o arrasto, o mover e
 *     o apagar à direita. Não há largura.
 *  2. Por baixo, a leitura é «o mesmo campo, outra vez, em inglês» — que é o
 *     que é.
 *  3. Em tablet e telemóvel o lado-a-lado colapsava para baixo de qualquer
 *     maneira, e seria uma segunda maquetização a manter.
 *
 * ── O «EN» É UM RÓTULO E NÃO UM PLACEHOLDER ───────────────────────────────
 *
 * O placeholder desaparece quando se escreve, e é exactamente quando se escreve
 * que é preciso saber em que caixa se está. O perigo desta funcionalidade não é
 * a caixa vazia — é escrever português na caixa inglesa sem dar por isso, e
 * enviar. O `EN` fica lá sempre.
 *
 * ── A MARCA DE «POR TRADUZIR» ─────────────────────────────────────────────
 *
 * Uma caixa vazia com português escrito ao lado é uma falta; uma caixa vazia
 * com o português também vazio não é nada. A marca distingue-as ao olhar, para
 * a contagem que ela lê no passo seguinte não ser a primeira vez que ouve falar
 * do assunto.
 */
/**
 * Um `<textarea>` de uma linha que cresce com o que lá está.
 *
 * A altura mede-se no `useLayoutEffect` e não no `useEffect`: com o segundo, a
 * caixa aparecia com uma linha e saltava para duas à frente de quem escreve.
 * É o mesmo remédio que o `CampoQueCresce` do `ServicesEditor` usa — aqui não
 * se importa de lá porque estes dois ficheiros não se conhecem, e um import só
 * para quatro linhas ataria a caixa inglesa ao editor de serviços.
 */
function TextareaQueCresce(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // As bordas somam-se ao `scrollHeight` — ver a mesma conta, e a medição que
    // a obrigou, no `CampoQueCresce` do `ServicesEditor`.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={1} />;
}

export default function CaixaInglesa({
  campo,
  rotulo,
  valor,
  onChange,
  className,
  as = "input",
  rows,
  cresce = false,
  readOnly,
  porTraduzir,
  desactualizada,
  aoConfirmar,
  placeholder,
  aoLado = false,
}: {
  /** O campo que esta caixa traduz — dá a pega do salto e a chave. */
  campo: CampoDeTexto;
  /** Como o campo se chama no ecrã, em pt-PT. Vira «… (inglês)» na voz. */
  rotulo: string;
  valor: string;
  onChange: (texto: string) => void;
  /** A classe da caixa portuguesa — a inglesa herda-a, para as duas serem a
   *  mesma caixa e não duas maquetizações. */
  className?: string;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A CAIXA INGLESA AO LADO DA PORTUGUESA, E NÃO POR BAIXO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «hoje cada campo PT tem o seu EN empilhado por baixo,
   * duplicando a altura de tudo». Medido no formulário dela: cerca de dez mil
   * píxeis de altura, e a proposta bilingue paga o dobro em cada campo.
   *
   * Com isto, o par fica numa linha só sempre que a FILA tenha largura para os
   * dois — e empilha quando não tem. Cada caixa reserva `min-w-[12rem]`
   * (192 px), portanto o empilhado continua a acontecer exactamente onde tem
   * de acontecer: duas caixas de texto lado a lado com menos do que isso são
   * duas caixas onde não cabe uma frase.
   *
   * ── PORQUE É QUE JÁ NÃO HÁ PONTO DE CORTE NENHUM ────────────────────────
   *
   * Era `xl:` — 1280 px de JANELA. Mas a pergunta nunca foi sobre a janela: é
   * sobre a fila onde esta caixa está, e essa fila vive dentro de um cartão,
   * dentro de uma coluna que o índice do estúdio e o painel lateral estreitam
   * sem a janela encolher. É a regra 3 do MOBILE-AUDIT — `sm:` (e `xl:`) medem
   * o ECRÃ —, e a resposta que ela manda usar é a primeira da lista:
   * `flex-wrap` sozinho, que quebra só quando não cabe.
   *
   * O efeito prático: num portátil de 1024–1440, onde havia largura de sobra
   * para o par e mesmo assim se empilhava, ele passa a ficar lado a lado. Num
   * telemóvel a 375 px a fila não chega para 2×12rem e empilha, como sempre.
   *
   * ── PORQUE É QUE É UMA MARCA E NÃO UM AUTOMATISMO ───────────────────────
   *
   * Porque os pares vivem em dois desenhos diferentes: uns numa fila que
   * quebra (o cabeçalho de um mood board, onde o campo português divide a
   * linha com o botão da dobra) e outros dentro de um `div` seu. As classes
   * daqui servem os dois — `flex-1` na fila, `w-full` na grelha —, mas quem
   * sabe que o par existe é o sítio onde ele é escrito, e é lá que a grelha se
   * abre. Uma caixa que se pusesse ao lado sozinha ia parar ao lado de coisas
   * que não são o seu par.
   */
  aoLado?: boolean;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O INGLÊS QUE FICOU PARA TRÁS
   * ════════════════════════════════════════════════════════════════════════
   *
   * «Reunião Inicial» com «Ceremony Decor» por tradução: alguém traduziu, mudou
   * depois o português, e o inglês ficou errado. Uma caixa cheia passa em todas
   * as verificações que perguntam se ela está vazia.
   *
   * Marcada, lê-se DIFERENTE de por traduzir — são dois problemas com dois
   * remédios: um traduz-se, o outro relê-se. A tracejada laranja diz «falta»; a
   * moldura cheia e o aviso dizem «isto está aqui e pode estar errado».
   */
  desactualizada?: boolean;
  /**
   * «Já está bem assim.»
   *
   * Não muda o inglês — muda o que ele promete: passa a valer para o português
   * que lá está agora. Sem este botão, o único jeito de calar o aviso era
   * reescrever a tradução, e uma tradução certa que obriga a ser reescrita para
   * o ecrã se calar ensina a ignorar o ecrã.
   */
  aoConfirmar?: () => void;
  as?: "input" | "textarea";
  rows?: number;
  /**
   * A caixa cresce com o texto, a partir de UMA linha.
   *
   * Para as caixas que acompanham um campo que também cresce — o nome de um
   * serviço, por exemplo. Sem isto, a portuguesa abria a segunda linha e a
   * inglesa ao lado continuava a esconder o texto: as duas deixavam de ser «a
   * mesma caixa em duas línguas», que é a única razão de a inglesa herdar a
   * classe da outra.
   *
   * Desligado por omissão: as caixas de duas linhas fixas que já existem (a
   * nota do orçamento, por exemplo) ficam exactamente como estão.
   */
  cresce?: boolean;
  readOnly?: boolean;
  /** Há português escrito e esta caixa está vazia. */
  porTraduzir?: boolean;
  placeholder?: string;
}) {
  const comuns = {
    /**
     * A pega do salto, com o mesmo mecanismo do «Ver no campo» das gralhas:
     * a chave do campo mais `:en`. Uma segunda maquinaria para encontrar a
     * caixa inglesa era uma segunda maquinaria a avariar-se sozinha.
     */
    "data-campo": `${chaveDoCampo(campo)}:en`,
    value: valor,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    readOnly,
    placeholder,
    // Quem ouve o ecrã tem de ouvir a diferença: são duas caixas com o mesmo
    // nome a meio centímetro uma da outra.
    "aria-label": `${rotulo} (inglês)`,
    className: `${className ?? ""} ${
      desactualizada
        ? "border-[#8a2a22]/50 bg-[#8a2a22]/[0.05]"
        : porTraduzir
          ? "border-dashed border-[#c08a3e]/60 bg-[#4d6350]/[0.04]"
          : "bg-[#4d6350]/[0.04]"
    }`.trim(),
  };

  return (
    <div
      /* O `mt-1` só serve a caixa que fica SEMPRE por baixo: com a marca, a
         separação vertical passa a ser o `row-gap` da fila (que já existe, e
         que se aplica quando ela quebra) — de outra forma a caixa ficava 4 px
         mais abaixo do que o par, na linha em que está ao lado dele. */
      className={`flex w-full items-start gap-1.5 ${
        aoLado ? "min-w-[12rem] grow basis-[12rem]" : "mt-1 basis-full"
      }`}
    >
      <span
        aria-hidden="true"
        className="mt-1.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-[#4d6350]/80 uppercase"
      >
        EN
      </span>
      <div className="min-w-0 flex-1">
        {as === "textarea" ? (
          cresce ? (
            <TextareaQueCresce {...comuns} />
          ) : (
            <textarea {...comuns} rows={rows ?? 2} />
          )
        ) : (
          <input {...comuns} type="text" />
        )}
        {desactualizada && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] leading-snug text-[#8a2a22]">
            <span>O português mudou depois desta tradução.</span>
            {aoConfirmar && (
              <button
                type="button"
                onClick={aoConfirmar}
                className="underline underline-offset-2 hover:no-underline"
              >
                Já está bem assim
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
