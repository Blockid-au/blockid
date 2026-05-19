// Anthropic client factory — uses Claude CLI OAuth token when available,
// falls back to ANTHROPIC_API_KEY env var.
//
// Claude CLI stores OAuth credentials at ~/.claude/.credentials.json.
// This avoids needing a separate API key for server-side AI calls.

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

interface OAuthCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
  organizationUuid?: string;
}

let cachedClient: Anthropic | null = null;
let cachedExpiresAt = 0;

function readCliOAuthToken(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const credPath = path.join(home, ".claude", ".credentials.json");
    const raw = fs.readFileSync(credPath, "utf-8");
    const creds: OAuthCredentials = JSON.parse(raw);

    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) return null;

    // Check expiry (with 5 min buffer)
    if (oauth.expiresAt && Date.now() > oauth.expiresAt - 5 * 60 * 1000) {
      console.warn("[anthropic] OAuth token expired, falling back to API key");
      return null;
    }

    return oauth.accessToken;
  } catch {
    return null;
  }
}

export function getAnthropicClient(): Anthropic {
  // If cached client is still valid, reuse it
  if (cachedClient && cachedExpiresAt > Date.now()) {
    return cachedClient;
  }

  // Try Claude CLI OAuth token first
  const oauthToken = readCliOAuthToken();
  if (oauthToken) {
    cachedClient = new Anthropic({
      apiKey: oauthToken,
      authToken: oauthToken,
    });
    // Cache for 30 minutes
    cachedExpiresAt = Date.now() + 30 * 60 * 1000;
    return cachedClient;
  }

  // Fallback to API key
  if (process.env.ANTHROPIC_API_KEY) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    cachedExpiresAt = Date.now() + 60 * 60 * 1000;
    return cachedClient;
  }

  throw new Error("No Anthropic credentials available. Install Claude CLI or set ANTHROPIC_API_KEY.");
}

export function isAnthropicConfigured(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  return readCliOAuthToken() !== null;
}
