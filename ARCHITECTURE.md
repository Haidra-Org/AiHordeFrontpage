# Architecture

Technical overview of the AI Horde frontend for developer navigation. For more on how to contribute (see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

## Tech Stack

| Layer      | Technology                                                                           |
| ---------- | ------------------------------------------------------------------------------------ |
| Framework  | Angular 21 (standalone components, signals, SSR)                                     |
| Styling    | Tailwind CSS 4 (PostCSS, CSS-first `@theme` config)                                  |
| i18n       | Transloco                                                                            |
| HTTP       | `HordeApiCacheService` wrapping Angular `HttpClient`                                 |
| Testing    | Karma + Jasmine                                                                      |
| Deployment | Docker-based SSR with Express (`server.ts`) or Cloudflare Workers (`wrangler.jsonc`) |
| CI         | GitHub Actions — lint, format, typecheck, test, build                                |

---

## Directory Structure

```bash
src/
├── app/
│   ├── components/       # Standalone Angular components
│   ├── directives/       # Custom directives
│   ├── guards/           # Route guards
│   ├── helper/           # Utility functions
│   ├── pages/            # Route-level page components
│   ├── pipes/            # Custom pipes
│   ├── services/         # Injectable services (API, auth, theme, etc.)
│   ├── types/            # TypeScript interfaces and types
│   ├── app.routes.ts     # Route definitions
│   └── app.config.ts     # App providers and configuration
├── assets/
│   ├── i18n/             # Transloco translation files
│   ├── img/              # Static images
│   └── data/             # Static data files
├── styles/               # All CSS (centralized, not in components)
│   ├── _theme.css        # Design tokens via @theme
│   ├── _base.css         # Element defaults and keyframes
│   └── _*.css            # Component and page-specific styles
└── environments/         # Environment configs
```

---

## Routing

All routes use lazy loading via `loadComponent()` and `loadChildren()`.

### Top-Level URL Routes (`app.routes.ts`)

| Path           | Component                  | Children                                                                                       |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `/`            | `HomepageComponent`        | —                                                                                              |
| `/profile`     | `ProfileShellComponent`    | 8 child routes (overview, generations, records, workers, teams, styles, settings, shared-keys) |
| `/admin`       | `AdminComponent` (guarded) | Admin child routes                                                                             |
| `/details`     | `DetailsComponent`         | ~15 child routes (models, workers, teams, styles, leaderboard, etc.)                           |
| `/faq`         | `FaqComponent`             | —                                                                                              |
| `/guis`        | `GuisAndToolsComponent`    | —                                                                                              |
| `/news`        | `NewsComponent`            | —                                                                                              |
| `/register`    | `RegisterComponent`        | —                                                                                              |
| `/mission`     | `MissionComponent`         | —                                                                                              |
| `/sponsors`    | `SponsorsComponent`        | —                                                                                              |
| `/privacy`     | `PrivacyComponent`         | —                                                                                              |
| `/terms`       | `TermsComponent`           | —                                                                                              |
| `/contribute`  | `ContributeComponent`      | Child routes                                                                                   |
| `/v2-transfer` | `TransferComponent`        | —                                                                                              |
| `/**`          | `NotFoundComponent`        | —                                                                                              |

### SSR Render Modes (`app.routes.server.ts`)

| Route Pattern                                   | Mode      | Rationale                      |
| ----------------------------------------------- | --------- | ------------------------------ |
| `/admin/**`, `/profile/**`                      | Client    | Auth-protected, no SSR benefit |
| `/`, `/faq`, `/guis`, `/news`, `/mission`, etc. | Prerender | Static public pages            |
| `/details/**`                                   | Server    | Dynamic content per request    |
| `/**`                                           | Server    | Fallback                       |

---

## Service Inventory

### Core Services

| Service                | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `HordeApiCacheService` | TTL-based HTTP cache with category invalidation. All API calls go through this. |
| `AiHordeService`       | Domain methods for stats, performance, news, models, workers, teams, styles     |
| `AuthService`          | User authentication, session state, API key management                          |
| `DatabaseService`      | Local data persistence (localStorage/IndexedDB)                                 |
| `ToastService`         | Signal-based notification system with auto-dismiss                              |
| `ThemeService`         | Theme management (`'light' \| 'dark' \| 'system'`)                              |
| `IconRegistryService`  | Register and retrieve SVG icon paths by name                                    |
| `TranslatorService`    | Transloco wrapper for i18n                                                      |

### Admin Services

| Service                  | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `AdminUserService`       | User lookup, modification, shared key management |
| `AdminWorkerService`     | Worker management operations                     |
| `AdminOperationsService` | Bulk admin operations                            |
| `AdminFilterService`     | Filter/flag management                           |

### UI Services

| Service                      | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `FooterColorService`         | Signal controlling dark/light footer variant         |
| `FloatingActionService`      | Floating action button visibility                    |
| `StickyRegistryService`      | Manages `--sticky-offset` for stacked sticky headers |
| `NavNotificationService`     | Badge counts on nav items                            |
| `NeedWorkersNotifierService` | Checks if the network needs workers                  |
| `PageGuideService`           | Page-level help/guide content                        |
| `GlossaryService`            | Term definitions for glossary modals                 |
| `HordeStatusService`         | Real-time network status polling                     |
| `NetworkStatusService`       | Network connectivity state                           |

### Interceptors

| Interceptor              | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `clientAgentInterceptor` | Adds `Client-Agent` header to all API requests |
| `rateLimitInterceptor`   | Handles 429 responses with retry-after         |

---

## Component Architecture Patterns

### Signals-First State

- Local component state: `signal()`, `computed()`, `linkedSignal()`
- Inputs: `input()`, `input.required<T>()` — never `@Input()`
- Outputs: `output()` — never `@Output()`
- View queries: `viewChild()`, `viewChildren()` — never `@ViewChild()`
- Observable bridging: `toSignal()` for derived reactive state
- Side effects: `effect()`, `afterRenderEffect()` for DOM manipulation

### Change Detection

All components use `changeDetection: ChangeDetectionStrategy.OnPush`. Enforced by ESLint.

### Dependency Injection

All services use `inject()` function. Constructor injection is not used. Enforced by ESLint.

### Subscription Cleanup

Every `.subscribe()` call uses `takeUntilDestroyed()` paired with a `DestroyRef`. No manual `unsubscribe()`, no `Subscription` arrays.

### Page Titles

Use `setPageTitle()` or `setAppTitle()` from `src/app/helper/page-title.ts`. Don't inject Angular's `Title` service directly in components.

### Error Handling

Services use `catchError()` in their Observable pipes to ensure components receive safe fallback values (typically `null` or `[]`). Components subscribe without `error:` callbacks because the service layer handles failures.

For user-facing error feedback, services emit to `ToastService`.

---

## Data Flow

```text
API request
    ↓
HordeApiCacheService.get()  →  TTL cache check  →  HTTP call if stale
    ↓
AiHordeService / domain service  →  catchError() to safe fallback
    ↓
Component subscribes  →  takeUntilDestroyed()  →  signal.set()
    ↓
Template reads signal()  →  OnPush detects change  →  render
```

---

## SSR & Hydration

- **Bootstrap**: `app.config.ts` provides `provideClientHydration()`
- **Server config**: `app.config.server.ts` merges `provideServerRendering(withRoutes(serverRoutes))`
- **Platform checks**: Browser-only APIs are guarded with `isPlatformBrowser()` or `afterNextRender()`
- **Icon system**: Uses `afterRenderEffect()` so DOM manipulation only runs client-side

---

## Styling Architecture

All styles live in `src/styles/*.css`. Component CSS files are empty by convention. See [STYLING.md](STYLING.md) for principles and [docs/design-system.md](docs/design-system.md) for the full token and surface reference.

---

## Testing

- **Framework**: Karma + Jasmine
- **Spec files**: Co-located with source (e.g., `foo.service.spec.ts`)
- **Integration tests**: Separate files with `.integration.spec.ts` suffix
- **CI**: `npx ng test --watch=false --browsers=ChromeHeadless`
- **HttpClient testing**: Uses `HttpClientTestingModule` — see `horde-api-cache.service.spec.ts` for patterns

---

## CI Pipeline (`.github/workflows/ci.yml`)

```text
lint  →  format-check  →  typecheck  →  test  →  build
```

All jobs use Node 24, `npm ci`, and run on `ubuntu-latest`. The build job depends on all prior jobs passing. Concurrency is configured to cancel in-progress runs on the same branch.

### Pre-commit

Husky runs `lint-staged` on commit, which applies ESLint `--fix` and Prettier to staged `.ts`, `.html`, `.css`, and `.json` files.
