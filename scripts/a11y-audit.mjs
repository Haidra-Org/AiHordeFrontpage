// Runs axe-core (WCAG 2.2 AA tags) over the studio and docs surfaces against a
// running server, and writes one JSON and one Markdown report. Every route gets
// the full rule set at a phone and a desktop width in the light theme, and the
// colour-contrast rule alone in the dark theme, because contrast is the only
// rule whose result depends on the theme. Usage:
//
//   npx ng serve --configuration development   (or the SSR build)
//   node scripts/a11y-audit.mjs [--base http://localhost:4209] [--out <dir>] [--jobs <n>]
//
// Violations are grouped by rule so a fault repeated across a list reads as one
// finding with its instances, which is how it gets fixed.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const base = option("--base", "http://localhost:4209");
const outDir = option("--out", path.join(os.tmpdir(), "aihorde-a11y"));
const jobs = Number(
  option("--jobs", String(Math.min(8, os.availableParallelism()))),
);

const ROUTES = [
  "/",
  "/generate/image",
  "/generate/alchemy",
  "/generate/storage",
  "/docs",
  "/docs/image",
  "/docs/image/learn/txt2img",
  "/docs/image/learn/concepts_images",
  "/docs/image/learn/concepts_migrating",
  "/docs/image/control-types",
  "/docs/image/guide",
  "/docs/image/settings",
  "/docs/image/settings/steps",
  "/docs/alchemy",
  "/docs/alchemy/enlarge",
  "/details/models",
  "/details/styles",
  "/details/leaderboard",
  "/faq",
  "/sponsors",
];
// Pages whose content arrives from an API after load, and an element that is
// there once it has. The scan waits a bounded time for it, then runs anyway.
const DATA_READY = {
  "/": ".github-star-badge__count",
  "/details/models": ".hd-list-row",
  "/details/styles": "app-style-card",
  "/details/leaderboard": ".leaderboard-name",
};
const PHONE = 390;
const DESKTOP = 1280;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CONTRAST_ONLY = ["color-contrast"];
// axe files these under best-practice rather than a WCAG tag, so the tag scan
// skips them. They catch a page with no main landmark, or content left outside
// every landmark.
const LANDMARK_RULES = ["landmark-one-main", "region"];
// The studio's sticky overlays: the docked chips, the Generate row and the
// phone tab bar. The form scrolls under them by design, so whichever control
// sits at their line when axe scans counts as partly hidden. _generate.css
// reserves scroll padding for them (--gs-dock-reserve), so a control that is
// focused or scrolled to comes to rest clear of them. A target-size hit whose
// only cover is one of these is dropped; any other cover still fails.
const STICKY_OVERLAY =
  /\.gs-(dock|dock-chip|genbtn|submitrow|subtabs|subtab)\b/;

/** Whether axe failed this node's target size only because a sticky overlay covers it. */
function coveredOnlyByStickyOverlay(node) {
  const obscured = node.any.filter((check) => /obscured/i.test(check.message));
  return (
    obscured.length > 0 &&
    obscured.every(
      (check) =>
        check.relatedNodes.length > 0 &&
        check.relatedNodes.every((related) =>
          STICKY_OVERLAY.test(related.target.join(" ")),
        ),
    )
  );
}

/** Storage the page reads on load: the theme, and the studio's first-visit flags so the audit sees the working studio; the welcome dialog is audited on its own below. */
function seedStorage(theme, welcomed) {
  return `
    localStorage.setItem('theme-preference', ${JSON.stringify(theme)});
    ${welcomed ? "localStorage.setItem('aihorde.generate.learn.welcomed', 'true');" : "localStorage.removeItem('aihorde.generate.learn.welcomed');"}
  `;
}

async function audit(page, label, rules) {
  const passes = rules ? [rules] : [null, LANDMARK_RULES];
  const violations = [];
  for (const only of passes) {
    const builder = new AxeBuilder({ page });
    const results = await (
      only ? builder.withRules(only) : builder.withTags(TAGS)
    ).analyze();
    for (const violation of results.violations) {
      if (violation.id === "target-size") {
        violation.nodes = violation.nodes.filter(
          (node) => !coveredOnlyByStickyOverlay(node),
        );
      }
      if (violation.nodes.length > 0) {
        violations.push(violation);
      }
    }
  }
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    where: label,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(" "),
      summary: node.failureSummary,
    })),
  }));
}

