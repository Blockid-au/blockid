import { afterEach, expect, it, vi } from "vitest";
import { applyExplicitTheme, ThemeToggle } from "./theme-toggle";

afterEach(() => vi.unstubAllGlobals());

it("legacy dark API requests normalize to light and the retired toggle renders no action", () => {
  const root = {
    classList: { remove: vi.fn() },
    setAttribute: vi.fn(),
    style: { colorScheme: "dark" },
  };
  const storage = { removeItem: vi.fn(), setItem: vi.fn() };
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("localStorage", storage);
  applyExplicitTheme(true);
  expect(root.classList.remove).toHaveBeenCalledWith("dark");
  expect(root.setAttribute).toHaveBeenCalledWith("data-theme", "light");
  expect(root.style.colorScheme).toBe("light");
  expect(storage.removeItem).toHaveBeenCalledWith("blockid_theme");
  expect(storage.setItem).toHaveBeenCalledWith("blockid_theme_version", "light-v1");
  expect(ThemeToggle()).toBeNull();
});
