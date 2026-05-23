import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CODEX_DEVICE_AUTH, getCodexAuthStatus } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/codex-auth
 * Returns Codex OAuth status + device auth instructions.
 * Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = getCodexAuthStatus();

  return NextResponse.json({
    ok: true,
    ...status,
    deviceAuth: CODEX_DEVICE_AUTH,
    models: ["o3-mini", "gpt-4.1-mini", "gpt-4o-mini"],
    instructions: {
      cli: "npx codex-cli@latest auth login --device-auth",
      manual: [
        `1. POST ${CODEX_DEVICE_AUTH.deviceAuthUrl} with client_id=${CODEX_DEVICE_AUTH.clientId}&scope=${CODEX_DEVICE_AUTH.scopes}`,
        "2. Open the verification_uri in browser and enter the user_code",
        "3. Poll the token endpoint with device_code until authorized",
        "4. Save tokens to ~/.codex/auth.json",
      ],
    },
  });
}

/**
 * POST /api/admin/codex-auth
 * Initiates device authorization flow — returns verification URL + code.
 * Admin-only.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Step 1: Request device code from OpenAI
    const res = await fetch(CODEX_DEVICE_AUTH.deviceAuthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CODEX_DEVICE_AUTH.clientId,
        scope: CODEX_DEVICE_AUTH.scopes,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({
        ok: false,
        error: `OpenAI device auth failed (${res.status}): ${text}`,
      }, { status: 502 });
    }

    const data = await res.json();

    // data = { device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }
    return NextResponse.json({
      ok: true,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval ?? 5,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Device auth request failed",
    }, { status: 500 });
  }
}

/**
 * PUT /api/admin/codex-auth
 * Poll for token after user authorizes device. Saves to ~/.codex/auth.json.
 * Body: { deviceCode: string }
 */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { deviceCode?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.deviceCode) {
    return NextResponse.json({ error: "deviceCode is required" }, { status: 400 });
  }

  try {
    const res = await fetch(CODEX_DEVICE_AUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: body.deviceCode,
        client_id: CODEX_DEVICE_AUTH.clientId,
      }),
    });

    const data = await res.json();

    // Authorization pending — user hasn't entered code yet
    if (data.error === "authorization_pending") {
      return NextResponse.json({ ok: false, status: "pending", error: "Waiting for user to authorize..." });
    }

    // Slow down — polling too fast
    if (data.error === "slow_down") {
      return NextResponse.json({ ok: false, status: "slow_down", error: "Polling too fast, slow down" });
    }

    // Expired or denied
    if (data.error) {
      return NextResponse.json({ ok: false, status: "error", error: data.error_description ?? data.error });
    }

    // Success — save tokens to file
    if (data.access_token) {
      const fs = await import("fs");
      const path = await import("path");
      const home = process.env.HOME ?? "/root";
      const authDir = path.join(home, ".codex");
      const authPath = path.join(authDir, "auth.json");

      // Ensure directory exists
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const authData = {
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token ?? null,
          id_token: data.id_token ?? null,
          expires_in: data.expires_in ?? 3600,
          saved_at: new Date().toISOString(),
        },
      };

      const tmpPath = authPath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(authData, null, 2));
      fs.renameSync(tmpPath, authPath);

      return NextResponse.json({
        ok: true,
        status: "authorized",
        message: "Codex OAuth tokens saved successfully",
        models: ["o3-mini", "gpt-4.1-mini", "gpt-4o-mini"],
      });
    }

    return NextResponse.json({ ok: false, status: "unknown", error: "No access_token in response" });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Token exchange failed",
    }, { status: 500 });
  }
}
