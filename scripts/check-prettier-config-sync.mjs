import path from "node:path";
import process from "node:process";

import prettier from "prettier";

const repoRoot = process.cwd();
const designSystemDir = path.join(repoRoot, "src", "shared", "design-system");
const rootProbe = path.join(repoRoot, "src", "__prettier-sync-probe__.ts");
const designProbe = path.join(designSystemDir, "__prettier-sync-probe__.ts");

const optionsToCompare = [
  "useTabs",
  "tabWidth",
  "printWidth",
  "trailingComma",
  "bracketSpacing",
  "semi",
  "singleQuote",
  "jsxSingleQuote",
  "quoteProps",
  "bracketSameLine",
  "arrowParens",
  "endOfLine",
  "proseWrap",
  "htmlWhitespaceSensitivity",
];

function toWorkspaceRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function normalizeConfig(config) {
  const normalized = {};
  for (const option of optionsToCompare) {
    normalized[option] = config?.[option];
  }

  return normalized;
}

function getConfigDiff(leftConfig, rightConfig) {
  const diff = [];
  for (const option of optionsToCompare) {
    const leftValue = leftConfig[option];
    const rightValue = rightConfig[option];
    if (leftValue !== rightValue) {
      diff.push({
        option,
        rootValue: leftValue,
        designValue: rightValue,
      });
    }
  }

  return diff;
}

function isInsideDirectory(baseDir, targetPath) {
  const relativePath = path.relative(baseDir, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function formatValue(value) {
  return value === undefined ? "<undefined>" : JSON.stringify(value);
}

async function main() {
  const [rootConfig, designConfig, rootConfigFile, designConfigFile] =
    await Promise.all([
      prettier.resolveConfig(rootProbe, { editorconfig: true }),
      prettier.resolveConfig(designProbe, { editorconfig: true }),
      prettier.resolveConfigFile(rootProbe),
      prettier.resolveConfigFile(designProbe),
    ]);

  if (!rootConfig) {
    throw new Error("Could not resolve Prettier config for the main project.");
  }

  if (!designConfig) {
    throw new Error(
      "Could not resolve Prettier config for the design-system submodule.",
    );
  }

  const normalizedRootConfig = normalizeConfig(rootConfig);
  const normalizedDesignConfig = normalizeConfig(designConfig);
  const configDiff = getConfigDiff(
    normalizedRootConfig,
    normalizedDesignConfig,
  );

  const errors = [];

  if (!designConfigFile) {
    errors.push(
      "No Prettier config file was resolved for the design-system submodule.",
    );
  } else if (!isInsideDirectory(designSystemDir, designConfigFile)) {
    errors.push(
      `Design-system Prettier config resolves outside the submodule: ${toWorkspaceRelative(designConfigFile)}`,
    );
  }

  if (configDiff.length > 0) {
    errors.push(
      "Resolved Prettier options differ between the main project and design-system.",
    );
  }

  if (errors.length > 0) {
    console.error("Prettier config sync check failed.");
    for (const error of errors) {
      console.error(`- ${error}`);
    }

    console.error("");
    console.error(
      `Main config source: ${rootConfigFile ? toWorkspaceRelative(rootConfigFile) : "<none>"}`,
    );
    console.error(
      `Design config source: ${designConfigFile ? toWorkspaceRelative(designConfigFile) : "<none>"}`,
    );

    if (configDiff.length > 0) {
      console.error("");
      console.error("Mismatched options:");
      for (const diffEntry of configDiff) {
        console.error(
          `- ${diffEntry.option}: main=${formatValue(diffEntry.rootValue)} design-system=${formatValue(diffEntry.designValue)}`,
        );
      }
    }

    process.exit(1);
  }

  console.log("Prettier config sync check passed.");
  console.log(
    `Main config source: ${rootConfigFile ? toWorkspaceRelative(rootConfigFile) : "<none>"}`,
  );
  console.log(
    `Design config source: ${designConfigFile ? toWorkspaceRelative(designConfigFile) : "<none>"}`,
  );
}

await main();
