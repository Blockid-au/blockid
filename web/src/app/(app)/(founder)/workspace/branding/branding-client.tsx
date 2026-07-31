"use client";

import * as React from "react";
import {
  Check,
  Crown,
  Loader2,
  Palette,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface BrandSettings {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  reportHeader: string;
  footerText: string;
}

const DEFAULT_SETTINGS: BrandSettings = {
  logoUrl: null,
  primaryColor: "#2563eb",
  accentColor: "#f59e0b",
  reportHeader: "",
  footerText: "",
};

const PRESET_PALETTES = [
  { name: "BlockID Blue", primary: "#2563eb", accent: "#f59e0b" },
  { name: "Deep Navy", primary: "#1e3a8a", accent: "#06b6d4" },
  { name: "Emerald", primary: "#059669", accent: "#f59e0b" },
  { name: "Slate", primary: "#475569", accent: "#8b5cf6" },
  { name: "Rose", primary: "#e11d48", accent: "#f97316" },
];

interface BrandingClientProps {
  isPro: boolean;
}

export function BrandingClient({ isPro }: BrandingClientProps) {
  const [settings, setSettings] = React.useState<BrandSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branding");
        if (!res.ok) return;
        const json = await res.json();
        if (json.ok && json.settings) setSettings(json.settings);
      } catch {
        // ignore
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(json.error ?? "Failed to save");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (!isPro) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <Crown
          strokeWidth={1.5}
          className="h-10 w-10 text-amber-500 mx-auto mb-3"
        />
        <h3 className="font-bold text-ink-800 mb-2">
          Custom Branding — Growth Plan
        </h3>
        <p className="text-sm text-ink-600 mb-5 max-w-sm mx-auto">
          Add your logo, brand colours, and custom report headers. Available on
          the Growth plan and above.
        </p>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          Upgrade to Growth
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Logo */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-800 mb-1 flex items-center gap-2">
          <Upload className="h-4 w-4 text-brand-500" />
          Company Logo
        </h2>
        <p className="text-xs text-ink-500 mb-4">
          Shown on SVI reports, data room, and investor share pages. PNG or SVG,
          max 2 MB.
        </p>
        <div className="flex items-center gap-4">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt="Company logo"
              className="h-14 w-auto rounded-lg border border-surface-200 object-contain bg-white p-1"
            />
          ) : (
            <div className="h-14 w-32 rounded-lg border-2 border-dashed border-surface-300 flex items-center justify-center text-ink-300 text-xs">
              No logo
            </div>
          )}
          <label className="cursor-pointer rounded-xl border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors">
            Upload logo
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  setSettings((prev) => ({
                    ...prev,
                    logoUrl: ev.target?.result as string,
                  }));
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {settings.logoUrl && (
            <button
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, logoUrl: null }))}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Colour palettes */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-800 mb-1 flex items-center gap-2">
          <Palette className="h-4 w-4 text-brand-500" />
          Brand Colours
        </h2>
        <p className="text-xs text-ink-500 mb-4">
          Applied to report headings, charts, and accent elements.
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_PALETTES.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  primaryColor: p.primary,
                  accentColor: p.accent,
                }))
              }
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all",
                settings.primaryColor === p.primary
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-surface-200 bg-white text-ink-600 hover:border-surface-300",
              )}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-white/50"
                style={{ background: p.primary }}
              />
              {p.name}
            </button>
          ))}
        </div>

        {/* Custom pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1.5">
              Primary colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.primaryColor}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    primaryColor: e.target.value,
                  }))
                }
                className="h-9 w-9 cursor-pointer rounded-lg border border-surface-200"
              />
              <input
                type="text"
                value={settings.primaryColor}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    primaryColor: e.target.value,
                  }))
                }
                className="flex-1 rounded-lg border border-surface-200 px-3 py-2 text-xs font-mono text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
                placeholder="#2563eb"
                maxLength={7}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1.5">
              Accent colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    accentColor: e.target.value,
                  }))
                }
                className="h-9 w-9 cursor-pointer rounded-lg border border-surface-200"
              />
              <input
                type="text"
                value={settings.accentColor}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    accentColor: e.target.value,
                  }))
                }
                className="flex-1 rounded-lg border border-surface-200 px-3 py-2 text-xs font-mono text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
                placeholder="#f59e0b"
                maxLength={7}
              />
            </div>
          </div>
        </div>

        {/* Preview swatch */}
        <div
          className="mt-4 rounded-xl p-4 text-white text-xs font-medium"
          style={{ background: settings.primaryColor }}
        >
          Report header preview
          <span
            className="ml-2 rounded px-1.5 py-0.5 text-white text-xs"
            style={{ background: settings.accentColor }}
          >
            Score: 78
          </span>
        </div>
      </div>

      {/* Report text */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-800 mb-4">
          Report Customisation
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1.5">
              Report header tagline (optional)
            </label>
            <input
              type="text"
              value={settings.reportHeader}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  reportHeader: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-surface-200 px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="e.g. Powered by Acme Capital Partners"
              maxLength={80}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1.5">
              Report footer text (optional)
            </label>
            <input
              type="text"
              value={settings.footerText}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  footerText: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-surface-200 px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="e.g. Confidential — prepared for XYZ Ventures"
              maxLength={120}
            />
          </div>
        </div>
      </div>

      {/* Save */}
      {error && (
        <p className="text-sm text-red-600 rounded-xl bg-red-50 px-4 py-2.5">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <>
            <Check className="h-4 w-4" />
            Saved!
          </>
        ) : (
          "Save Brand Settings"
        )}
      </button>
    </div>
  );
}
