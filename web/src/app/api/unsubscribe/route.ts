import { NextRequest } from "next/server";
import {
  unsubscribeByToken,
  unsubscribeCategoryByToken,
  updateEmailPreferences,
  getPreferencesByToken,
  type EmailCategory,
} from "@/lib/email-preferences";
import { sendFarewellEmail } from "@/lib/email";

const VALID_CATEGORIES: EmailCategory[] = [
  "weekly_reports",
  "product_updates",
  "promotions",
  "svi_alerts",
  "payment_receipts",
];

function isValidCategory(v: unknown): v is EmailCategory {
  return typeof v === "string" && VALID_CATEGORIES.includes(v as EmailCategory);
}

// GET: one-click unsubscribe from email link
// ?token=xxx           → unsubscribe all
// ?token=xxx&category= → unsubscribe specific category
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  const category = request.nextUrl.searchParams.get("category");

  if (category && isValidCategory(category)) {
    const result = await unsubscribeCategoryByToken(token, category);
    if (!result.ok) {
      return Response.json({ error: "Invalid token" }, { status: 404 });
    }
  } else {
    const result = await unsubscribeByToken(token);
    if (!result.ok) {
      return Response.json({ error: "Invalid token" }, { status: 404 });
    }
    // Send farewell email (fire-and-forget)
    const prefData = await getPreferencesByToken(token);
    if (prefData?.email) {
      void sendFarewellEmail({ to: prefData.email }).catch(() => {});
    }
  }

  // Redirect to the unsubscribe page for confirmation
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUrl = category
    ? `${base}/unsubscribe?token=${token}&category=${category}&done=1`
    : `${base}/unsubscribe?token=${token}&done=1`;

  return Response.redirect(redirectUrl, 302);
}

// POST: update specific preferences
// Body: { token, preferences: { weekly_reports: false, ... } }
export async function POST(request: NextRequest) {
  let body: { token?: string; preferences?: Record<string, boolean> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, preferences } = body;
  if (!token || typeof token !== "string") {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  // Verify token is valid
  const prefs = await getPreferencesByToken(token);
  if (!prefs) {
    return Response.json({ error: "Invalid token" }, { status: 404 });
  }

  if (!preferences || typeof preferences !== "object") {
    return Response.json({ error: "Missing preferences" }, { status: 400 });
  }

  // Filter to only valid keys
  const updates: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(preferences)) {
    if (
      (isValidCategory(key) || key === "unsubscribed_all") &&
      typeof val === "boolean"
    ) {
      updates[key] = val;
    }
  }

  await updateEmailPreferences(prefs.email, updates);

  // Send farewell email if user just unsubscribed from all
  if (updates.unsubscribed_all === true) {
    void sendFarewellEmail({ to: prefs.email }).catch(() => {});
  }

  return Response.json({ ok: true });
}