async function main() {
  const browser = await chromium.launch();
  const findings = [];
  const scenarios = [];
  for (const route of ROUTES) {
    for (const width of [PHONE, DESKTOP]) {
      scenarios.push({ route, width, theme: "light", welcomed: true });
    }
    for (const width of [PHONE, DESKTOP]) {
      scenarios.push({
        route,
        width,
        theme: "dark",
        welcomed: true,
        rules: CONTRAST_ONLY,
      });
    }
  }
  for (const width of [PHONE, DESKTOP]) {
    scenarios.push({
      route: "/generate/image",
      width,
      theme: "light",
      welcomed: false,
      note: "welcome dialog",
    });
  }
  const runScenario = async (scenario) => {
    const context = await browser.newContext({
      viewport: {
        width: scenario.width,
        height: scenario.width < 600 ? 844 : 900,
      },
      colorScheme: scenario.theme,
      hasTouch: scenario.width < 600,
      // The site honours reduced motion, so no scan lands mid-transition.
      reducedMotion: "reduce",
    });
    await context.addInitScript(seedStorage(scenario.theme, scenario.welcomed));
    const page = await context.newPage();
    const notes = [scenario.note, scenario.rules && "contrast only"].filter(
      Boolean,
    );
    const label = `${scenario.route} @${scenario.width} ${scenario.theme}${notes.length ? ` (${notes.join(", ")})` : ""}`;
    try {
      // Playwright discourages networkidle for readiness. These pages poll the
      // live AI Horde API, so the network is rarely idle. The page is ready to
      // scan once it has loaded and the routed page sits after the root
      // router-outlet. Most pages have no <main> to wait for.
      await page.goto(base + scenario.route, {
        waitUntil: "load",
        timeout: 60000,
      });
      await page
        .locator("app-root router-outlet + *")
        .first()
        .waitFor({ timeout: 15000 });
      const dataReady = DATA_READY[scenario.route];
      if (dataReady) {
        await page
          .locator(dataReady)
          .first()
          .waitFor({ state: "attached", timeout: 30000 })
          .catch(() => {
            process.stdout.write(`no data in 30s on ${label}\n`);
          });
      }
      findings.push(...(await audit(page, label, scenario.rules)));
      process.stdout.write(`audited ${label}\n`);
    } catch (error) {
      findings.push({
        id: "audit-error",
        impact: "n/a",
        help: String(error),
        where: label,
        nodes: [],
      });
      process.stdout.write(`FAILED ${label}: ${error}\n`);
    } finally {
      await context.close();
    }
  };
  // Each scenario has its own browser context, so several run side by side.
  const queue = [...scenarios];
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      while (queue.length > 0) {
        await runScenario(queue.shift());
      }
    }),
  );
  await browser.close();

  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "a11y.json"),
    JSON.stringify(findings, null, 2),
  );

  const byRule = new Map();
  for (const finding of findings) {
    const entry = byRule.get(finding.id) ?? { ...finding, instances: [] };
    for (const node of finding.nodes) {
      entry.instances.push({ where: finding.where, ...node });
    }
    if (finding.nodes.length === 0) {
      entry.instances.push({
        where: finding.where,
        target: "",
        summary: finding.help,
      });
    }
    byRule.set(finding.id, entry);
  }
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const lines = [
    "# Accessibility audit",
    "",
    `Base: ${base}`,
    `Scenarios: ${scenarios.length}`,
    "",
  ];
  for (const entry of [...byRule.values()].sort(
    (a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9),
  )) {
    lines.push(
      `## ${entry.id} (${entry.impact}): ${entry.instances.length} instances`,
    );
    lines.push(entry.help, entry.helpUrl ?? "", "");
    const seen = new Set();
    for (const instance of entry.instances) {
      const key = `${instance.target}`;
      const where = instance.where;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const others = entry.instances.filter(
        (other) => other.target === key,
      ).length;
      lines.push(
        `- \`${instance.target}\` (${where}${others > 1 ? `, +${others - 1} more scenarios` : ""})`,
      );
      if (instance.summary) {
        lines.push(`  ${instance.summary.split("\n").join(" ")}`);
      }
    }
    lines.push("");
  }
  await writeFile(path.join(outDir, "a11y.md"), lines.join("\n"));
  process.stdout.write(
    `${byRule.size} rules failed across ${findings.length} route/width/theme hits; report in ${outDir}\n`,
  );
  // A page that failed to load is reported but does not fail the run, because
  // the pages call the live AI Horde API and an outage there is not a defect
  // here. Any axe violation fails it.
  if (findings.some((finding) => finding.id !== "audit-error")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});
