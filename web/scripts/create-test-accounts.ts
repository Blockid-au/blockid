#!/usr/bin/env npx tsx
/**
 * Create test accounts for customer journey research.
 *
 * Usage: npx tsx scripts/create-test-accounts.ts
 *
 * Creates 8 test accounts with email+password auth,
 * each representing a different startup persona/stage.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const PASSWORD = "TestBlockID2026!";

const TEST_ACCOUNTS = [
  {
    email: "test-idea@blockid.au",
    displayName: "Alex Founder (Idea Stage)",
    description: "First-time founder with AI chatbot idea for restaurants",
  },
  {
    email: "test-mvp@blockid.au",
    displayName: "Sam DevTools (MVP Stage)",
    description: "Technical founder with developer tools SaaS MVP",
  },
  {
    email: "test-growth@blockid.au",
    displayName: "Jordan Analytics (Revenue)",
    description: "E-commerce analytics startup with growing revenue",
  },
  {
    email: "test-funded@blockid.au",
    displayName: "Taylor HealthTech (Series A)",
    description: "Funded HealthTech platform preparing Series A",
  },
  {
    email: "test-nontechnical@blockid.au",
    displayName: "Morgan Marketplace (Non-Tech)",
    description: "Non-technical founder with food delivery marketplace idea",
  },
  {
    email: "test-international@blockid.au",
    displayName: "Lee Fintech (Singapore)",
    description: "International founder building Fintech payments from Singapore",
  },
  {
    email: "test-accelerator@blockid.au",
    displayName: "Casey EdTech (Accelerator)",
    description: "Accelerator cohort member building EdTech platform",
  },
  {
    email: "test-returning@blockid.au",
    displayName: "Riley PropTech (Returning)",
    description: "Returning user with PropTech marketplace data",
  },
];

async function createAccount(account: typeof TEST_ACCOUNTS[0]) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: account.email,
        password: PASSWORD,
        displayName: account.displayName,
      }),
    });

    const data = await res.json();

    if (res.ok && data.ok) {
      console.log(`✅ ${account.email} — ${account.displayName}`);
      return true;
    }

    if (res.status === 409) {
      console.log(`⏭️  ${account.email} — Already exists (OK)`);
      return true;
    }

    console.log(`❌ ${account.email} — ${data.error ?? "Failed"}`);
    return false;
  } catch (err) {
    console.log(`❌ ${account.email} — Network error: ${err}`);
    return false;
  }
}

async function main() {
  console.log("🔧 Creating test accounts for BlockID.au customer journey research\n");
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Password: ${PASSWORD}\n`);

  let success = 0;
  for (const account of TEST_ACCOUNTS) {
    if (await createAccount(account)) success++;
  }

  console.log(`\n✅ ${success}/${TEST_ACCOUNTS.length} accounts ready`);
  console.log("\nTest personas:");
  TEST_ACCOUNTS.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.email} — ${a.description}`);
  });
  console.log(`\n  Password for all: ${PASSWORD}`);
  console.log(`  Login at: ${BASE_URL}/auth/login`);
}

main().catch(console.error);
