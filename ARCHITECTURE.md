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
| `/generate`    | `GenerateShellComponent`   | `image`, `alchemy`, `storage`                                                                  |
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
| `HordeStylesService`   | Curated style-preset catalogue from the AI-Horde-Styles GitHub JSONs (applied client-side, with `applyStyle` `{p}`/`{np}` merge) |
| `StylePreviewsService` | Lazy, stale-while-revalidate style preview renders from the AI-Horde-Styles-Previews GitHub JSONs |
| `StyleUsageService`    | Per-style generation counts, backing the style browser's "most used" ordering   |
| `CivitaiService`       | Typed public CivitAI model search for LoRAs and textual inversions              |
| `AuthService`          | User authentication, session state, API key management, kudos balance signal    |
| `DatabaseService`      | Local data persistence (localStorage/IndexedDB)                                 |
| `GenerationQueueService` | Client-side image generation queue: dispatch, polling, result download          |
| `GenerationDbService`  | IndexedDB persistence for generation jobs and their image blobs                  |
| `TabSyncService`       | Cross-tab bus (BroadcastChannel, typed topics) and per-job Web Locks            |
| `AlchemyQueueService`  | Client-side alchemy queue: submission, polling, result-image capture             |
| `AlchemyDbService`     | IndexedDB persistence for alchemy jobs, results and their image blobs            |
| `TextGenerationQueueService` | Client-side text request queue for prompt drafts: submission, polling, cancel, landing takes as drafts |
| `TextGenerationDbService` | IndexedDB persistence for text requests while they run and for a day after     |
| `PromptDraftDbService` | IndexedDB persistence for drafts a text model wrote, with stars                  |
| `PromptHistoryDbService` | IndexedDB persistence for prompts sent to image generation, with counts and stars |
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

## Studio Persistence and Queues

Both studios keep their work in the browser and keep it advancing while the
reader is elsewhere in the app. Root-provided, browser-only queue and database
services do this. On the server they are inert: the database services no-op and the
queues start no loops, so injecting them during SSR is safe.

### The databases

Each studio owns its own IndexedDB database, opened through the shared
`openStudioDb` helper in `services/idb-open.ts`:

| Database | Version | Stores |
|---|---|---|
| `ai-horde-frontpage` | 2 | `generationJobs` (key `localId`, indexes `status`, `createdAt`), `generationImages` (key `[localId, imageId]`, index `localId`) |
| `ai-horde-frontpage-alchemy` | 1 | `alchemyJobs` (key `localId`, indexes `createdAt`, `jobId`), `alchemyImages` (key `[localId, imageId]`, index `localId`) |
| `ai-horde-frontpage-text-requests` | 1 | `requests` (key `localId`, index `createdAt`) |
| `ai-horde-frontpage-prompt-drafts` | 1 | `drafts` (key `id`, index `createdAt`) |
| `ai-horde-frontpage-prompt-history` | 1 | `sent` (key: hash of prompt and negative, index `lastSentAt`), `meta` (the one-time seed marker) |

Alchemy is separate rather than two more stores in the existing database. Adding
stores there would mean opening it at a higher version, and an older bundle that
later met that database would fail with a `VersionError`; on builds predating the
recovery policy below, that meant deleting every stored image. Keeping the
generation database at the version older bundles already expect puts image
history out of reach of the change.

**Migrations are additive only, and a keyPath never changes.** Everything else
rests on that: it is what makes a database written by a later build safe for an
earlier one to adopt.

Recovery, in `openStudioDb`:

- The upgrade callback creates stores and indexes idempotently, so a
  partially-provisioned database is completed rather than replaced.
- A `VersionError` (the on-disk version is ahead of this build) is **not** a
  wipe. The open is retried with no version argument, and a database carrying
  the required stores is adopted as it stands.
- Only a database that genuinely lacks the required stores is deleted and
  rebuilt, because every write against it would otherwise throw.
- `deleteDB` passes a `blocked` callback. Without one, a connection held by
  another tab leaves the delete pending forever and every caller awaiting the
  memoized open hangs with it.
- Recovery is race-safe because each service memoizes its open promise, so
  concurrent callers share a single attempt.

