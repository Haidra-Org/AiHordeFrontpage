## What Changed

Brief description of the changes in this PR.

## Why

Context on the motivation — link to an issue if applicable.

## How to Test

Steps a reviewer can follow to verify the change.

## Checklist

- [ ] Follows [code conventions](CONTRIBUTING.md#code-conventions)
- [ ] Component CSS files are empty (styles in `src/styles/`)
- [ ] New user-facing text uses Transloco keys
- [ ] Newly added styles follow conventions in `STYLING.md` and are documented in `docs/design-system.md` or `docs/component-patterns.md`
- [ ] Accessibility: focus states, ARIA attributes, color contrast
- [ ] CI checks pass locally (`npm run lint && npm run format:check && npx tsc --noEmit && npm test`)
