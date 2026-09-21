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
 *  - Auth-aware (T0238): `useAuthUser()` asks /api/auth/me after hydration,
 *    so the header stays mountable on statically generated pages. Signed
 *    out → "Sign in" + the "Start a cohort" CTA (G21 P0-B, G25 label); signed in
 *    → "My workspace" + the account menu; a neutral skeleton while resolving.
 *  - The ONLY public header (G13-W5-IA5, spec §E S-IA5). `site/navbar.tsx`
 *    — the floating glass bar ~50 app / docs / tools / auth pages mounted —
 *    is deleted; those pages mount this component instead.
 *  - G26 (2026-09-21): the bar is LIGHT everywhere — a white island with a
 *    1 px `--ds-border` line, dark ink links and the navy primary CTA
 *    (`bg-action`). The old navy `variant="dark"` skin is gone; the prop is
 *    still accepted (deprecated) and renders the light skin so existing
 *    callers compile until the page lanes drop it. The header always scopes
 *    `data-theme="light"` so it stays light even inside a legacy dark wrapper.
 *  - The signed-in menu is `lib/nav/user-menu.ts` — the same rows as the
 *    workspace avatar menu, so a founder never meets two account menus.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import {
  useAuthUser,
  userInitials,
  userShortName,
  type AuthUser,
} from "@/hooks/useAuthUser";
import { trackEvent } from "@/lib/analytics";
import { USER_MENU_SIGN_OUT_LABEL, userMenuItems, type UserMenuIcon } from "@/lib/nav/user-menu";
import { START_COHORT_CTA_ID, START_COHORT_HREF, START_COHORT_LABEL } from "@/lib/marketing/start-cohort";
import { LocaleSwitcher } from "./locale-switcher";

// ---------------------------------------------------------------------------
// Variant (G13-W5-IA5) — one component, two skins
// ---------------------------------------------------------------------------

/** `"light"` is the only skin (G26). `"dark"` is a deprecated alias kept so callers compile. */
export type NavVariant = "dark" | "light";

/**
 * Every colour class the bar uses. Semantic tokens only, so the bar resolves
 * against the light `--ds-*` ramp inside its own `data-theme="light"` scope.
 */
interface NavTheme {
  header: string;
  brandWord: string;
  brandDot: string;
  ring: string;
  ringOffset: string;
  navLink: string;
  panel: string;
  divider: string;
  sectionHeading: string;
  item: string;
  mobileTrigger: string;
  mobilePanel: string;
  mobileToggle: string;
  skeleton: string;
  workspaceBtn: string;
  signIn: string;
  cta: string;
  avatar: string;
  avatarBtn: string;
  text: string;
  muted: string;
  planBadge: string;
  accentLink: string;
}

const LIGHT_NAV_THEME: NavTheme = {
    header: "border-b border-line-subtle bg-surface/95 backdrop-blur",
    brandWord: "text-primary",
    brandDot: "text-action-secondary",
    ring: "focus-visible:ring-brand-navy",
    ringOffset: "focus-visible:ring-offset-surface",
    navLink: "text-secondary hover:text-primary",
    panel: "border border-line-subtle bg-surface-raised shadow-2",
    divider: "border-line-subtle",
    sectionHeading: "text-action-secondary",
    item: "text-primary hover:bg-surface-hover focus:bg-surface-hover",
    mobileTrigger: "text-secondary hover:bg-surface-hover hover:text-primary",
    mobilePanel: "border-t border-line-subtle bg-surface",
    mobileToggle: "text-primary",
    skeleton: "bg-surface-hover",
    workspaceBtn: "border border-line bg-surface text-primary hover:bg-surface-hover",
    signIn: "text-secondary hover:text-primary",
    cta: "bg-action text-on-action hover:bg-action-hover",
    avatar: "bg-action text-on-action",
    avatarBtn: "hover:bg-surface-hover",
    text: "text-primary",
    muted: "text-secondary",
    planBadge: "bg-surface-sunken text-secondary border border-line-subtle",
    accentLink: "text-action",
};

