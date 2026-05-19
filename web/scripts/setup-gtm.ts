/**
 * One-time script to set up GTM triggers + GA4 Event tags.
 *
 * Prerequisites:
 *   1. Grant the service account (blockid-drive@longcare-495115.iam.gserviceaccount.com)
 *      "Edit" access in GTM → Admin → Container → User Management.
 *   2. Enable Tag Manager API in GCP: https://console.cloud.google.com/apis/library/tagmanager.googleapis.com
 *
 * Run:
 *   npx tsx scripts/setup-gtm.ts
 */

import { google } from "googleapis";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(import.meta.dirname ?? ".", "../.env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found — rely on process.env */ }

// ── Config ──────────────────────────────────────────────────────────────────

const GTM_ACCOUNT_ID = "6291050476"; // from GTM URL: accounts/XXXXXXXXXX
const GTM_CONTAINER_ID = "222067988"; // from GTM URL: containers/XXXXXXXXX
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-7ZH4NZT60Q";

/** Events to create as GTM triggers + GA4 tags */
const EVENTS = [
  { event: "svi_analysis_complete", goal: "SVI Score Generated" },
  { event: "checkout_started", goal: "Checkout Initiated" },
  { event: "lead_form_submitted", goal: "Lead Captured" },
  { event: "founding50_submitted", goal: "Founding 50 Signup" },
  { event: "login_google_success", goal: "User Authenticated" },
  { event: "evidence_added", goal: "Evidence Uploaded" },
  { event: "investor_link_copied", goal: "Score Shared" },
] as const;

// ── Auth ────────────────────────────────────────────────────────────────────

function getAuth() {
  const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL or GOOGLE_DRIVE_PRIVATE_KEY in .env",
    );
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/tagmanager.edit.containers"],
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const auth = getAuth();
  const tagmanager = google.tagmanager({ version: "v2", auth });

  const parent = `accounts/${GTM_ACCOUNT_ID}/containers/${GTM_CONTAINER_ID}`;

  // 1. Get or create a workspace
  console.log("📦 Finding default workspace…");
  const { data: workspaces } = await tagmanager.accounts.containers.workspaces.list({ parent });
  let workspace = workspaces.workspace?.find((w) => w.name === "Default Workspace") ?? workspaces.workspace?.[0];

  if (!workspace) {
    console.log("   Creating workspace…");
    const { data } = await tagmanager.accounts.containers.workspaces.create({
      parent,
      requestBody: { name: "BlockID Analytics Setup", description: "Auto-configured GA4 event tags" },
    });
    workspace = data;
  }
  const wsPath = workspace.path!;
  console.log(`   Using workspace: ${workspace.name} (${wsPath})`);

  // 2. Check for existing GA4 config tag (measurement ID variable)
  //    We need a "GA4 Configuration" tag that all event tags reference.
  console.log("\n🔧 Setting up GA4 Configuration tag…");
  const { data: existingTags } = await tagmanager.accounts.containers.workspaces.tags.list({ parent: wsPath });
  let configTag = existingTags.tag?.find(
    (t) => t.type === "gaawc" && t.parameter?.some((p) => p.key === "measurementId" && p.value === GA_MEASUREMENT_ID),
  );

  if (!configTag) {
    const { data } = await tagmanager.accounts.containers.workspaces.tags.create({
      parent: wsPath,
      requestBody: {
        name: "GA4 Configuration",
        type: "gaawc", // GA4 Configuration tag type
        parameter: [
          { type: "template", key: "measurementId", value: GA_MEASUREMENT_ID },
          { type: "boolean", key: "sendPageView", value: "true" },
        ],
        firingTriggerId: ["2147479553"], // All Pages built-in trigger
      },
    });
    configTag = data;
    console.log(`   ✅ Created GA4 Configuration tag (ID: ${configTag.tagId})`);
  } else {
    console.log(`   ⏭️  GA4 Configuration tag already exists (ID: ${configTag.tagId})`);
  }

  // 3. Create triggers + event tags for each goal
  console.log("\n🎯 Creating triggers and GA4 Event tags…\n");

  for (const { event, goal } of EVENTS) {
    const triggerName = `Trigger — ${goal}`;
    const tagName = `GA4 Event — ${goal}`;

    // Check if trigger already exists
    const { data: existingTriggers } = await tagmanager.accounts.containers.workspaces.triggers.list({ parent: wsPath });
    let trigger = existingTriggers.trigger?.find((t) => t.name === triggerName);

    if (!trigger) {
      const { data } = await tagmanager.accounts.containers.workspaces.triggers.create({
        parent: wsPath,
        requestBody: {
          name: triggerName,
          type: "customEvent",
          customEventFilter: [
            {
              type: "equals",
              parameter: [
                { type: "template", key: "arg0", value: "{{_event}}" },
                { type: "template", key: "arg1", value: event },
              ],
            },
          ],
        },
      });
      trigger = data;
      console.log(`   ✅ Trigger: "${triggerName}" (event: ${event})`);
    } else {
      console.log(`   ⏭️  Trigger "${triggerName}" already exists`);
    }

    // Check if tag already exists
    const { data: latestTags } = await tagmanager.accounts.containers.workspaces.tags.list({ parent: wsPath });
    const existingTag = latestTags.tag?.find((t) => t.name === tagName);

    if (!existingTag) {
      await tagmanager.accounts.containers.workspaces.tags.create({
        parent: wsPath,
        requestBody: {
          name: tagName,
          type: "gaawe", // GA4 Event tag type
          parameter: [
            { type: "tagReference", key: "measurementId", value: configTag.name },
            { type: "template", key: "eventName", value: event },
            { type: "boolean", key: "sendEcommerceData", value: "false" },
          ],
          firingTriggerId: [trigger.triggerId!],
        },
      });
      console.log(`   ✅ Tag:     "${tagName}" → fires on "${triggerName}"`);
    } else {
      console.log(`   ⏭️  Tag "${tagName}" already exists`);
    }

    console.log("");
  }

  // 4. Create and publish a version
  console.log("📤 Creating container version…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: version } = await (tagmanager.accounts.containers.workspaces as any).create_version({
    path: wsPath,
    requestBody: {
      name: "BlockID GA4 Events Setup",
      notes: `Auto-configured ${EVENTS.length} GA4 event tags with triggers for BlockID.au analytics goals.`,
    },
  });

  const versionPath = version.containerVersion?.path;
  if (versionPath) {
    console.log(`   Created version: ${version.containerVersion?.name}`);
    console.log("\n🚀 Publishing version…");
    await tagmanager.accounts.containers.versions.publish({ path: versionPath });
    console.log("   ✅ Published! Changes are now live.");
  } else {
    console.log("   ⚠️  Version created but path not returned. Publish manually in GTM UI.");
  }

  console.log("\n✨ Done! All GA4 event goals are now configured in GTM.");
  console.log(`   Container: GTM-TRHH4MH2`);
  console.log(`   GA4 Property: ${GA_MEASUREMENT_ID}`);
  console.log(`   Events: ${EVENTS.map((e) => e.event).join(", ")}`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message ?? err);
  if (err.response?.data) {
    console.error("   API response:", JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
