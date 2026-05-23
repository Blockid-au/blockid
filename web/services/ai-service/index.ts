/**
 * BlockID AI Service — Standalone entry point
 *
 * Phase 2: This will be the main entry point for the AI microservice.
 * Currently a skeleton — routes are still served by the Next.js monolith.
 *
 * To run standalone:
 *   npx tsx services/ai-service/index.ts
 *
 * To build as Docker container:
 *   docker build -f docker/Dockerfile.ai -t blockid-ai .
 */

// This is a placeholder for the future Express/Hono service.
// When ready to extract, the AI routes from src/app/api/rnd/ and src/app/api/svi/
// will be moved here as Express route handlers.

console.log("[blockid-ai] AI Service placeholder — routes still in Next.js monolith");
console.log("[blockid-ai] To extract: move /api/rnd and /api/svi routes here");
console.log("[blockid-ai] See services/ai-service/README.md for details");

export {};
