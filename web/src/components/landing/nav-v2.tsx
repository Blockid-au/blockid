"use client";

/**
 * NavV2 — persistent header for the Homepage v2 lux theme.
 *
 * Enhanced menu (T-0317): the flat 4-link row is replaced with a nested
 * dropdown structure so pricing / per-segment / vs-comparison / docs
 * content moves out of the homepage fold and into the primary nav.
 *
 *  - Sticky top bar, semantic <header>/<nav aria-label="Primary">.
 *  - Desktop: hover-open dropdown with 150ms open + 200ms close delay
 *    (no flicker on cursor pass-through). Also click-to-toggle for
 *    keyboard/touch users.
 *  - Keyboard: Enter/Space toggles; Escape closes and restores focus to
 *    the trigger; ArrowUp/ArrowDown navigates menu items.
 *  - Mobile: disclosure with collapsible sub-lists per dropdown.
 *  - Only ONE dropdown open at a time; clicking a link closes it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Menu, X } from "lucide-react";
import { LocaleSwitcher } from "./locale-switcher";

// ---------------------------------------------------------------------------
// Menu model
// ---------------------------------------------------------------------------

interface MenuItem {
  href: string;
  label: string;
}

interface MenuGroupSection {
  heading: string;
  items: MenuItem[];
}

interface MenuGroup {
  kind: "group";
  key: string;
  label: string;
  width: "w-56" | "w-64" | "w-80";
  items: MenuItem[];
  /**
   * Optional sub-heading structure. When present, `items` is ignored for
   * rendering and each `sections[].items` is rendered under a sub-heading
   * label. Used by the Free Tools dropdown to group the 16 tools into 5
   * discoverable buckets (Idea / Cap Table / Fundraise / AU compliance /
   * Reports) without inflating the primary nav.
   */
  sections?: MenuGroupSection[];
}

interface MenuLink {
  kind: "link";
  key: string;
  label: string;
  href: string;
}

type MenuEntry = MenuGroup | MenuLink;