**Nothing is pruned automatically, anywhere.** `GenerationDbService.pruneFinishedJobs`
and `GenerationQueueService.pruneFinished` exist and are deliberately uncalled;
they must stay that way. `AlchemyDbService` has no prune method at all. The only
paths that remove stored work are a per-job delete and `/generate/storage`, which
is the reader's own explicit action. The direct consequence is that a heavy user
can exhaust the origin quota; the alchemy queue reports that once and keeps
running rather than making room for itself.

The one exception is `ai-horde-frontpage-text-requests`. A text request record is
bookkeeping for a request in flight, not the reader's work: its takes are written
to `ai-horde-frontpage-prompt-drafts` as soon as it finishes, and those drafts are
never pruned. Finished request records older than a day are removed when the queue
starts.

### Cross-tab sync

Every open tab loads the same IndexedDB rows and runs its own loops, so tabs
talk through `TabSyncService`: a single `BroadcastChannel` with a typed topic
registry (`TabSyncTopics`). Each queue publishes on every local write (added,
changed, cancelled, deleted, cleared) and applies peers' rows to its signals
without writing them back; a row never reopens a job the tab holds as
finished, and a deleted id is refused by every writer for a minute so an
in-flight poll or submit cannot resurrect it. Steps that must run once per
job across tabs (submit, finish and download) take a per-job Web Lock through
`TabSyncService.exclusive`; a tab that finds the lock held skips the step.
Any other state that needs to agree across tabs joins the registry rather
than opening a channel of its own.

Deleting a job the horde is still working on cancels it there first; otherwise
the account's `active_generations` list would hand it back to `adoptActive` as
a request from another session. A finished job whose pictures could not be
fetched stays active and retries for a bounded window (`fetchRetryFrom`),
then becomes done with a placeholder per missing picture (`fetchFailedCount`).
Every count the studio shows is a count of pictures: stored results plus
censored and unfetched placeholders, the same set the grid draws.
### Generation queue

`GenerationQueueService` exposes `jobs`, `pendingJobs`, and `finishedJobs`
signals plus `enqueue`, `cancel`, `deleteJob`, `retry`, `getJobImages`,
`clearHistory`, and `estimateKudos` (a `dry_run` submission). It runs two
cooperative loops:

- a **dispatch loop** (~1s) that submits `waiting` jobs while the active count is
  below the concurrency cap and a sliding-window rate limit allows it, backing
  off on 429 and marking 4xx validation failures as errored,
- a **poll loop** (~2s) that advances in-flight jobs from the check endpoint,
  then on completion fetches the status, downloads each result (R2 URL or
  base64) to a `Blob`, and stores it.

Large base64 `source_image` / `source_mask` payloads are never embedded in the
persisted request; source/mask blobs live in the image store and are rehydrated
into the request at submit time. Timers run via `NgZone.runOutsideAngular`;
signal writes are marshalled back inside the zone. On startup the service loads
persisted jobs so in-flight work resumes polling and `waiting` work resumes
dispatch.

The queue relies on the `*Result` variants of `AiHordeService`
(`submitImageGenerationResult`, `checkImageGenerationResult`) which surface the
HTTP status so the engine can distinguish a 429 backoff from a permanent 4xx
rejection, unlike the `null`-collapsing fire-and-forget methods.

### Alchemy queue

`AlchemyQueueService` exposes `jobs` and `pendingJobs` signals plus `submit`,
`cancel`, `deleteJobs`, `clearHistory`, and the stored-image reads
`getSourceImage` / `getThumbnail` / `getResultImages`.

It is root-provided rather than owned by the page because the horde's result
links are presigned and stop working after about half an hour: the bytes have to
be captured whether or not the reader is still looking at the studio.

A single ~10s poll loop visits every job that is unsettled **or** settled with
result images still outstanding. For an unsettled job it reads the status and
writes the transition straight through to IndexedDB; for a settled one it skips
the status request entirely and retries only the downloads. That second case
matters: a job can settle on the very tick its last result link first appears,
and a transient failure there would otherwise forfeit the image.

Result images are downloaded per form as that form reaches `done`, not when the
job as a whole settles, so a slow interrogation cannot cost a fast upscale its
image. `storedResultForms` and `failedResultForms` on the record track what has
been captured and what is past saving. A download gets three attempts before it
is written off; a job older than the link lifetime writes its remainder off
without spending a request; a `QuotaExceededError` is reported once, through
`studio.storage.quota_exhausted`, without wedging the loop. Cancelling harvests
the forms the DELETE response still carries before marking the job cancelled.

