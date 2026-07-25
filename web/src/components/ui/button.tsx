import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 hover:bg-brand-700 text-white shadow-[var(--shadow-glow-accent)] active:scale-[0.98]",
        default:
          "bg-brand-600 hover:bg-brand-700 text-white shadow-[var(--shadow-glow-accent)] active:scale-[0.98]",
        secondary:
          "bg-white hover:bg-surface-50 text-ink-700 border border-surface-300 shadow-sm active:scale-[0.98]",
        ghost:
          "bg-transparent hover:bg-surface-100 text-ink-600",
        outline:
          "bg-transparent text-brand-600 border border-brand-200 hover:bg-brand-50",
        subtle:
          "bg-brand-50 text-brand-700 hover:bg-brand-100 border border-transparent",
        link:
          "bg-transparent text-brand-600 hover:text-brand-700 underline underline-offset-4 px-0 h-auto",
        success:
          "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
        danger:
          "bg-red-500 hover:bg-red-600 text-white shadow-sm",
        destructive:
          "bg-red-500 hover:bg-red-600 text-white shadow-sm",
      },
      size: {
        xs: "h-8 px-3 text-xs rounded-lg",
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-base rounded-2xl",
        icon: "h-11 w-11 p-0",
        "icon-sm": "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Optional tone hint reflected on the DOM as `data-tone` for downstream
   * styling hooks (analytics, cypress selectors, tooltips). Purely metadata —
   * does not alter the composed class string.
   */
  tone?: "neutral" | "brand" | "success" | "warn" | "danger" | "info";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, tone, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-tone={tone}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
