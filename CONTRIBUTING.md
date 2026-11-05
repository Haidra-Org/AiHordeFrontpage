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

## Pre-Commit Checks

The project uses Husky + lint-staged. On commit, the following run automatically:

- **ESLint** (`--fix`) on `.ts` and `.html` files
- **Prettier** on `.ts`, `.html`, `.css`, and `.json` files

## CI Pipeline

Pull requests run these checks (all must pass):

1. **Lint** — `npm run lint`
2. **Format** — `npm run format-check`
3. **Typecheck** — `npx tsc --noEmit`
4. **Test** — `npm test` (Vitest with coverage thresholds)
5. **Build** — `npm run build` (SSR production build)

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
- [docs/plans/](docs/plans/) — Outstanding improvement plans
