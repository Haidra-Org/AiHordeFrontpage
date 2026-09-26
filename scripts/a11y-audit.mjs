// Runs axe-core (WCAG 2.2 AA tags) over the studio and docs surfaces at three
// widths in both themes against a running dev server, and writes one JSON and
// one Markdown report. Usage:
//
//   npx ng serve --configuration development
//   node scripts/a11y-audit.mjs [--base http://localhost:4209] [--out <dir>]
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
const WIDTHS = [390, 768, 1280];
const THEMES = ["light", "dark"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Storage the page reads on load: the theme, and the studio's first-visit flags so the audit sees the working studio; the welcome dialog is audited on its own below. */
function seedStorage(theme, welcomed) {
  return `
    localStorage.setItem('theme-preference', ${JSON.stringify(theme)});
    ${welcomed ? "localStorage.setItem('aihorde.generate.learn.welcomed', 'true');" : "localStorage.removeItem('aihorde.generate.learn.welcomed');"}
  `;
}

async function audit(page, label) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
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
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const route of ROUTES) {
        scenarios.push({ route, width, theme, welcomed: true });
      }
      scenarios.push({
        route: "/generate/image",
        width,
        theme,
        welcomed: false,
        note: "welcome dialog",
      });
    }
  }
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: {
        width: scenario.width,
        height: scenario.width < 600 ? 844 : 900,
      },
      colorScheme: scenario.theme,
      hasTouch: scenario.width < 600,
    });
    await context.addInitScript(seedStorage(scenario.theme, scenario.welcomed));
    const page = await context.newPage();
    const label = `${scenario.route} @${scenario.width} ${scenario.theme}${scenario.note ? ` (${scenario.note})` : ""}`;
    try {
      await page.goto(base + scenario.route, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await page.waitForTimeout(1500);
      findings.push(...(await audit(page, label)));
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
  }
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
}

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});
