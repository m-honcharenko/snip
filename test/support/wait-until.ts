export async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 50,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition was not met within ${timeoutMs} ms`);
}
