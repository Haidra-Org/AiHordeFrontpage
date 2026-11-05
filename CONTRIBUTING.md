# Contributing

Thank you for your interest in contributing to the AI Horde frontend.

## Getting Started

```bash
# Prerequisites: Node.js 24 via NVM
nvm use 24.22.2

# Install dependencies
npm ci

# Start dev server (port 4209)
npm start
```

## Code Conventions

### Angular Patterns

- **Standalone components** — All components are standalone. Do NOT set `standalone: true` in decorators (it's the default in Angular 21+).
- **OnPush change detection** — Every component must set `changeDetection: ChangeDetectionStrategy.OnPush`.
- **Signal-based state** — Use `signal()`, `computed()`, and `input()` / `output()` functions.
- **`viewChild()` signal** — Use `viewChild()` instead of `@ViewChild` decorator.
- **`inject()` function** — Use `inject()` instead of constructor injection.
- **`takeUntilDestroyed()`** — All RxJS subscriptions in components must use `takeUntilDestroyed(destroyRef)` for cleanup.
- **Native control flow** — Use `@if`, `@for`, `@switch` instead of `*ngIf`, `*ngFor`, `*ngSwitch`.
- **Lazy loading** — Routes use `loadComponent()` for code splitting.

### Page Titles

Use the `setPageTitle()` helper from `src/app/helper/page-title.ts`:

```typescript
import { setPageTitle } from '../helper/page-title';

ngOnInit(): void {
  setPageTitle(this.translator, this.title, this.destroyRef, 'page.title_key');
}
```

For the homepage, use `setAppTitle()` instead.

### API Calls

All HTTP requests to the AI Horde API go through `HordeApiCacheService` with `CacheTTL` constants:

```typescript
private readonly cache = inject(HordeApiCacheService);

this.cache.cachedGet<MyType>(url, { context }, { ttl: CacheTTL.LONG, category: 'myCategory' });
```

### Notifications

Use `ToastService` for user-facing messages:

```typescript
private readonly toast = inject(ToastService);

this.toast.success('message', { transloco: true });
this.toast.error('message', { transloco: true, rawError: error });
```

### Icons

Use `IconComponent` (`<app-icon name="icon-name" />`) instead of inline `<svg>` elements. Icon assets live in `src/assets/img/icons/`.

### Styling

All styles are centralized in `src/styles/` and in the design-system submodule at `src/shared/design-system/`.
Component `.css` files must be empty. Use semantic CSS classes rather than inline Tailwind utilities.

The submodule ships two families. The glass family (`.btn`, `.card`, `.badge`, `.surface-glass*`) is legacy and still
draws most of the site. The HD family (`.hd-*` classes on `--hd-*` tokens) is what new and rebuilt surfaces use;
`src/styles/_models.css` is the worked example. The studio's `.gs-*` classes never leave `.gen-studio`.

See [STYLING.md](STYLING.md) for the full conventions and [AGENTS.md](AGENTS.md) for the rules any change has to
follow.

### Accessibility

- All interactive elements must have visible focus states.
- Color alone must not convey information — pair with text or icons.
- Modals must trap focus and restore it on close.
- Must pass AXE checks and meet WCAG AA minimums.

## Git Hooks

The project uses Husky and lint-staged.

On commit, staged files are checked:

- **ESLint** with `--fix` on `.ts`, `.html`, `.js` and `.mjs` files.
- **Prettier** on `.ts`, `.html`, `.js`, `.mjs`, `.css`, `.json`, `.md` and `.yml` files.

`@typescript-eslint/no-unnecessary-type-assertion` is reported on commit but never autofixed. Its fix can remove a
cast that feeds generic inference, which widens a type without a compile error. Remove a flagged cast by hand, and
check the inferred type of whatever the cast fed. `npm run lint:fix` still applies that fix, so read its diff.

On push, `npm run typecheck` runs, then the Vitest specs affected by changes since the branch left `main`.

## CI Pipeline

Pull requests and pushes to `main` run these jobs. All must pass except the accessibility audit, which only reports
for now:

1. **Static checks**: `npm run lint`, `npm run lint:prettier-sync`, `npm run format:check`, `npm run typecheck:app`,
   `npm run typecheck:spec` and `npm run lint:css`.
2. **Test**: `npx vitest run --coverage`. The thresholds in `vite.config.ts` sit just under current coverage, so a
   drop fails the run. Raise them when coverage rises.
3. **Dependency audit**: `npm audit --omit=dev --audit-level=moderate` over the production dependencies.
4. **Build**: builds the Docker image, starts it, and runs `npm run smoke:ssr` against it.
5. **Accessibility audit**: builds the site, serves the SSR build and runs `npm run audit:a11y`. Every route gets the
   full WCAG rule set at 390px and 1280px in the light theme, and the colour-contrast rule alone at both widths in the
   dark theme, since contrast is the only rule that depends on the theme. Scans run in parallel and start once the
   routed page is attached, plus a bounded wait for API-loaded content on the data pages. The script exits non-zero on
   any axe violation, and a page that fails to load is reported without failing it. The job is report-only
   (`continue-on-error`) until the existing violations are fixed. The report is uploaded as the `a11y-report`
   artifact.

Dependabot (`.github/dependabot.yml`) opens weekly pull requests for npm packages, GitHub Actions, the Docker base
image and the Discord scripts' Python packages. The Angular packages are grouped so they move together.

The Node version is pinned in `.nvmrc`, `package.json` engines, `NODE_VERSION` in `.github/workflows/ci.yml` and the
`Dockerfile` base image. Change all four together.

## Pull Requests

1. Create a feature branch from `main`.
2. Make focused, single-purpose changes.
3. If adding a style or component, update the relevant documentation in `STYLING.md` or `docs/component-patterns.md`.
4. Ensure all CI checks pass locally before pushing.
5. Write a clear PR description explaining what changed and why.

## Project Documentation

- [README.md](README.md) — Project overview and quick start
- [AGENTS.md](AGENTS.md) — The rules any change to this codebase follows, and the checks it has to pass
- [ARCHITECTURE.md](ARCHITECTURE.md) — Technical overview: routes, services, data flow
- [STYLING.md](STYLING.md) — The two style families, file organization, idioms, anti-patterns
- [src/shared/design-system/docs/](src/shared/design-system/docs/) — The shared token reference and class catalog for
  both families
- [docs/design-system.md](docs/design-system.md) — Frontpage tokens, surfaces and form shells
- [docs/component-patterns.md](docs/component-patterns.md) — Frontpage CSS class catalog
- [docs/design-language.md](docs/design-language.md) — The studio's zones, identity hues and remaining idioms
