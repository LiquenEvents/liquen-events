"use client";

import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { Escolha } from "./Escolha";
import { ESTADO } from "./movimento";

/**
 * A labelled form control with the wiring people forget: a real `<label for>`,
 * a hint and/or error line joined to the control via `aria-describedby`, and
 * `aria-invalid` flipped when there's an error. Styling reuses the existing
 * `.bo-input` language (white field, identifiable ≥3:1 border, calm focus).
 *
 * Pick the control with `as` (`"input"` default, `"textarea"`, `"select"`); any
 * native prop for that element is forwarded. For a select, pass `<option>`s as
 * children.
 *
 * ── E `as="select"` JÁ NÃO É UM `<select>` COM RATO ─────────────────────────
 *
 * A caixa que se abria era desenhada pelo SISTEMA OPERATIVO, fora do documento,
 * e nenhum CSS lhe chegava: o azul de selecção era o do Windows, e a lista não
 * tinha raio, nem tinta, nem entrada nenhuma. Quem desenha agora é o
 * `ui/Escolha` — com o teclado completo, o `role="combobox"`/`listbox` e o
 * formulário que o nativo dava de graça, e com o `<select>` do sistema mantido
 * onde ele é bom: no dedo (a justificação está no cabeçalho do `Escolha.tsx`).
 *
 * **A API não mudou uma vírgula**, e é isso que faz esta troca valer por vinte
 * campos ao mesmo tempo: continua a receber `value`, um `onChange` que lê
 * `e.target.value`, e `<option>`/`<optgroup>` como filhos. O que muda é o que
 * se abre.
 *
 * O aspecto também não muda: o `Escolha` entra com a pele `nua` e a cadeia de
 * classes que se desenha aqui em baixo continua a ser a única que pinta.
 *
 * The error is never signalled by colour alone: the border thickens, an
 * `⚠`-prefixed message appears, and `aria-invalid` exposes it to assistive tech.
 *
 * @example
 * <Field label="Nome do cliente" name="name" required placeholder="Ex.: Maria" />
 *
 * @example
 * <Field as="textarea" label="Notas" hint="Só para uso interno." rows={4} />
 *
 * @example
 * <Field as="select" label="Estado" value={status} onChange={onChange}>
 *   <option value="novo">Novo</option>
 *   <option value="cotado">Proposta enviada</option>
 * </Field>
 */

type BaseProps = {
  /** Visible label text — always rendered, always tied to the control. */
  label: ReactNode;
  /** Helper text under the field. Announced to screen readers when present. */
  hint?: ReactNode;
  /** Error message. When set, thickens the border and sets `aria-invalid`. */
  error?: ReactNode;
  /** Hide the label visually while keeping it for assistive tech. */
  hideLabel?: boolean;
  /** Wrapper class (the control itself takes native `className`). */
  containerClassName?: string;
  /**
   * Visual style. `box` (default) is the boxed `.bo-input` look; `underline`
   * is the ultra-minimal variant — no box, no shadow, just a hairline under
   * the value that darkens to moss on focus. Same a11y wiring either way.
   */
  variant?: "box" | "underline";
};

type InputFieldProps = BaseProps & { as?: "input" } & Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "id"
  >;
type TextareaFieldProps = BaseProps & { as: "textarea" } & Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "id"
  >;
type SelectFieldProps = BaseProps & { as: "select" } & Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "id"
  >;

export type FieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

// Um campo recebe `ESTADO` mas NÃO `PRESSAO`: encolher 2% uma caixa de
// escrever quando lhe tocam seria movimento a fingir que houve um botão. O que
// um campo tem é foco e contorno, e isso é estado — 120 ms.
const CONTROL =
  "w-full rounded-xl bg-white border text-sm text-[var(--bo-text)] placeholder:text-foreground/35 " +
  " " +
  ESTADO +
  " focus:outline-none px-3.5 py-2.5";

// Underline variant: transparent, unboxed, a hairline that darkens on focus.
// `rounded-none` keeps iOS Safari from re-rounding the bare input.
const CONTROL_UNDERLINE =
  "w-full rounded-none bg-transparent border-0 border-b text-sm text-[var(--bo-text)] " +
  "placeholder:text-foreground/30 " +
  ESTADO +
  " focus:outline-none px-0 py-2";

