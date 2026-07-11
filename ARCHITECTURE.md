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
| Testing    | Vitest + jsdom (via @analogjs/vitest-angular)                                        |
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
| `/generate`    | `GenerateComponent`        | —                                                                                              |
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
| `StyleService`         | CRUD over the horde's native `/v2/styles` user styles and collections           |
| `HordeStylesService`   | Curated style-preset catalogue from the AI-Horde-Styles GitHub JSONs (with `applyStyle` `{p}`/`{np}` merge) |
| `CivitaiService`       | Typed public CivitAI model search for LoRAs and textual inversions              |
| `AuthService`          | User authentication, session state, API key management, kudos balance signal    |
| `DatabaseService`      | Local data persistence (localStorage/IndexedDB)                                 |
| `GenerationQueueService` | Client-side image generation queue: dispatch, polling, result download          |
| `GenerationDbService`  | IndexedDB persistence for generation jobs and their image blobs                  |
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

## Generation Queue Subsystem

Client-side image generation is driven by two root-provided, browser-only
services. On the server both are inert: `GenerationDbService` methods no-op and
`GenerationQueueService` starts no loops, so injecting them during SSR is safe.

- **`GenerationDbService`** owns an IndexedDB database (`ai-horde-frontpage`)
  with two stores: `generationJobs` (keyed by `localId`, indexed on `status` and
  `createdAt`) and `generationImages` (keyed by `[localId, imageId]`, indexed on
  `localId`). It exposes job CRUD, per-job image storage, cascade delete, and a
  retention prune that keeps at most N terminal jobs. The schema is versioned and
  self-healing: the upgrade callback creates stores and indexes idempotently, and
  if an opened database is found missing a required store (a foreign layout at or
  above the current version) or the open fails with a `VersionError`, the database
  is deleted and rebuilt fresh. Generation history is a disposable local cache, so
  losing it on recovery is preferable to a permanently wedged page. Recovery is
  race-safe because the open promise is memoized, so concurrent callers share a
  single wipe-and-recreate.

- **`GenerationQueueService`** exposes `jobs`, `pendingJobs`, and `finishedJobs`
  signals plus `enqueue`, `cancel`, `deleteJob`, `retry`, `getJobImages`, and
  `estimateKudos` (a `dry_run` submission). It runs two cooperative loops:
  - a **dispatch loop** (~1s) that submits `waiting` jobs while the active count
    is below the concurrency cap and a sliding-window rate limit allows it,
    backing off on 429 and marking 4xx validation failures as errored,
  - a **poll loop** (~2s) that advances in-flight jobs from the check endpoint,
    then on completion fetches the status, downloads each result (R2 URL or
    base64) to a `Blob`, and stores it.

  Large base64 `source_image` / `source_mask` payloads are never embedded in the
  persisted request; source/mask blobs live in the image store and are
  rehydrated into the request at submit time. Timers run via
  `NgZone.runOutsideAngular`; signal writes are marshalled back inside the zone.
  On startup the service loads persisted jobs so in-flight work resumes polling
  and `waiting` work resumes dispatch.

  The queue relies on the `*Result` variants of `AiHordeService`
  (`submitImageGenerationResult`, `checkImageGenerationResult`) which surface the
  HTTP status so the engine can distinguish a 429 backoff from a permanent 4xx
  rejection, unlike the `null`-collapsing fire-and-forget methods.

The `/generate` page (`pages/generate/`, `RenderMode.Client`) is the canonical UI
over this queue. The profile `generations` tab
(`/profile/generations`) reuses it rather than duplicating the flow: its
`ProfileGenerationsComponent` renders `<app-generate [embedded]="true" />`, where
the `embedded` input suppresses the page's own intro/title chrome and its claim on
the document title so it nests cleanly inside the profile shell.
The page is a two-pane workspace: a fixed-width control panel on the left
(own scroll, sticky footer) and a results pane on the right (own scroll). Below
`lg` the panes stack (controls first, results below). `GenerateComponent` owns a
reactive form, drives a debounced `estimateKudos` dry run, persists the form to
`localStorage` via `DatabaseService`, resolves the selected curated style via
`HordeStylesService`, and hands `buildStyledImageRequest` output to `enqueue`.
A `mode` field (`simple`/`advanced`, persisted, never sent) drives a segmented
toggle: simple mode exposes only prompt, negative prompt, model, size, style,
and batch, and submits every advanced-only field at its default (see
`simpleModeValue`) rather than at a persisted advanced value. Styles are applied
at build time and may force model/dimensions/sampling params, which the panel
flags with a "set by style" hint. `GenerateFormComponent` is the presentational
left control panel (segmented header, scrollable control cards, sticky footer
with the batch stepper, dimensions/kudos readout, and Generate button); it
exposes a `[generateSourceImage]` content slot shown only in advanced mode.
`GenerateSourceImageComponent` is projected into that slot: it
drives the img2img/controlnet/inpaint controls on the shared form, owns the
uploaded source blob (downscaled client-side to the 3072px cap) and an
inpainting paint-mask canvas, and emits a `GenerateSourceState` (source blob,
mask blob, validity) so the page can gate Create and hand blobs to `enqueue`.
Image blobs are never form state; only the serialisable mode/denoise/control
fields are. `GenerateResultsPanelComponent` fills the right pane: a header with a
live status pill (Ready / "N generating · N queued" / "N done") and a Download-all
action, a note that horde image links expire (~20 min) while local copies persist,
and the `pendingJobs`/`finishedJobs` lists, turning stored result blobs into object
URLs that it revokes on destroy or delete.

The inpainting mask follows the horde convention (verified against hordelib
`ImageUtils.add_image_alpha_channel`): WHITE marks the region to regenerate,
BLACK is preserved. The paint layer keeps strokes in its alpha channel and the
export (`helper/source-image.ts`) flattens any painted pixel to white on black.

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

- **Framework**: Vitest + jsdom (via `@analogjs/vitest-angular`)
- **Config**: `vite.config.ts` (test options), `tsconfig.spec.json` (type checking)
- **Spec files**: Co-located with source (e.g., `foo.service.spec.ts`)
- **Integration tests**: Separate files with `.integration.spec.ts` suffix
- **CI**: `npx vitest run --coverage` (V8 coverage with enforced thresholds)
- **HttpClient testing**: Uses `provideHttpClientTesting()` — see `horde-api-cache.service.spec.ts` for patterns

---

## CI Pipeline (`.github/workflows/ci.yml`)

```text
lint  →  format-check  →  typecheck  →  test  →  build
```

All jobs use Node 24, `npm ci`, and run on `ubuntu-latest`. The build job depends on all prior jobs passing. Concurrency is configured to cancel in-progress runs on the same branch.

### Pre-commit

Husky runs `lint-staged` on commit, which applies ESLint `--fix` and Prettier to staged `.ts`, `.html`, `.css`, and `.json` files.
