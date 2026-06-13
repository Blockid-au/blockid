// Next.js instrumentation hook — runs once on server startup.
// Registers a global uncaught exception handler that reports to Sentry
// when SENTRY_DSN is configured.
//
// Enabled via next.config.ts: instrumentation is auto-loaded from src/.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureExceptionSync } = await import("@/lib/error-tracker");

    process.on("uncaughtException", (err) => {
      captureExceptionSync(err, { source: "uncaughtException" });
    });

    process.on("unhandledRejection", (reason) => {
      captureExceptionSync(reason instanceof Error ? reason : new Error(String(reason)), {
        source: "unhandledRejection",
      });
    });
  }
}
