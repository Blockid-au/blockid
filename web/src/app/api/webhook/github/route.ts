// POST /api/webhook/github — GitHub webhook receiver
//
// Triggers:
//   1. push to master → auto pull + deploy-live.sh
//   2. pull_request opened → log for tracking
//
// Security: HMAC-SHA256 signature verification (X-Hub-Signature-256)
// Setup: GitHub repo → Settings → Webhooks → Payload URL: https://blockid.au/api/webhook/github

import { NextResponse } from "next/server";
import * as crypto from "crypto";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? process.env.CRON_SECRET ?? "";
const WEB_DIR = "/home/dovanlong/blockid.au/web";
const DEPLOY_LOG = `${WEB_DIR}/content/reports/deploy-log.jsonl`;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function logEvent(event: string, detail: string): void {
  try {
    const fs = require("fs");
    const entry = JSON.stringify({ ts: new Date().toISOString(), event, detail, source: "github-webhook" });
    fs.appendFileSync(DEPLOY_LOG, entry + "\n");
  } catch { /* non-critical */ }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event") ?? "unknown";

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Push to master → auto deploy
  if (event === "push" && payload.ref === "refs/heads/master") {
    const commits = (payload.commits ?? []).length;
    const pusher = payload.pusher?.name ?? "unknown";
    const headMsg = payload.head_commit?.message?.split("\n")[0] ?? "";

    logEvent("github-push-master", `${pusher}: ${headMsg} (${commits} commits)`);

    // Run deploy in background (non-blocking)
    const cp = require("child_process");
    const note = `GitHub push by ${pusher}: ${headMsg}`.slice(0, 120);
    cp.spawn("bash", ["-c", `cd ${WEB_DIR} && git pull github master --ff-only && DEPLOY_NOTE="${note.replace(/"/g, '\\"')}" bash scripts/deploy-live.sh`], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: process.env.PATH },
    }).unref();

    return NextResponse.json({
      ok: true,
      action: "deploy-triggered",
      commits,
      pusher,
      message: headMsg,
    });
  }

  // PR opened/merged → log only
  if (event === "pull_request") {
    const action = payload.action;
    const pr = payload.pull_request;
    const title = pr?.title ?? "";
    const number = pr?.number ?? 0;
    const merged = pr?.merged === true;

    logEvent(`github-pr-${action}`, `#${number}: ${title}${merged ? " (MERGED)" : ""}`);

    return NextResponse.json({
      ok: true,
      action: `pr-${action}`,
      number,
      title,
      merged,
    });
  }

  // Other events → acknowledge
  logEvent(`github-${event}`, JSON.stringify(payload).slice(0, 200));
  return NextResponse.json({ ok: true, event, action: "logged" });
}
