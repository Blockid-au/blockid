import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Legacy variants — preserved byte-for-byte so existing consumers stay identical.
        primary:
          "bg-brand-600 hover:bg-brand-700 text-white shadow-sm cta-glow active:scale-[0.98]",
        secondary:
          "bg-white hover:bg-surface-50 text-ink-700 border border-surface-300 shadow-sm active:scale-[0.98]",
        ghost:
          "bg-transparent hover:bg-surface-100 text-ink-600",
        outline:
          "bg-transparent text-brand-600 border border-brand-200 hover:bg-brand-50",
        success:
          "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
        danger:
          "bg-red-500 hover:bg-red-600 text-white shadow-sm",
        // Design-system additions — required by spec.
        // `default` is an alias for `primary` so consumers can use either name.
        default:
          "bg-brand-600 hover:bg-brand-700 text-white shadow-sm cta-glow active:scale-[0.98]",
        // `destructive` is an alias for `danger` to match shadcn/ui conventions.
        destructive:
          "bg-red-500 hover:bg-red-600 text-white shadow-sm",
        // `subtle` = low-contrast filled brand chip.
        subtle:
          "bg-brand-50 hover:bg-brand-100 text-brand-700 border border-transparent",
        // `link` = inline text-link styled button.
        link:
          "bg-transparent text-brand-600 hover:text-brand-700 underline underline-offset-4 decoration-brand-300 hover:decoration-brand-500 shadow-none rounded-none h-auto px-0",
      },
      size: {
        // Legacy sizes preserved.
        xs: "h-8 px-3 text-xs rounded-lg",
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-base rounded-2xl",
        // Design-system additions.
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
   * Optional semantic tone reflected onto the DOM as data-tone for
   * downstream hooks (analytics, theming). Purely additive.
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