export function Field(props: FieldProps) {
  const {
    label,
    hint,
    error,
    hideLabel,
    containerClassName,
    variant = "box",
    as = "input",
    className,
    required,
    ...control
  } = props as BaseProps & {
    as?: "input" | "textarea" | "select";
    className?: string;
    required?: boolean;
  } & Record<string, unknown>;

  const id = useId();
  // O `<label for>` nomeia um `<input>`, um `<textarea>` e um `<select>` por
  // ser nativo. Um `role="combobox"` recebe o nome do AUTOR — e é por isso que
  // o rótulo passa a ter `id`: sem ele, o campo de escolher ficava sem nome
  // para quem ouve o ecrã, que é a maneira mais silenciosa de estragar isto.
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // Only reference the hint node when it is actually rendered below (the hint is
  // suppressed while an error is shown), so aria-describedby never dangles.
  const describedBy =
    cn(hint && !error ? hintId : undefined, error ? errorId : undefined) || undefined;

  const controlClass = cn(
    variant === "underline" ? CONTROL_UNDERLINE : CONTROL,
    error
      ? "border-[#8a2a22]/70 focus:border-[#8a2a22]"
      : variant === "underline"
        ? "border-foreground/20 focus:border-sage-600 hover:border-foreground/40"
        : "border-foreground/50 focus:border-foreground/75",
    className,
  );

  const shared: Record<string, unknown> & { id: string } = {
    id,
    required,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    className: controlClass,
    ...control,
  };

  // ── Rede de segurança: filhos num `<input>` ──────────────────────────────
  // Este componente DESENHA o controlo. Quem escreve
  // `<Field label="Nome"><input /></Field>` — que compila, porque as
  // propriedades nativas são reencaminhadas — põe um filho dentro de um
  // elemento vazio, e aí o React não avisa: ABORTA a árvore inteira. Um ecrã
  // do back office ficava em branco por causa de um campo mal escrito (foi o
  // que aconteceu aos três separadores do Material).
  //
  // Aqui deitam-se os filhos fora para o resto do ecrã sobreviver. O
  // `Field.contrato.test.ts` é que impede o erro de chegar ao main; isto é só
  // para o estrago nunca ser "a página toda".
  if (as !== "select" && as !== "textarea" && shared.children != null) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "<Field> desenha o próprio controlo: passe as propriedades ao Field " +
          '(e use as="select" quando quiser <option>s). Os filhos foram ignorados.',
      );
    }
    delete shared.children;
  }

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label id={labelId} htmlFor={id} className={cn("bo-eyebrow", hideLabel && "sr-only")}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-[#8a2a22]/80">
            *
          </span>
        )}
      </label>

      {as === "textarea" ? (
        <textarea {...(shared as TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string })} />
      ) : as === "select" ? (
        /* ── A PONTE ENTRE O `onChange` DE SEMPRE E O `aoMudar` NOVO ────────
           O `Escolha` devolve o VALOR e não um evento — é a API honesta, porque
           não há `<select>` nenhum de onde o evento pudesse vir. Mas vinte
           chamadores desta casa escrevem `onChange={(e) => …e.target.value}`, e
           reescrevê-los todos à mão era vinte oportunidades de trocar um valor
           por um rótulo em silêncio.

           Por isso a ponte é aqui, uma vez, à vista: monta-se o objecto mínimo
           que esses vinte lêem. Está tudo verificado — os vinte usam
           `e.target.value` e mais nada (nem `currentTarget`, nem `target.name`,
           nem `preventDefault`), e o `Field.escolha.test.tsx` ao lado prende
           esse contrato para que o dia em que alguém precise de mais não seja
           um `undefined` calado.

           A pele é `nua`: o desenho continua a ser a cadeia que se calculou
           aqui em cima, portanto nenhum dos vinte campos muda de aspecto. */
        <Escolha
          id={id}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          variante="nua"
          /* A largura vive na caixa (ver `containerClassName` no `Escolha`): o
             `w-full` do `controlClass` veste o controlo, e este veste a caixa
             que o segura — senão a seta ficava a flutuar à direita do campo. */
          containerClassName="w-full"
          className={controlClass}
          required={required}
          disabled={control.disabled as boolean | undefined}
          name={control.name as string | undefined}
          valor={
            control.value === undefined || control.value === null
              ? undefined
              : String(control.value)
          }
          /* Sem `value` o campo é NÃO-CONTROLADO, como um `<select>` sem
             `value`: o `defaultValue` continua a valer e o estado é de lá
             dentro. Sem esta linha, um campo assim ficava preso no vazio — e
             preso em silêncio, que é o pior modo de falhar. */
          valorInicial={
            control.defaultValue === undefined || control.defaultValue === null
              ? undefined
              : String(control.defaultValue)
          }
          aoMudar={(v) => {
            const aoMudar = control.onChange as
              | ((e: { target: { value: string; name?: string } }) => void)
              | undefined;
            aoMudar?.({ target: { value: v, name: control.name as string | undefined } });
          }}
        >
          {control.children as ReactNode}
        </Escolha>
      ) : (
        <input {...(shared as InputHTMLAttributes<HTMLInputElement> & { id: string })} />
      )}

      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-foreground/45">
          {hint}
        </p>
      )}
      {/* ── A LINHA DE ERRO APARECE DE ALGUM SÍTIO ────────────────────────
          Montava de repente, no mesmo fotograma em que a dica desaparecia (a
          dica é `hint && !error`: as duas trocam de lugar). Uma troca
          instantânea onde estava outra coisa lê-se como um salto do
          formulário, e não como uma resposta ao que se escreveu.

          `.bo-entrada` sem variante: quatro píxeis, a distância de um RÓTULO.
          Não é um aviso que chega de fora — nasce colada ao campo que a
          explica, e é só isso que o movimento diz: veio dali.

          ── E NÃO ATRASA NEM ESCONDE NADA ────────────────────────────────
          A `.bo-entrada` mexe em `transform` e `opacity` e mais nada. O `<p>`
          está no DOM com o seu `id` desde o primeiro fotograma, portanto o
          `aria-describedby` do controlo (e o `aria-invalid`) apontam para ele
          sem esperar pela animação: quem ouve o ecrã ouve o erro ao mesmo
          tempo, anime-se ou não. E `prefers-reduced-motion` desliga-a no
          `globals.css`.

          ── VALE A PENA? UM CHAMADOR, MAS É O PRIMITIVO ───────────────────
          Com franqueza: hoje vê-se num sítio só — `EmailDoEnvio.tsx:368` é o
          único `error=` de toda a pasta. Não é o ganho do dia; é higiene do
          primitivo, que é onde uma linha de CSS passa a render à medida que o
          `error` for sendo usado, em vez de cada formulário inventar a sua. */}
      {error && (
        <p
          id={errorId}
          className="bo-entrada flex items-start gap-1 text-xs leading-relaxed text-[#8a2a22]"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
