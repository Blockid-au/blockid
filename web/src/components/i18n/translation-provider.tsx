"use client";

/**
 * TranslationProvider — client-side DOM walker that translates every
 * user-visible text node on the page into the active locale (T-1403).
 *
 * Design rationale
 * ----------------
 * BlockID has 255 page files and 233 components. Building a mirror
 * `/vi/*` route tree would take weeks and drift the moment anyone edits
 * an EN page. Instead we ship EN as the canonical DOM and translate at
 * runtime — the same approach Google Website Translator used to take.
 *
 * The walker:
 *   1. Collects text nodes under `document.body`, skipping <script>,
 *      <style>, `[data-i18n-skip]`, and nodes that fail the same
 *      `shouldTranslate` filter used server-side (numbers, URLs, etc.).
 *   2. Batches the unique English strings into POST /api/i18n/translate
 *      (max 200 per batch).
 *   3. Rewrites each node's `nodeValue` in place. Original EN is
 *      preserved on `dataset.i18nOrig` on the parent element so we
 *      can restore on locale switch back to EN without a page reload.
 *   4. A MutationObserver re-runs on any subtree mutation — this
 *      catches React re-renders, hydration, route transitions, and
 *      dynamic content (agent reports streamed in, toasts, modals).
 *
 * Placeholder pre-swap: before the API returns, we pre-swap the node
 * from any hand-authored VI catalog match (`SEED_CATALOG`) so the
 * common nav/hero strings never flash EN. The catalog is thin — just
 * the seed keys that are already in `messages/vi.json`.
 *
 * Guardrails:
 *   - Nodes inside `<code>`, `<pre>`, `<kbd>`, `<samp>` are skipped —
 *     these are almost always code samples or shortcut labels.
 *   - Anything inside `[contenteditable]` is skipped so we don't
 *     rewrite a user's own text mid-typing.
 *   - Reserved AU legal terms are enforced server-side; the walker
 *     just consumes whatever the server returns.
 *
 * The provider renders no visible UI — it mounts an effect and returns
 * its children unchanged.
 */

import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

type SeedCatalog = Readonly<Record<string, string>>;

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "TEXTAREA",
  "INPUT",
  "OPTION",
  "SELECT",
]);

const BATCH_SIZE = 150;
const DEBOUNCE_MS = 120;
const MIN_LEN = 2;
const MAX_LEN = 4000;

function clientShouldTranslate(s: string): boolean {
  const t = s.trim();
  if (t.length < MIN_LEN || t.length > MAX_LEN) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^[\d\s.,+\-*/=()%$€£¥₫]+$/.test(t)) return false;
  return true;
}

function isTranslatableNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest("[data-i18n-skip]")) return false;
  if (parent.closest("[contenteditable=\"true\"]")) return false;
  return clientShouldTranslate(node.nodeValue ?? "");
}

function collectTextNodes(root: Node, out: Text[]): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType !== Node.TEXT_NODE) return NodeFilter.FILTER_SKIP;
      const text = n as Text;
      if (!isTranslatableNode(text)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
}

export interface TranslationProviderProps {
  locale: Locale;
  /** Seed catalog: strings already translated at build time. */
  seed?: SeedCatalog;
  children: React.ReactNode;
}

export function TranslationProvider({
  locale,
  seed,
  children,
}: TranslationProviderProps): React.ReactElement {
  const localeRef = useRef<Locale>(locale);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<Promise<void> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localeRef.current = locale;
    if (seed) {
      for (const [en, vi] of Object.entries(seed)) {
        cacheRef.current.set(en, vi);
      }
    }
  }, [locale, seed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (locale === DEFAULT_LOCALE) {
      // Restore any previously-swapped nodes to their original EN text.
      const swapped = document.querySelectorAll<HTMLElement>("[data-i18n-orig]");
      for (const el of Array.from(swapped)) {
        const orig = el.dataset.i18nOrig;
        if (typeof orig === "string" && el.firstChild?.nodeType === Node.TEXT_NODE) {
          (el.firstChild as Text).nodeValue = orig;
        }
        delete el.dataset.i18nOrig;
      }
      return;
    }

    const scan = (root: Node) => {
      const nodes: Text[] = [];
      collectTextNodes(root, nodes);
      if (nodes.length === 0) return;
      for (const node of nodes) {
        const en = (node.nodeValue ?? "").trim();
        if (!en) continue;
        const cached = cacheRef.current.get(en);
        if (cached) {
          swapNode(node, cached);
          continue;
        }
        pendingRef.current.add(en);
      }
      if (pendingRef.current.size > 0) scheduleFlush();
    };

    const swapNode = (node: Text, translated: string) => {
      const original = node.nodeValue;
      if (typeof original !== "string") return;
      const preserveWs = leadingTrailingWs(original);
      if (node.nodeValue === translated) return;
      const parent = node.parentElement;
      if (parent && !parent.dataset.i18nOrig) {
        parent.dataset.i18nOrig = original;
      }
      node.nodeValue = `${preserveWs.leading}${translated}${preserveWs.trailing}`;
    };

    const flush = async () => {
      if (pendingRef.current.size === 0) return;
      const strings = Array.from(pendingRef.current).slice(0, BATCH_SIZE);
      for (const s of strings) pendingRef.current.delete(s);
      try {
        const res = await fetch("/api/i18n/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: localeRef.current, strings }),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          translations?: Record<string, string>;
        };
        const translations = data.translations ?? {};
        for (const [en, vi] of Object.entries(translations)) {
          cacheRef.current.set(en, vi);
        }
        applyCachedToDocument(Object.keys(translations));
      } catch {
        // Silent — leave EN visible; next mutation will retry.
      }
      if (pendingRef.current.size > 0) scheduleFlush();
    };

    const scheduleFlush = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        inflightRef.current = (inflightRef.current ?? Promise.resolve()).then(
          flush,
        );
      }, DEBOUNCE_MS);
    };

    const applyCachedToDocument = (keys: string[]) => {
      const wanted = new Set(keys);
      const nodes: Text[] = [];
      collectTextNodes(document.body, nodes);
      for (const node of nodes) {
        const en = (node.nodeValue ?? "").trim();
        if (!wanted.has(en)) continue;
        const vi = cacheRef.current.get(en);
        if (typeof vi === "string") swapNode(node, vi);
      }
    };

    // Initial scan after paint so hydration text lands first.
    const initialTimer = setTimeout(() => scan(document.body), 0);

    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") {
          for (const added of Array.from(r.addedNodes)) {
            if (added.nodeType === Node.ELEMENT_NODE || added.nodeType === Node.TEXT_NODE) {
              scan(added);
            }
          }
        } else if (r.type === "characterData") {
          const target = r.target;
          if (target.nodeType === Node.TEXT_NODE && isTranslatableNode(target as Text)) {
            scan(target);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      clearTimeout(initialTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      observer.disconnect();
    };
  }, [locale]);

  return <>{children}</>;
}

function leadingTrailingWs(s: string): { leading: string; trailing: string } {
  const leading = s.match(/^\s+/)?.[0] ?? "";
  const trailing = s.match(/\s+$/)?.[0] ?? "";
  return { leading, trailing };
}

export default TranslationProvider;
