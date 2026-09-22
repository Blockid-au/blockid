"use client";

/** Legacy key retained only for the scoped light-only preference migration. */
export const THEME_STORAGE_KEY = "blockid_theme";

/** Compatibility API: previous callers cannot re-enable the retired dark mode. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve legacy boolean call sites; both choices now resolve to light.
export function applyExplicitTheme(_dark: boolean): void {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.setAttribute("data-theme", "light");
  root.style.colorScheme = "light";
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.setItem("blockid_theme_version", "light-v1");
  } catch {
    // Unavailable storage never prevents a readable light document.
  }
}

/** G30 light-only: retain import compatibility without offering a dark action. */
export function ThemeToggle() {
  return null;
}
