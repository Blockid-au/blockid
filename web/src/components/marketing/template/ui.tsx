/**
 * Light-template UI primitives (G26, docs/design/unicorn-template.md v2 § 3).
 *
 * One page header, one card, one table, one form field and one button set —
 * the same on marketing, workspace, evaluator and admin pages, so the whole
 * site shares the light contract: white / sunken surfaces, dark ink,
 * brand-navy primary action, 44 px hit areas, brand-navy focus rings.
 *
 * Server-safe (no hooks). `Button` renders a native `<button>`; for links
 * use `CtaLink` (same skins). All colours come from the semantic tokens —
 * never a raw hex, never `bg-brand-navy text-white` by hand (`bg-action`
 * already IS brand navy).
 */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { CtaRow } from "./cta-link";
import {
  BUTTON_CLASS,
  CARD_CLASS,
  CARD_INTERACTIVE_CLASS,
  CONTAINER,
  EYEBROW,
  FIELD_ERROR_CLASS,
  FIELD_HINT_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_TD_CLASS,
  TABLE_TH_CLASS,
  type ButtonVariant,
  type Cta,
} from "./primitives";

// ---------------------------------------------------------------------------
// PageHeader — eyebrow · h1 · lede (+ ≤ 2 actions). The in-app sibling of
// PageHero: no visual slot, tighter rhythm, left-aligned, sits on white.
// ---------------------------------------------------------------------------

export interface PageHeaderProps {
  eyebrow?: string;
  /** The page's ONE h1. */
  title: ReactNode;
  lede?: ReactNode;
  actions?: readonly Cta[];
  /** Rendered to the right of the title on `sm+` (a status chip, a toolbar). */
  aside?: ReactNode;
  /** `contained` (default) wraps in the template container; `bare` for pages that already have one. */
  layout?: "contained" | "bare";
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  aside,
  layout = "contained",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "bg-surface pb-6 pt-8 sm:pb-8 sm:pt-10",
        layout === "contained" && "border-b border-line-subtle",
        className,
      )}
    >
      <div
        className={cn(
          layout === "contained" && CONTAINER,
          "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        )}
      >
        <div className="max-w-2xl">
          {eyebrow ? <p className={EYEBROW}>{eyebrow}</p> : null}
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance text-primary sm:text-4xl">
            {title}
          </h1>
          {lede ? (
            <p className="mt-3 text-base leading-relaxed text-secondary sm:text-lg">{lede}</p>
          ) : null}
          {actions && actions.length > 0 ? <CtaRow ctas={actions} className="mt-5" /> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Card — white, 1 px line, shadow-1. `as` picks the element (section by
// default so a titled card is a landmark-free region with its own h3).
// ---------------------------------------------------------------------------

export interface CardProps {
  title?: ReactNode;
  /** Small line under the title. */
  sub?: ReactNode;
  /** Top-right slot (a chip, a menu). */
  aside?: ReactNode;
  /** Adds the hover lift for cards that are one link/button. */
  interactive?: boolean;
  /** `none` removes the padding for tables / media that bleed to the edge. */
  padding?: "default" | "none";
  as?: "section" | "div" | "article" | "li";
  className?: string;
  children?: ReactNode;
}

export function Card({
  title,
  sub,
  aside,
  interactive = false,
  padding = "default",
  as: Tag = "section",
  className,
  children,
}: CardProps) {
  const hasHeader = Boolean(title || sub || aside);
  return (
    <Tag
      className={cn(
        interactive ? CARD_INTERACTIVE_CLASS : CARD_CLASS,
        padding === "none" && "p-0",
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            "flex items-start justify-between gap-4",
            padding === "none" && "px-6 pt-6",
            children ? "mb-4" : undefined,
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h3 className="font-display text-lg font-semibold tracking-tight text-primary">{title}</h3>
            ) : null}
            {sub ? <p className="mt-1 text-sm text-secondary">{sub}</p> : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Table — sticky sunken head, zebra sunken rows, 44 px rows. Wrap in
// `<Card padding="none">` for the bordered look; `TableWrap` adds the
// horizontal scroll container phones need.
// ---------------------------------------------------------------------------

export interface TableColumn {
  key: string;
  header: ReactNode;
  /** `num` right-aligns with tabular figures. */
  align?: "start" | "num";
  className?: string;
}

export interface TableProps {
  columns: readonly TableColumn[];
  rows: readonly Record<string, ReactNode>[];
  /** Row key field (defaults to the first column's key). */
  rowKey?: string;
  caption?: ReactNode;
  /** Shown as a single spanning row when `rows` is empty. */
  empty?: ReactNode;
  className?: string;
}

export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

export function Th({ align = "start", className, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "start" | "num" }) {
  return (
    <th
      scope="col"
      className={cn(TABLE_TH_CLASS, align === "num" && "text-right tabular-nums", className)}
      {...rest}
    />
  );
}

export function Td({ align = "start", className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "start" | "num" }) {
  return (
    <td
      className={cn(TABLE_TD_CLASS, align === "num" && "text-right font-mono tabular-nums", className)}
      {...rest}
    />
  );
}

export function Table({ columns, rows, rowKey, caption, empty = "Nothing here yet.", className }: TableProps) {
  const keyField = rowKey ?? columns[0]?.key ?? "id";
  return (
    <TableWrap>
      <table className={cn(TABLE_CLASS, className)}>
        {caption ? <caption className="p-3 text-left text-xs text-muted">{caption}</caption> : null}
        <thead className={TABLE_HEAD_CLASS}>
          <tr>
            {columns.map((c) => (
              <Th key={c.key} align={c.align} className={c.className}>
                {c.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className={TABLE_ROW_CLASS}>
              <Td colSpan={columns.length} className="text-center text-muted">
                {empty}
              </Td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={String(row[keyField] ?? i)} className={TABLE_ROW_CLASS}>
                {columns.map((c) => (
                  <Td key={c.key} align={c.align} className={c.className}>
                    {row[c.key]}
                  </Td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}

// ---------------------------------------------------------------------------
// Field — visible label, 44 px control, hint / error under the control.
// ---------------------------------------------------------------------------

interface FieldBaseProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

type FieldProps =
  | (FieldBaseProps & { as?: "input" } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "required">)
  | (FieldBaseProps & { as: "textarea" } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className" | "required">)
  | (FieldBaseProps & { as: "select"; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "required">);

export function Field(props: FieldProps) {
  const { id, label, hint, error, required, className } = props;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    required,
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: FIELD_INPUT_CLASS,
  } as const;

  let control: ReactNode;
  if (props.as === "textarea") {
    const { as: _as, id: _i, label: _l, hint: _h, error: _e, required: _r, className: _c, ...rest } = props;
    control = <textarea rows={4} {...shared} {...rest} />;
  } else if (props.as === "select") {
    const { as: _as, id: _i, label: _l, hint: _h, error: _e, required: _r, className: _c, children, ...rest } = props;
    control = (
      <select {...shared} {...rest}>
        {children}
      </select>
    );
  } else {
    const { as: _as, id: _i, label: _l, hint: _h, error: _e, required: _r, className: _c, ...rest } = props;
    control = <input type="text" {...shared} {...rest} />;
  }

  return (
    <div className={className}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-bear">
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className={FIELD_HINT_CLASS}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button — native <button> with the CTA skins. Loading disables + announces.
// ---------------------------------------------------------------------------

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({ variant = "primary", loading = false, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BUTTON_CLASS[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
