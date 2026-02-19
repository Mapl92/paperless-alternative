export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startConsumeWatcher } = await import("@/lib/consume/watcher");
    startConsumeWatcher();

    const { startEmailWatcher } = await import("@/lib/email/watcher");
    startEmailWatcher();

    const { startShareCleanup } = await import("@/lib/r2/cleanup");
    startShareCleanup();
  }
}
