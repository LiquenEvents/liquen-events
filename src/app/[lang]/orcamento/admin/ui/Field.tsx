"use client";

import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

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

const CONTROL =
  "w-full rounded-xl bg-white border text-sm text-foreground/90 placeholder:text-foreground/35 " +
  "shadow-[0_1px_2px_rgba(42,38,32,0.04)] motion-safe:transition-colors " +
  "focus:outline-none px-3.5 py-2.5";

export function Field(props: FieldProps) {
  const {
    label,
    hint,
    error,
    hideLabel,
    containerClassName,
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
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cn(hint ? hintId : undefined, error ? errorId : undefined) || undefined;

  const controlClass = cn(
    CONTROL,
    error
      ? "border-[#8a2a22]/70 focus:border-[#8a2a22]"
      : "border-foreground/50 focus:border-foreground/75",
    className,
  );

  const shared = {
    id,
    required,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    className: controlClass,
    ...control,
  };

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label htmlFor={id} className={cn("bo-eyebrow", hideLabel && "sr-only")}>
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
        <select {...(shared as SelectHTMLAttributes<HTMLSelectElement> & { id: string })} />
      ) : (
        <input {...(shared as InputHTMLAttributes<HTMLInputElement> & { id: string })} />
      )}

      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-foreground/45">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1 text-xs leading-relaxed text-[#8a2a22]">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