const NAV_THEMES: Readonly<Record<NavVariant, NavTheme>> = {
  /** @deprecated G26 — renders the light skin. */
  dark: LIGHT_NAV_THEME,
  light: LIGHT_NAV_THEME,
};

const NavThemeContext = createContext<NavTheme>(NAV_THEMES.light);

function useNavTheme(): NavTheme {
  return useContext(NavThemeContext);
}

/** Exported for the colocated test — the skin table is a contract, not styling trivia. */
export const NAV_VARIANT_CLASSES = NAV_THEMES;

// ---------------------------------------------------------------------------
// Menu model
// ---------------------------------------------------------------------------

interface MenuItem {
  href: string;
  label: string;
}

export interface MenuGroupSection {
  heading: string;
  items: MenuItem[];
}

export interface MenuGroup {
  kind: "group";
  key: string;
  label: string;
  width: "w-56" | "w-64" | "w-80";
  items: MenuItem[];
  /**
   * Optional sub-heading structure. When present, `items` is ignored for
   * rendering and each `sections[].items` is rendered under a sub-heading
   * label. Used by the Free tools dropdown to group its eight tools by
   * journey stage (Idea / Cap Table / Fundraise & AU compliance) with a
   * final "All 16 tools →" row, without inflating the primary nav.
   */
  sections?: MenuGroupSection[];
}

export interface MenuLink {
  kind: "link";
  key: string;
  label: string;
  href: string;
}

export type MenuEntry = MenuGroup | MenuLink;

/**
 * The site's one primary navigation. Until G13-W5-IA5 a second bar
 * (site/navbar.tsx, ~50 app and docs pages) derived its items from this
 * list; that bar is gone and every public page mounts NavV2 itself, so the
 * menu cannot drift again.
 *
 * G21 P0-B (2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § P0-B):
 * SEVEN plain links, no dropdown — Product · For Programs · For Investors ·
 * For Founders · Methodology · Startup Index · Pricing — read the way a
 * program lead reads the site: what it is, whether it is for them (three
 * personas by name, no menu to open), how the score is made, the public
 * index, what it costs. The G17 Solutions dropdown, Samples and Docs left
 * the bar; the footer (`marketing/footer-columns.ts`) keeps Samples, Docs,
 * the advisor landing and everything else that used to hang off it. Every
 * href here resolves to a page on disk (the colocated test walks src/app);
 * the top level is pinned at seven by tests/e2e/nav/menu-structure.spec.ts.
 * "Startup Index" links the public index page (F-5: swap the href for
 * startupvalueindex.com in one line if the founder prefers).
 */
export const MENU: MenuEntry[] = [
  { kind: "link", key: "product", label: "Product", href: "/product" },
  { kind: "link", key: "programs", label: "For Programs", href: "/solutions/accelerator" },
  { kind: "link", key: "investors", label: "For Investors", href: "/solutions/investor" },
  { kind: "link", key: "founders", label: "For Founders", href: "/solutions/founder" },
  { kind: "link", key: "methodology", label: "Methodology", href: "/methodology" },
  { kind: "link", key: "startup-index", label: "Startup Index", href: "/startup-index" },
  { kind: "link", key: "pricing", label: "Pricing", href: "/pricing" },
];

/**
 * Primary CTA (G21 P0-B; G25 2026-09-21). "Start a cohort" → the Cohort 25
 * annual trial sign-up (lib/marketing/start-cohort) — the sold ladder the
 * whole site now points at; the paid pilot it used to sell is retired.
 * Replaces "Score a startup" → /analyze (G17 D1/D4), which stays the hero's
 * secondary CTA and the omnibox hand-off. The click is reported as
 * `cta_clicked { cta_id: "start_cohort", location }`.
 */