const MENU: MenuEntry[] = [
  {
    kind: "group",
    key: "product",
    label: "Product",
    width: "w-64",
    items: [
      // B1 Task 3 — /for/founder is now a 301 to /solutions/founder.
      { label: "Investor-ready score", href: "/solutions/founder#svi" },
      { label: "Cap table + ESOP", href: "/solutions/founder#captable" },
      { label: "Data room", href: "/solutions/founder#dataroom" },
      { label: "Valuation", href: "/solutions/founder#valuation" },
      { label: "Investor pack", href: "/solutions/founder#pack" },
    ],
  },
  {
    kind: "group",
    key: "for",
    label: "For",
    width: "w-56",
    items: [
      // B1 Task 3 — persona pages migrated to /solutions/*. Advisor now
      // uses /solutions/advisor (301 alias to /for/advisor lives in
      // next.config.ts) so the persona URL surface stays unified.
      { label: "Founders", href: "/solutions/founder" },
      { label: "Investors", href: "/solutions/investor" },
      { label: "Advisors", href: "/solutions/advisor" },
      { label: "Accelerators", href: "/solutions/accelerator" },
    ],
  },
  {
    // Workstream A7 — surface the 16 /tools/* routes in the primary nav,
    // grouped by founder journey stage so the dropdown stays scannable.
    kind: "group",
    key: "tools",
    label: "Free Tools",
    width: "w-80",
    items: [],
    sections: [
      {
        heading: "Idea",
        items: [
          { label: "Idea Lab", href: "/tools/idea-lab" },
          { label: "Idea Clarify", href: "/tools/idea-clarify" },
          { label: "Idea Valuation", href: "/tools/idea-valuation" },
          { label: "SAFE Calculator", href: "/tools/safe-calculator" },
        ],
      },
      {
        heading: "Cap Table",
        items: [
          { label: "Cap Table", href: "/tools/cap-table" },
          { label: "Dilution", href: "/tools/dilution" },
          { label: "Equity Split", href: "/tools/equity-split" },
          { label: "ESOP Checklist", href: "/tools/esop-checklist" },
        ],
      },
      {
        heading: "Fundraise",
        items: [
          { label: "Funding Plan", href: "/tools/funding-plan" },
          { label: "Term Sheet", href: "/tools/term-sheet" },
          { label: "Co-founder Match", href: "/tools/cofounder-match" },
        ],
      },
      {
        heading: "AU compliance",
        items: [
          { label: "ASIC", href: "/tools/asic" },
          { label: "ESIC", href: "/tools/esic" },
          { label: "R&D Tax", href: "/tools/rnd-tax" },
          { label: "Data Room", href: "/tools/data-room" },
        ],
      },
      {
        heading: "Reports",
        items: [
          { label: "Financial Projections", href: "/tools/financial-projections" },
        ],
      },
    ],
  },
  { kind: "link", key: "features", label: "Features", href: "/features" },
  { kind: "link", key: "pricing", label: "Pricing", href: "/pricing" },
  { kind: "link", key: "team",    label: "Team", href: "/team" },
  { kind: "link", key: "index",   label: "Startup Index", href: "/index" },
  {
    // ux-ia-startup-flow-v1 §C.1 + §C.7 — global Demo entry-point so a
    // visitor can always see the platform end-to-end before signup. First
    // sub-link is the Atlassian walkthrough (deep-linked to step 1).
    kind: "group",
    key: "demo",
    label: "Demo",
    width: "w-64",
    items: [
      { label: "Atlassian journey (live)", href: "/showcase/atlassian?step=1" },
      { label: "Sprocketbay journey", href: "/showcase/sprocketbay" },
      { label: "BlockID journey", href: "/showcase/blockid" },
      { label: "Canva journey", href: "/showcase/canva" },
      { label: "Xero journey", href: "/showcase/xero" },
      { label: "SafetyCulture journey", href: "/showcase/safetyculture" },
      { label: "All case studies", href: "/showcase" },
    ],
  },
  // Workstream A7 — Compare dropdown hidden for this iteration. Dedicated
  // /vs/<slug> pages don't exist yet, and the old entries just funnelled
  // into /pricing?compare= which measured intent without delivering it.
  // Restore once real comparison pages ship.
  {
    kind: "group",
    key: "docs",
    label: "Docs",
    width: "w-56",
    items: [
      { label: "Changelog", href: "/changelog" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Status", href: "/status" },
      { label: "Security audit", href: "/security-audit" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Desktop dropdown
// ---------------------------------------------------------------------------

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;

interface DesktopDropdownProps {
  group: MenuGroup;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCancelClose: () => void;
  onLinkActivate: () => void;
}

function DesktopDropdown({
  group,
  isOpen,
  onOpen,
  onClose,
  onCancelClose,
  onLinkActivate,
}: DesktopDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const panelId = useId();

  // When the menu opens via keyboard, focus the first item. On mouse-open
  // (hover) we keep focus on the trigger so the cursor drives selection.
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  useEffect(() => {
    if (isOpen && openedByKeyboard) {
      itemRefs.current[0]?.focus();
      setOpenedByKeyboard(false);
    }
  }, [isOpen, openedByKeyboard]);

  const handleTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpenedByKeyboard(true);
        onOpen();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpenedByKeyboard(true);
        onOpen();
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    },
    [isOpen, onOpen, onClose],
  );

  const handleItemKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLAnchorElement>, index: number) => {
      const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[(index + 1) % items.length];
        next?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[(index - 1 + items.length) % items.length];
        prev?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      } else if (e.key === "Tab") {
        // Let Tab close the menu naturally; restore focus behaviour is
        // handled by the browser moving focus outside the trigger.
        onClose();
      }
    },
    [onClose],
  );

  const handleTriggerClick = useCallback(() => {
    if (isOpen) onClose();
    else onOpen();
  }, [isOpen, onOpen, onClose]);

  return (
    <li
      className="relative"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`${group.label} menu`}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-brand-ink-muted transition-colors duration-200 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        {group.label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="menu"
          aria-label={group.label}
          onMouseEnter={onCancelClose}
          onMouseLeave={onClose}
          className={`absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-xl border border-brand-navy/40 bg-brand-navy p-2 shadow-2xl ${group.width} nav-v2-panel-enter`}
        >
          {group.sections ? (
            // Sectioned rendering (e.g. Free Tools): flatten items so
            // keyboard arrow-navigation still walks every link in order.
            (() => {
              let flatIndex = 0;
              return (
                <div className="flex flex-col gap-1">
                  {group.sections.map((section, sIdx) => (
                    <div
                      key={section.heading}
                      className={sIdx > 0 ? "mt-1 border-t border-white/5 pt-1" : ""}
                    >
                      <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-cyan/80">
                        {section.heading}
                      </p>
                      <ul>
                        {section.items.map((item) => {
                          const i = flatIndex++;
                          return (
                            <li key={item.href} role="none">
                              <Link
                                ref={(el) => {
                                  itemRefs.current[i] = el;
                                }}
                                role="menuitem"
                                href={item.href}
                                onClick={onLinkActivate}
                                onKeyDown={(e) => handleItemKeyDown(e, i)}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-brand-ink hover:bg-brand-cyan/10 focus:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                              >
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : (
            <ul className="flex flex-col">
              {group.items.map((item, i) => (
                <li key={item.href} role="none">
                  <Link
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    role="menuitem"
                    href={item.href}
                    onClick={onLinkActivate}
                    onKeyDown={(e) => handleItemKeyDown(e, i)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-ink hover:bg-brand-cyan/10 focus:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Mobile disclosure sub-list
// ---------------------------------------------------------------------------

interface MobileGroupProps {
  group: MenuGroup;
  onLinkActivate: () => void;
}

function MobileGroup({ group, onLinkActivate }: MobileGroupProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${group.label} menu`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-brand-ink-muted hover:bg-white/5 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        <span>{group.label}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && (
        group.sections ? (
          <div
            id={panelId}
            role="menu"
            aria-label={group.label}
            className="mt-1 flex flex-col gap-1 pl-3"
          >
            {group.sections.map((section) => (
              <div key={section.heading}>
                <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-cyan/80">
                  {section.heading}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <li key={item.href} role="none">
                      <Link
                        role="menuitem"
                        href={item.href}
                        onClick={onLinkActivate}
                        className="block rounded-md px-3 py-1.5 text-sm text-brand-ink hover:bg-brand-cyan/10 focus:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul
            id={panelId}
            role="menu"
            aria-label={group.label}
            className="mt-1 flex flex-col gap-0.5 pl-3"
          >
            {group.items.map((item) => (
              <li key={item.href} role="none">
                <Link
                  role="menuitem"
                  href={item.href}
                  onClick={onLinkActivate}
                  className="block rounded-md px-3 py-2 text-sm text-brand-ink hover:bg-brand-cyan/10 focus:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Top-level NavV2
// ---------------------------------------------------------------------------

export function NavV2() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = useCallback(
    (key: string) => {
      clearTimers();
      openTimerRef.current = setTimeout(() => {
        setOpenKey(key);
      }, OPEN_DELAY_MS);
    },
    [clearTimers],
  );

  const scheduleClose = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    closeTimerRef.current = setTimeout(() => {
      setOpenKey(null);
    }, CLOSE_DELAY_MS);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openImmediately = useCallback(
    (key: string) => {
      clearTimers();
      setOpenKey(key);
    },
    [clearTimers],
  );

  const closeImmediately = useCallback(() => {
    clearTimers();
    setOpenKey(null);
  }, [clearTimers]);

  // Close open dropdown when Escape pressed anywhere in the nav
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeImmediately();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey, closeImmediately]);

  // Click-outside closes the open dropdown
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!openKey) return;
    const onClick = (e: MouseEvent) => {
      if (!navRef.current) return;
      if (!navRef.current.contains(e.target as Node)) closeImmediately();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openKey, closeImmediately]);

  const handleLinkActivate = useCallback(
    (_e?: ReactMouseEvent) => {
      closeImmediately();
      setMobileOpen(false);
    },
    [closeImmediately],
  );

  return (
    <header
      ref={navRef}
      // Intentional dark island — the persistent NavV2 header always renders
      // against the deep-navy lux ground even when hosted in a light-theme
      // page. Self-scoping with data-theme="dark" keeps its legacy
      // `text-brand-ink*`, `bg-brand-navy`, `border-white/*` utilities
      // resolving to the dark palette regardless of the surrounding page.
      data-theme="dark"
      className="sticky top-0 z-50 border-b border-white/5 bg-brand-navy/85 backdrop-blur"
    >
<nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link
          href="/"
          aria-label="BlockID.au — home"
          className="flex items-center gap-2.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
        >
          {/* Logo mark (octagon + star) — 32px square */}
          <Image
            src="/images/logo-icon-transparent.webp"
            alt="BlockID logo"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 select-none"
            priority
          />
          <span className="flex items-baseline gap-1 text-base font-semibold text-brand-ink">
            BlockID<span className="text-brand-cyan">.au</span>
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 md:flex">
          {MENU.map((entry) => {
            if (entry.kind === "link") {
              return (
                <li key={entry.key}>
                  <Link
                    href={entry.href}
                    onClick={() => closeImmediately()}
                    className="rounded-md px-3 py-2 text-sm font-medium text-brand-ink-muted transition-colors duration-200 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {entry.label}
                  </Link>
                </li>
              );
            }
            return (
              <DesktopDropdown
                key={entry.key}
                group={entry}
                isOpen={openKey === entry.key}
                onOpen={() =>
                  openKey === entry.key
                    ? cancelClose()
                    : openKey
                      ? openImmediately(entry.key)
                      : scheduleOpen(entry.key)
                }
                onClose={scheduleClose}
                onCancelClose={cancelClose}
                onLinkActivate={() => handleLinkActivate()}
              />
            );
          })}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <LocaleSwitcher />
          <Link
            href="/submit"
            className="rounded-lg border border-brand-cyan/40 px-3 py-2 text-sm font-medium text-brand-cyan transition-colors duration-200 hover:border-brand-cyan hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Submit startup
          </Link>
          <Link
            href="/auth/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink-muted transition-colors duration-200 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-cyan px-4 text-sm font-semibold text-brand-navy transition duration-200 hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            Start free
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-ink md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          aria-expanded={mobileOpen}
          aria-controls="nav-v2-mobile-menu"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* Mobile panel */}
      {mobileOpen && (
        <div
          id="nav-v2-mobile-menu"
          className="border-t border-white/5 bg-brand-navy px-4 pb-4 pt-2 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {MENU.map((entry) =>
              entry.kind === "link" ? (
                <li key={entry.key}>
                  <Link
                    href={entry.href}
                    onClick={() => handleLinkActivate()}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-brand-ink-muted hover:bg-white/5 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {entry.label}
                  </Link>
                </li>
              ) : (
                <MobileGroup
                  key={entry.key}
                  group={entry}
                  onLinkActivate={() => handleLinkActivate()}
                />
              ),
            )}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
            <Link
              href="/submit"
              onClick={() => handleLinkActivate()}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-cyan/40 px-4 text-sm font-medium text-brand-cyan hover:border-brand-cyan hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Submit your startup
            </Link>
            <Link
              href="/auth/login"
              onClick={() => handleLinkActivate()}
              className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-brand-ink-muted hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              onClick={() => handleLinkActivate()}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-cyan px-4 text-sm font-semibold text-brand-navy hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export default NavV2;
