// Shared library barrel exports
// All modules import from here instead of directly from lib/

// Database
export { getSupabaseAdmin, isSupabaseConfigured } from "../supabase";

// Authentication
export { getCurrentUser, type AppUser } from "../auth";
export { SESSION_COOKIE } from "../auth";

// Credits
export { canAfford, spendCredits, getBalance, formatCredits, FEATURE_COSTS } from "../credits";
export { type SectionDepth, SECTION_DEPTH_CONFIG, REPORT_BUNDLES, calculateSectionCost, calculateWordCredit } from "../credits";

// AI
export { callAI, callAIForUpgrade, isAIConfigured, isOffPeakHours, canRunUpgradeTasks, getAIBudgetStatus } from "../ai-client";

// Rate limiting
export { checkRateLimit } from "../rate-limit";

// Analytics (client-safe — re-exported from shared for consistency)
// Note: analytics.ts is client-safe, no "server-only" import
