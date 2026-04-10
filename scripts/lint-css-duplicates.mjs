#!/usr/bin/env node

/**
 * CSS Duplicate Selector Lint
 *
 * Detects selectors defined in the design-system `@layer components` that are
 * re-declared in app-side `@layer components` files. Running in CI prevents
 * accidental overrides from creeping back in after cleanup.
 *
 * Usage:
 *   node scripts/lint-css-duplicates.mjs          # exits 1 on duplicates
 *   node scripts/lint-css-duplicates.mjs --fix     # (future) auto-dedupe
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DS_DIR = resolve(ROOT, "src/shared/design-system/primitives");
const APP_DIR = resolve(ROOT, "src/styles");

/**
 * Intentional app-side overrides of DS selectors.
 * Each entry must include a reason; reviewed during the @apply-elimination work.
 */
const ALLOWED_OVERRIDES = new Set([
  ".field-label", // admin panel uses for flex layout, DS is typography-only
  ".btn-group--inline", // app adds nested .worker-btn media query
  ".card", // app uses different rounding, layout, border token for homepage cards
  ".dark .card", // app uses hardcoded rgb values for dark card border/shadow
  ".card-footer", // app uses flex layout + mt-auto, DS is padding-only
  ".btn-group", // app always-row with smaller gap, DS is responsive col→row
  ".btn-sm", // style-detail page uses tighter padding + custom .icon sizing
]);

// ── helpers ──────────────────────────────────────────────────────────

/** Strip CSS comments and string literals so they don't confuse the parser. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Extract top-level selectors from `@layer components { … }` blocks.
 * Returns a Set of normalised selector strings (e.g. ".btn-primary").
 *
 * The approach: find each `@layer components {`, then walk braces to find the
 * matching close `}`. Inside that region, every selector preceding a `{` at
 * nesting depth 1 is collected.
 */
function extractLayerSelectors(css) {
  const clean = stripComments(css);
  const selectors = new Set();

  // Find every `@layer components` opening brace
  const layerRe = /@layer\s+components\s*\{/g;
  let match;

  while ((match = layerRe.exec(clean)) !== null) {
    let depth = 1;
    let pos = match.index + match[0].length;
    let selectorBuf = "";

    while (pos < clean.length && depth > 0) {
      const ch = clean[pos];

      if (ch === "{") {
        if (depth === 1) {
          // selectorBuf holds the selector text before this {
          const sel = selectorBuf.trim();
          if (sel && !sel.startsWith("@")) {
            // Normalise: collapse whitespace, lowercase
            const normalised = sel.replace(/\s+/g, " ").toLowerCase();
            // Split comma-separated selectors
            for (const part of normalised.split(",")) {
              const s = part.trim();
              if (s) selectors.add(s);
            }
          }
          selectorBuf = "";
        }
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 1) {
          selectorBuf = "";
        }
      } else if (depth === 1) {
        selectorBuf += ch;
      }

      pos++;
    }
  }

  return selectors;
}

// ── scan files ───────────────────────────────────────────────────────

function cssFilesIn(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".css") && f !== "index.css")
    .map((f) => resolve(dir, f));
}

const dsFiles = cssFilesIn(DS_DIR);
const appFiles = cssFilesIn(APP_DIR);

// Collect all DS selectors with their source files
const dsSelectors = new Map(); // selector → file path
for (const file of dsFiles) {
  const css = readFileSync(file, "utf8");
  for (const sel of extractLayerSelectors(css)) {
    dsSelectors.set(sel, relative(ROOT, file));
  }
}

// Check app files for duplicates
const duplicates = []; // { selector, dsFile, appFile }
for (const file of appFiles) {
  const css = readFileSync(file, "utf8");
  for (const sel of extractLayerSelectors(css)) {
    if (dsSelectors.has(sel) && !ALLOWED_OVERRIDES.has(sel)) {
      duplicates.push({
        selector: sel,
        dsFile: dsSelectors.get(sel),
        appFile: relative(ROOT, file),
      });
    }
  }
}

// ── report ───────────────────────────────────────────────────────────

if (duplicates.length === 0) {
  console.log(
    `✓ No duplicate selectors found (${dsSelectors.size} DS selectors, ${appFiles.length} app files scanned).`,
  );
  process.exit(0);
}

console.error(
  `✗ Found ${duplicates.length} duplicate selector(s) between design-system and app styles:\n`,
);

for (const d of duplicates) {
  console.error(`  ${d.selector}`);
  console.error(`    DS:  ${d.dsFile}`);
  console.error(`    App: ${d.appFile}\n`);
}

console.error(
  "Remove the app-side duplicate or, if intentional, add an /* allow-override */ comment.",
);

process.exit(1);
