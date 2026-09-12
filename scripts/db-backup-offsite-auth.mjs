#!/usr/bin/env node
// One-time founder consent for scripts/db-backup-offsite.mjs auth mode A.
//
//   node --env-file=web/.env scripts/db-backup-offsite-auth.mjs
//
// 1. Prints a Google consent URL (scope: drive, offline access) using the
//    existing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET web client and its
//    already-registered redirect https://blockid.au/api/integrations/ga4/callback.
// 2. Sign in as admin@blockid.au (the owner of the "BlockID Evidence Vault"
//    folder). The browser lands on the ga4 callback (which will show an error
//    about state — that is expected); copy the FULL URL from the address bar.
// 3. Paste it here. The script exchanges the code and prints ONE env line:
//        GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=...
//    Add it to web/.env (never commit), then run the offsite script.
//
// The refresh token is printed to the terminal only — never logged or stored
// by this script.

import { createRequire } from "node:module";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const require = createRequire("/home/dovanlong/blockid.au/web/package.json");
const { google } = require("googleapis");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT ?? "https://blockid.au/api/integrations/ga4/callback";
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — run with --env-file=web/.env");
  process.exit(2);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive"],
  login_hint: "admin@blockid.au",
});
console.log("\n1) Open this URL, sign in as admin@blockid.au and approve:\n\n" + url + "\n");
console.log("2) After approval the browser shows the blockid.au ga4 callback (an error page is expected).");
const rl = readline.createInterface({ input: stdin, output: stdout });
const pasted = (await rl.question("3) Paste the FULL redirected URL (or just the code=...) here: ")).trim();
rl.close();
let code = pasted;
try { code = new URL(pasted).searchParams.get("code") ?? pasted; } catch { /* raw code */ }
const { tokens } = await oauth2.getToken(code);
if (!tokens.refresh_token) {
  console.error("No refresh_token returned — revoke the app at https://myaccount.google.com/permissions and retry (prompt=consent is required).");
  process.exit(1);
}
oauth2.setCredentials(tokens);
const me = await google.drive({ version: "v3", auth: oauth2 }).about.get({ fields: "user(emailAddress)" });
console.log(`\nAuthorised as ${me.data.user?.emailAddress}. Add this line to web/.env (do NOT commit):\n`);
console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
console.log("Then: node --env-file=web/.env scripts/db-backup-offsite.mjs");
