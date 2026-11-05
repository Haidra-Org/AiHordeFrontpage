// Checks that a running SSR server renders the main routes. It waits for
// /healthz, then requires each route to return 200 with Angular's hydration
// markers in the HTML, which a client-only fallback page does not have.
// Usage:
//
//   node scripts/ssr-smoke.mjs [--base http://localhost:4000] [--wait 60]
import process from "node:process";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const base = option("--base", "http://localhost:4000");
const waitSeconds = Number(option("--wait", "60"));

const ROUTES = ["/", "/faq/", "/generate", "/details/models", "/docs"];
const HYDRATION_MARKER = /ngh=|ng-server-context/;

async function waitForHealth() {
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${base}/healthz did not respond within ${waitSeconds}s`);
}

async function main() {
  await waitForHealth();
  let failed = 0;
  for (const route of ROUTES) {
    const response = await fetch(base + route);
    const html = await response.text();
    const hydrated = HYDRATION_MARKER.test(html);
    const ok = response.status === 200 && hydrated;
    if (!ok) {
      failed++;
    }
    process.stdout.write(
      `${ok ? "ok" : "FAIL"} ${route} ${response.status} ${hydrated ? "hydration markers" : "no hydration markers"}\n`,
    );
  }
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});