The whole polled `AlchemyStatusResponse` is stored verbatim rather than picked
apart, so every per-form payload the horde returns survives a reload and the
renderers keep receiving the shape they were written against.

Object URLs over the stored blobs are created by `AlchemyComponent`, not the
service: a root service is never destroyed, so URLs it made would pin the whole
history in memory. The page holds a thumbnail per job and the full-size source
and result images for the shown job only, and revokes them on destroy.

Jobs written by earlier builds under the `aihorde.alchemy.recent_jobs`
localStorage key are imported once on first load. Written results and data-URL
thumbnails come across; the result links they carried are long dead, so those
forms are written off without a request. The key is removed only once the
imports resolve, so a failure retries on the next load.

### Text queue and the prompts library

`TextGenerationQueueService` carries the prompt draft card's text requests. It
keeps each request from the moment it is sent, checks live ones on one loop (3s
while a card showing them is open, 10s otherwise, nothing while the tab is
hidden, 15s back-off after a 429) and has no time limit of its own: the horde
expires a request nobody picks up about 20 minutes after its last refresh, and the
404 that follows marks it expired. Saved live requests resume after a reload.
`cancel` sends the text status DELETE and keeps any takes its answer carries.
Finished takes land in `PromptDraftDbService` under ids derived from the horde id
and take, so landing twice overwrites. `requestsFor(context)` lists any number of
requests per card; `MAX_LIVE_PER_CONTEXT` is the single place the one-at-a-time
rule lives. `PromptDraftService` keeps pricing, model choice and request building,
and `draft()` remains an awaited wrapper over the queue for `PromptCheckService`.

`app-prompt-library` (`components/prompt-library/`) is the reader's view over the
drafts store and `PromptHistoryDbService`, on Drafts and Sent tabs. The studio
records each send beside `presets.pushRecent`. The sent store is separate from the
job list so clearing results keeps prompt history, and it seeds once from the
saved image jobs. A prompt chosen from the library, a draft, or words handed over
from another page reach the prompt box through `GenerateFormComponent.applyPrompt`,
which asks before losing the reader's words and offers Undo after every change.

The `/generate` page (`pages/generate/`) is the canonical UI over the generation queue. It
is prerendered as the empty studio so a link preview reads its title, description
and card; the queue and stored results arrive after hydration. Bare `/generate`
and `/docs` are in-app redirects that build no document, so `src/_redirects`
answers them at the static host. The profile `generations` tab
(`/profile/generations`) reuses it rather than duplicating the flow: its
`ProfileGenerationsComponent` renders `<app-generate [embedded]="true" />`, where
the `embedded` input suppresses the page's own intro/title chrome and its claim on
the document title so it nests cleanly inside the profile shell.
The page is a two-pane workspace: a fixed-width control panel on the left
(own scroll, sticky footer) and a results pane on the right (own scroll). Below
`lg` the panes stack (controls first, results below). `GenerateComponent` owns a
reactive form, drives a debounced `estimateKudos` dry run, persists the form to
`localStorage` via `DatabaseService`, resolves the selected style via
`HordeStylesService` or `StyleService`, and hands the built request to `enqueue`.
A `mode` field (`simple`/`advanced`, persisted, never sent) drives a segmented
toggle: simple mode exposes only prompt, negative prompt, model, size, style,
and batch, and submits every advanced-only field at its default (see
`simpleModeValue`) rather than at a persisted advanced value. Which catalogue a
style came from decides who applies it: a curated preset is merged into the
request here by `buildStyledImageRequest` and may force
model/dimensions/sampling params, which the panel flags with a "set by style"
hint; a style from the horde's own `/v2/styles` is named on the request by
`buildHordeStyleRequest` and applied by the horde, which replaces the params and
the models with the style's and fills the style's `{p}`/`{np}` template from the
prompt it is sent, counts the style's use, pays its creator two kudos and lets a
shared key attached to the style pay for the render. Both the kudos dry run and
the submit go through the same build, so the estimate is priced as the request
will run. `GenerateFormComponent` is the presentational
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