export const PRIMARY_CTA = {
  label: START_COHORT_LABEL,
  href: START_COHORT_HREF,
  ctaId: START_COHORT_CTA_ID,
} as const;

/** @deprecated G17 — kept as an alias for one release so nothing that imported it breaks; use PRIMARY_CTA. */
export const NEED_MONEY_CTA = PRIMARY_CTA;

/** Signed-in replacement for the Sign in / money pair. */
export const WORKSPACE_LINK = { label: "My workspace", href: "/dashboard" } as const;

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
  const t = useNavTheme();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const panelId = useId();

  // When the menu opens via keyboard, focus the first item. On mouse-open
  // (hover) we keep focus on the trigger so the cursor drives selection.
  // A ref rather than state: the flag only steers the focus side effect and
  // must not schedule a second render (react-hooks/set-state-in-effect).
  const openedByKeyboardRef = useRef(false);
  useEffect(() => {
    if (isOpen && openedByKeyboardRef.current) {
      itemRefs.current[0]?.focus();
      openedByKeyboardRef.current = false;
    }
  }, [isOpen]);

  const handleTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openedByKeyboardRef.current = true;
        onOpen();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        openedByKeyboardRef.current = true;
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

  // Open only. Hover opens this panel after an intent delay, so a click that
  // lands after the delay used to toggle it shut — and one that landed before
  // opened it. Whether clicking "Demo" showed or hid the menu depended on how
  // fast the mouse arrived. Closing is mouseleave, click-outside and Escape.
  const handleTriggerClick = useCallback(() => {
    if (!isOpen) onOpen();
  }, [isOpen, onOpen]);

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
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${t.navLink} ${t.ring}`}
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
          className={`absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-xl p-2 ${t.panel} ${group.width} nav-v2-panel-enter`}
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
                      className={sIdx > 0 ? `mt-1 border-t pt-1 ${t.divider}` : ""}
                    >
                      <p className={`px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.sectionHeading}`}>
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
                                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 ${t.item} ${t.ring}`}
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
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 ${t.item} ${t.ring}`}
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
  const t = useNavTheme();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 min-h-11 text-sm font-medium focus:outline-none focus-visible:ring-2 ${t.mobileTrigger} ${t.ring}`}
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
                <p className={`px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.sectionHeading}`}>
                  {section.heading}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <li key={item.href} role="none">
                      <Link
                        role="menuitem"
                        href={item.href}
                        onClick={onLinkActivate}
                        className={`block rounded-md px-3 py-2.5 min-h-11 text-sm focus:outline-none focus-visible:ring-2 ${t.item} ${t.ring}`}
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
                  className={`block rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 ${t.item} ${t.ring}`}
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
// Signed-in user menu — rows from lib/nav/user-menu.ts (shared with the
// workspace avatar menu, G13-W5-IA5); this file only maps icons and styles.
// ---------------------------------------------------------------------------

const USER_MENU_ICONS: Readonly<Record<UserMenuIcon, typeof BarChart3>> = {
  "new-analysis": BarChart3,
  score: TrendingUp,
  reports: FileText,
  dashboard: LayoutDashboard,
  billing: CreditCard,
  settings: Settings2,
};

