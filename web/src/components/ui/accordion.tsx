"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionContextValue {
  openItems: string[];
  toggle: (value: string) => void;
  type: "single" | "multiple";
}

const AccordionContext = React.createContext<AccordionContextValue | null>(
  null,
);

interface AccordionProps {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = "single",
  defaultValue,
  children,
  className,
}: AccordionProps) {
  const initial = React.useMemo(() => {
    if (!defaultValue) return [] as string[];
    return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
  }, [defaultValue]);

  const [openItems, setOpenItems] = React.useState<string[]>(initial);

  const toggle = React.useCallback(
    (value: string) => {
      setOpenItems((current) => {
        const isOpen = current.includes(value);
        if (type === "single") {
          return isOpen ? [] : [value];
        }
        return isOpen
          ? current.filter((v) => v !== value)
          : [...current, value];
      });
    },
    [type],
  );

  return (
    <AccordionContext.Provider value={{ openItems, toggle, type }}>
      <div className={cn("divide-y divide-surface-200", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  question: string;
  children: React.ReactNode;
}

export function AccordionItem({ value, question, children }: AccordionItemProps) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error("AccordionItem must be inside Accordion");
  const open = ctx.openItems.includes(value);
  const contentId = `accordion-content-${value}`;
  const triggerId = `accordion-trigger-${value}`;

  return (
    <div className="py-1">
      <h3>
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => ctx.toggle(value)}
          className="group flex w-full items-center justify-between gap-4 py-4 text-left cursor-pointer text-base md:text-lg font-semibold text-ink-800 transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
        >
          <span>{question}</span>
          <ChevronDown
            strokeWidth={1.75}
            className={cn(
              "h-5 w-5 shrink-0 text-surface-400 transition-transform duration-200",
              open && "rotate-180 text-brand-500",
            )}
          />
        </button>
      </h3>
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
        className="pb-4 pr-9 text-base leading-relaxed text-ink-600"
      >
        {children}
      </div>
    </div>
  );
}
