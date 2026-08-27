# Back-office UI foundation

Shared, presentational primitives for the Líquen back office as it moves toward a
calm, spacious, professional **"ChatGPT-app"** aesthetic — lots of whitespace,
rounded cards, hairline borders, soft shadows, clear typography — while keeping
the **Líquen identity**: moss green, cream, and a serif display face for
headings.

These files are **strictly additive**. They reuse the existing tokens and CSS
classes already defined in `src/app/globals.css`; they introduce **no new
palette**. Adopt them in the overnight waves so every screen shares one language.

## Identity tokens (already defined — do not redefine)

From `@theme` in `globals.css`, available as Tailwind utilities:

| Token | Value | Use |
| --- | --- | --- |
| `--color-moss` / `bg-moss` | `#637a5f` | brand green (borders, tints, text) |
| `--color-moss-dark` | `#4c6350` | — |
| `#4d6350` | forest green call-out | **primary fill**, soft tints (`/10`) |
| `#1b2119` | forest ink | dark sidebar / heaviest surfaces |
| `--color-foreground` | `#2a2620` | ink; opacity steps carry text hierarchy |
| `--color-cream` | `#f7f4ee` | off-white accents (not admin page bg) |
| `--font-display` / `font-display` | Playfair | **all headings/titles** |

Admin surface is **white**. Text hierarchy is expressed with foreground opacity
(`text-foreground/90` … `/55` … `/45`) and the audited `.bo-text*` classes for
informational text. Danger uses `#8a2a22` (a dark red that clears WCAG AA on
white) — never plain red.

Existing CSS classes reused: `.bo-eyebrow` (uppercase micro-heading), `.bo-card`
language (white + hairline border + soft shadow), `.bo-input` field styling, and
the global `:focus-visible` moss ring (so primitives don't hand-roll focus).

## Spacing & radii scale

- **Raios — dois, e o segundo é de quem se clica.** Havia nove valores em 664
  chamadas; a análise mediu dois nos dois sites de referência, com a mesma
  regra: «o raio máximo está reservado ao elemento clicável».
  - **Conteúdo: 8 px.** Cartões, painéis, diálogos, campos, linhas de lista,
    menus. Não é preciso pedi-lo: `rounded-sm/md/lg/xl/2xl` valem TODOS 8 px
    dentro do back office — a escala do Tailwind está colapsada num sítio só
    (`body:has([data-admin-mode])` no `globals.css`), porque no v4 cada degrau
    compila para `var(--radius-*)`.
  - **Acção: pílula.** `rounded-full`. Vem de graça no primitivo `Button` e no
    `Segmented`; um botão de fundo cheio escrito à mão tem de a pedir, e há um
    teste que chumba se não a pedir.
  - **Miudezas sub-20 px: `rounded` (4 px).** Teclas de atalho, pegas de
    arrasto, etiquetas de 9 px, miniaturas. A 8 px deformavam-se. É o terceiro
    valor, e é deliberado.
- **Card padding:** `p-4` (sm) · `p-5 sm:p-6` (md, default) · `p-6 sm:p-8` (lg).
- **Vertical rhythm:** `PageHeader` reserves `pb-6`; section headers use `mb-5`;
  label→control gap is `gap-1.5`. Prefer generous whitespace over dividers.
- **Sombras — nenhuma no conteúdo.** Um cartão, um painel, uma linha de lista
  ou um campo NÃO levam sombra: distinguem-se por serem brancos sobre o cinzento
  da página (`--bo-surface-sunken`) mais o fio de `--bo-hairline`. Havia 90
  sombras em 16 valores; ficaram duas, e as duas são para o que está POR CIMA da
  página, nunca dentro dela:
  - `shadow-[var(--bo-sombra-suspensa)]` — menus, avisos, barras coladas ao
    fundo, o cartão a ser arrastado. Fecha-se e a página volta.
  - `shadow-[var(--bo-sombra-modal)]` — diálogos e folhas, que tapam a página.

  Se um elemento deixa de flutuar num ecrã largo (a gaveta do menu, o painel de
  detalhe), a sombra tem de sair nesse ponto de quebra: `lg:shadow-none`.
- **Motion:** everything is gated behind `motion-safe:`; reduced-motion users
  get no press-scale, spin, or tween. Never signal state by colour alone.

## Primitives — when to use each

| Component | Use it for |
| --- | --- |
| `Button` | Every clickable action. Variants: `primary` (moss, the affirmative action), `secondary` (outline), `ghost` (quiet/toolbar), `subtle` (soft moss tint), `danger` (destructive). Sizes `sm`/`md`/`lg`; `loading`, `disabled`, `iconLeft`/`iconRight`, `fullWidth`. |
| `Card` | The bare rounded white surface. `padding` prop; `padding="none"` when content self-manages. |
| `SectionCard` | A `Card` with a titled header: `eyebrow` + serif `title` + `description` + right-aligned `actions`. The default "titled panel". |
| `Field` | Any labelled input. `as="input"\|"textarea"\|"select"`, `hint`, `error`, `required`. Wires `label/for`, `aria-describedby`, `aria-invalid` for you. |
| `PageHeader` | The top of a screen: `eyebrow` + serif `title` + `subtitle` + `actions`. One per view (`as="h1"`). |
| `EmptyState` | A zero-data view — icon well + heading + guiding `description` + optional CTA. Teaches the newcomer the next step. |
| `Toolbar` | Layout bar above a list: `start` (filters/search) and `end` (actions). |
| `Segmented` | A small pill of mutually-exclusive options (view/filter switch). Radiogroup semantics + arrow-key nav. |

Import via the barrel:

```tsx
import {
  Button, Card, SectionCard, Field, PageHeader, EmptyState, Toolbar, Segmented,
} from "@/app/[lang]/orcamento/admin/ui";
```

## Rules

- **Client-safe & presentational.** All are `"use client"`. Never import a
  `*-store.ts` (or any data layer) from here — pass data/handlers via props.
- **Additive only.** Do not modify existing screens or `globals.css` to adopt
  these; swap call-sites screen-by-screen in later waves.
- **Reuse, don't reinvent.** New visual needs should extend these primitives or
  the existing tokens — resist inventing a parallel palette or radius.