function UserMenu({ user }: { user: AuthUser }) {
  const t = useNavTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const items = userMenuItems(user.persona);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shortName = userShortName(user);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 ${t.avatarBtn} ${t.ring}`}
      >
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${t.avatar}`}>
          {userInitials(user)}
        </span>
        <span className={`hidden max-w-[120px] truncate text-sm font-medium lg:block ${t.text}`}>
          {shortName}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${t.muted} ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label="Account"
          data-testid="nav-v2-user-menu"
          className={`absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl ${t.panel} nav-v2-panel-enter`}
        >
          <div className={`border-b px-4 py-3 ${t.divider}`}>
            <p className={`truncate text-sm font-medium ${t.text}`}>{shortName}</p>
            <p className={`truncate text-xs ${t.muted}`}>{user.email}</p>
            {user.plan && user.plan !== "free" && (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${t.planBadge}`}>
                {user.plan}
              </span>
            )}
          </div>
          <div className={`flex items-center justify-between border-b px-4 py-2 ${t.divider}`}>
            <span className={`text-xs ${t.muted}`}>Credits</span>
            <Link
              href="/workspace/billing"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`text-xs font-semibold hover:underline ${t.accentLink}`}
            >
              View billing →
            </Link>
          </div>
          <ul className="py-1">
            {items.map(({ key, href, label, icon }) => {
              const Icon = USER_MENU_ICONS[icon];
              return (
                <li key={key} role="none">
                  <Link
                    href={href}
                    role="menuitem"
                    data-user-menu-item={key}
                    onClick={() => {
                      trackEvent("nav_click", { group: "user-menu", item: label, href, persona: user.persona ?? "founder", phase: 0 });
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-4 py-2.5 text-sm focus:outline-none ${t.item}`}
                  >
                    <Icon className={`h-4 w-4 ${t.muted}`} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
            <li role="none">
              <LogoutButton className={`flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-sm focus:outline-none ${t.item}`}>
                <LogOut className={`h-4 w-4 ${t.muted}`} aria-hidden="true" />
                {USER_MENU_SIGN_OUT_LABEL}
              </LogoutButton>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level NavV2
// ---------------------------------------------------------------------------

function trackPrimaryCta(location: "nav" | "nav_mobile") {
  trackEvent("cta_clicked", { cta_id: PRIMARY_CTA.ctaId, location });
}

export interface NavV2Props {
  /** @deprecated G26 — the bar is light everywhere; the prop is ignored. */
  variant?: NavVariant;
}

export function NavV2(props: NavV2Props = {}) {
  void props.variant; // deprecated since G26 — the bar is light everywhere
  const t = NAV_THEMES.light;
  const [mobileOpen, setMobileOpen] = useState(false);
  // undefined = resolving (skeleton), null = signed out, object = signed in.
  const user = useAuthUser();
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

  const handleLinkActivate = useCallback(() => {
    closeImmediately();
    setMobileOpen(false);
  }, [closeImmediately]);

  // S8-B: Escape closes the mobile sheet and puts focus back on the toggle
  // (the desktop dropdowns already do this through their own handlers).
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileOpen(false);
      mobileToggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <NavThemeContext.Provider value={t}>
    <header
      ref={navRef}
      // G26: always the light island. Scoping `data-theme="light"` pins the
      // semantic tokens to the light ramp even when a legacy dark wrapper
      // still surrounds the page.
      data-theme="light"
      data-nav-variant="light"
      className={`sticky top-0 z-50 ${t.header}`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 xl:max-w-[92rem]"
      >
        <Link
          href="/"
          aria-label="BlockID.au — home"
          className={`flex items-center gap-2.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${t.ring} ${t.ringOffset}`}
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
          <span className={`flex items-baseline gap-1 text-base font-semibold ${t.brandWord}`}>
            BlockID<span className={t.brandDot}>.au</span>
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 xl:flex">
          {MENU.map((entry) => {
            if (entry.kind === "link") {
              return (
                <li key={entry.key}>
                  <Link
                    href={entry.href}
                    onClick={() => closeImmediately()}
                    className={`whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${t.navLink} ${t.ring}`}
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

        {/* Desktop CTAs — auth-aware. The header is rendered on static
            pages, so auth state arrives client-side via /api/auth/me; a
            neutral skeleton holds the width until it resolves. */}
        <div className="hidden items-center gap-3 xl:flex">
          <LocaleSwitcher />
          {user === undefined ? (
            <div
              className={`h-10 w-48 animate-pulse rounded-lg ${t.skeleton}`}
              aria-hidden="true"
              data-testid="nav-v2-auth-skeleton"
            />
          ) : user ? (
            <>
              <Link
                href={WORKSPACE_LINK.href}
                className={`whitespace-nowrap inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${t.workspaceBtn} ${t.ring}`}
              >
                {WORKSPACE_LINK.label}
              </Link>
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${t.signIn} ${t.ring}`}
              >
                Sign in
              </Link>
              <Link
                href={PRIMARY_CTA.href}
                data-cta-id={PRIMARY_CTA.ctaId}
                onClick={() => trackPrimaryCta("nav")}
                className={`whitespace-nowrap inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${t.cta} ${t.ring} ${t.ringOffset}`}
              >
                {PRIMARY_CTA.label}
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          ref={mobileToggleRef}
          type="button"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg xl:hidden focus:outline-none focus-visible:ring-2 ${t.mobileToggle} ${t.ring}`}
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
        <nav
          id="nav-v2-mobile-menu"
          aria-label="Mobile"
          className={`max-h-[calc(100dvh-4rem)] overflow-y-auto px-4 pb-4 pt-2 xl:hidden ${t.mobilePanel}`}
        >
          <ul className="flex flex-col gap-1">
            {MENU.map((entry) =>
              entry.kind === "link" ? (
                <li key={entry.key}>
                  <Link
                    href={entry.href}
                    onClick={() => handleLinkActivate()}
                    className={`block rounded-md px-3 py-2.5 min-h-11 text-sm font-medium focus:outline-none focus-visible:ring-2 ${t.mobileTrigger} ${t.ring}`}
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
          <div className={`mt-3 flex flex-col gap-2 border-t pt-3 ${t.divider}`}>
            {/* Language lived only in the desktop CTA row until the nav
                breakpoint moved up (xl, now lg since G17), which would have taken EN/VI away
                from every screen below that. */}
            <div className="flex justify-start pb-1">
              <LocaleSwitcher />
            </div>
            {user ? (
              <>
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.avatar}`}>
                    {userInitials(user)}
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${t.text}`}>{userShortName(user)}</p>
                    <p className={`truncate text-xs ${t.muted}`}>{user.email}</p>
                  </div>
                </div>
                <Link
                  href={WORKSPACE_LINK.href}
                  onClick={() => handleLinkActivate()}
                  className={`inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 ${t.cta} ${t.ring}`}
                >
                  {WORKSPACE_LINK.label}
                </Link>
                {/* The same rows as the desktop avatar menu (lib/nav/user-menu.ts). */}
                <ul className="flex flex-col gap-0.5">
                  {userMenuItems(user.persona).map(({ key, href, label, icon }) => {
                    const Icon = USER_MENU_ICONS[icon];
                    return (
                      <li key={key}>
                        <Link
                          href={href}
                          data-user-menu-item={key}
                          onClick={() => handleLinkActivate()}
                          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 ${t.item} ${t.ring}`}
                        >
                          <Icon className={`h-4 w-4 ${t.muted}`} aria-hidden="true" />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <LogoutButton className={`rounded-lg px-3 py-2.5 text-center text-sm font-medium focus:outline-none focus-visible:ring-2 ${t.signIn} ${t.ring}`}>
                  {USER_MENU_SIGN_OUT_LABEL}
                </LogoutButton>
              </>
            ) : (
              <>
                <Link
                  href={PRIMARY_CTA.href}
                  data-cta-id={PRIMARY_CTA.ctaId}
                  onClick={() => {
                    trackPrimaryCta("nav_mobile");
                    handleLinkActivate();
                  }}
                  className={`inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 ${t.cta} ${t.ring}`}
                >
                  {PRIMARY_CTA.label}
                </Link>
                <Link
                  href="/auth/login"
                  onClick={() => handleLinkActivate()}
                  className={`rounded-lg px-3 py-2.5 text-center text-sm font-medium focus:outline-none focus-visible:ring-2 ${t.signIn} ${t.ring}`}
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
    </NavThemeContext.Provider>
  );
}

export default NavV2;
