/**
 * One-time script to set up GTM triggers + GA4 Event tags.
 *
 * Prerequisites:
 *   1. Enable Tag Manager API: https://console.developers.google.com/apis/api/tagmanager.googleapis.com/overview?project=990415480608
 *   2. Login as GTM owner:  gcloud auth login ceo@longcare.au
 *   3. Run:                 npx tsx scripts/setup-gtm.ts
 */

import { execSync } from "child_process";

// ── Config ──────────────────────────────────────────────────────────────────

const GA_MEASUREMENT_ID = "G-7ZH4NZT60Q";
const GTM_CONTAINER_ID = "GTM-TRHH4MH2";

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

const API = "https://tagmanager.googleapis.com/tagmanager/v2";

// ── Auth via gcloud ─────────────────────────────────────────────────────────

let cachedToken: string | null = null;

function getAccessToken(): string {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
    return cachedToken;
  } catch {
    console.error("❌ Run first: gcloud auth login ceo@longcare.au");
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(method: string, path: string, body?: any): Promise<any> {
  const token = getAccessToken();
  const url = `${API}/${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${method} ${path}: ${res.status} ${JSON.stringify(data.error?.message ?? data)}`);
  }
  return data;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔑 Using gcloud credentials…\n");

  // 1. Find the account + container
  console.log("📦 Finding GTM container…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = await api("GET", "accounts") as { account: any[] };
  if (!accounts.account?.length) throw new Error("No GTM accounts found for this user.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let container: any = null;
  let accountPath = "";

  // Fetch containers for all accounts in parallel
  const containerResults = await Promise.all(
    accounts.account.map(async (acct: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const containers = await api("GET", `${acct.path}/containers`) as { container: any[] };
      const found = containers.container?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => c.publicId === GTM_CONTAINER_ID,
      );
      return found ? { container: found, accountPath: acct.path } : null;
    }),
  );
  const match = containerResults.find(Boolean);
  if (match) {
    container = match.container;
    accountPath = match.accountPath;
  }

  if (!container) throw new Error(`Container ${GTM_CONTAINER_ID} not found.`);
  console.log(`   Found: "${container.name}" (${container.publicId}) in ${accountPath}`);

  // 2. Get or create workspace
  console.log("\n🗂️  Finding workspace…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaces = await api("GET", `${container.path}/workspaces`) as { workspace: any[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workspace: any = workspaces.workspace?.find((w: any) => w.name === "Default Workspace")
    ?? workspaces.workspace?.[0];

  if (!workspace) {
    workspace = await api("POST", `${container.path}/workspaces`, {
      name: "BlockID Analytics Setup",
      description: "Auto-configured GA4 event tags",
    });
  }
  console.log(`   Using: "${workspace.name}"`);

  // 3. Create GA4 Configuration tag
  console.log("\n🔧 Setting up GA4 Configuration tag…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingTags = await api("GET", `${workspace.path}/tags`) as { tag?: any[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let configTag = existingTags.tag?.find((t: any) =>
    t.type === "gaawc" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t.parameter?.some((p: any) => p.key === "measurementId" && p.value === GA_MEASUREMENT_ID),
  );

  if (!configTag) {
    configTag = await api("POST", `${workspace.path}/tags`, {
      name: "GA4 Configuration",
      type: "gaawc",
      parameter: [
        { type: "template", key: "measurementId", value: GA_MEASUREMENT_ID },
        { type: "boolean", key: "sendPageView", value: "true" },
      ],
      firingTriggerId: ["2147479553"], // All Pages built-in trigger
    });
    console.log(`   ✅ Created GA4 Configuration tag (ID: ${configTag.tagId})`);
  } else {
    console.log(`   ⏭️  Already exists (ID: ${configTag.tagId})`);
  }

  // 4. Create triggers + event tags
  console.log("\n🎯 Creating triggers and GA4 Event tags…\n");

  // Fetch triggers once before the loop; reuse tags already fetched at step 3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerList = await api("GET", `${workspace.path}/triggers`) as { trigger?: any[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knownTriggers: any[] = triggerList.trigger ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knownTags: any[] = [...(existingTags.tag ?? [])];
  // If we created a configTag above, it's already in knownTags only if we didn't re-fetch;
  // add it if missing
  if (configTag && !knownTags.some((t: any) => t.tagId === configTag.tagId)) {
    knownTags.push(configTag);
  }

  for (const { event, goal } of EVENTS) {
    const triggerName = `Trigger — ${goal}`;
    const tagName = `GA4 Event — ${goal}`;

    // Check existing triggers from cached list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let trigger = knownTriggers.find((t: any) => t.name === triggerName);

    if (!trigger) {
      trigger = await api("POST", `${workspace.path}/triggers`, {
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
      });
      knownTriggers.push(trigger); // Track locally
      console.log(`   ✅ Trigger: "${triggerName}" (event: ${event})`);
    } else {
      console.log(`   ⏭️  Trigger "${triggerName}" already exists`);
    }

    // Check existing tags from cached list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingTag = knownTags.find((t: any) => t.name === tagName);

    if (!existingTag) {
      const newTag = await api("POST", `${workspace.path}/tags`, {
        name: tagName,
        type: "gaawe", // GA4 Event
        parameter: [
          { type: "tagReference", key: "measurementId", value: configTag.name },
          { type: "template", key: "eventName", value: event },
          { type: "boolean", key: "sendEcommerceData", value: "false" },
        ],
        firingTriggerId: [trigger.triggerId],
      });
      knownTags.push(newTag); // Track locally
      console.log(`   ✅ Tag:     "${tagName}" → fires on "${triggerName}"`);
    } else {
      console.log(`   ⏭️  Tag "${tagName}" already exists`);
    }
    console.log("");
  }

  // 5. Create version and publish
  console.log("📤 Creating container version…");
  const version = await api("POST", `${workspace.path}:create_version`, {
    name: "BlockID GA4 Events Setup",
    notes: `Auto-configured ${EVENTS.length} GA4 event tags with triggers for BlockID.au analytics goals.`,
  });

  const versionPath = version.containerVersion?.path;
  if (versionPath) {
    console.log(`   Created version: ${version.containerVersion?.name}`);
    console.log("\n🚀 Publishing version…");
    await api("POST", `${versionPath}:publish`);
    console.log("   ✅ Published! Changes are now live.");
  } else {
    console.log("   ⚠️  Version created but could not auto-publish. Publish manually in GTM UI.");
  }

  console.log("\n✨ Done! All GA4 event goals are now configured in GTM.");
  console.log(`   Container: ${GTM_CONTAINER_ID}`);
  console.log(`   GA4 Property: ${GA_MEASUREMENT_ID}`);
  console.log(`   Events: ${EVENTS.map((e) => e.event).join(", ")}`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});
