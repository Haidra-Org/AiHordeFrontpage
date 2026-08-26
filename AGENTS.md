# Working in this repository

Rules for anyone, human or agent, changing this codebase. They restate what the code and its documentation already
require; when a rule here and the code disagree, fix one of them rather than working around it.

## Read first

- [README.md](README.md): what the project is, how to run it, the directory map.
- [STYLING.md](STYLING.md): where styles live, the two style families and which to use, tokens, idioms, anti-patterns.
- [ARCHITECTURE.md](ARCHITECTURE.md): routes, services, SSR render modes, data flow.
- [CONTRIBUTING.md](CONTRIBUTING.md): Angular conventions, page titles, API calls, notifications, icons, CI checks.
- [docs/haidra-assets/docs/meta/copy.md](docs/haidra-assets/docs/meta/copy.md): the register every reader-facing
  string is written in. [documentation.md](docs/haidra-assets/docs/meta/documentation.md) governs the `docs/` tree.

## Code rules

- Angular standalone components, `OnPush`, signals (`signal`, `computed`, `input`, `output`, `viewChild`), `inject()`,
  native control flow, `takeUntilDestroyed`. Routes lazy-load with `loadComponent`.
- All styling is central: `src/styles/*.css` and the design-system submodule. Component `.css` files stay empty. New and
  rebuilt surfaces use the HD family (`.hd-*`, `--hd-*`); the studio's `.gs-*` classes never leave `.gen-studio`. Details
  in STYLING.md.
- Every reader-facing string goes through transloco (`src/assets/i18n/en.json`) and is covered by
  `src/app/i18n-coverage.spec.ts`; no hardcoded English in templates or TypeScript, including pluralisation.
- Documentation content (tutorial flows, settings reference, sections, examples) lives in `src/app/content/` as data.
  Pages take their identity from those registries; components render them. Do not author copy or step logic in
  components.
- AI Horde requests go through `HordeApiCacheService`; model reference data through `ModelReferenceService`; user
  messages through `ToastService`; icons through `IconComponent`.
- Accessibility is a design input: visible focus states, WCAG AA contrast in both themes, touch targets of about 44px
  on coarse pointers, reduced motion respected, colour never the only signal.
- No new dependencies without discussion. No refactors outside the change being made; note the opportunity instead.
- The project is a non-profit run on volunteers and donations. Anything that leads to contributing (becoming a
  worker, development, donating, the Contribute entry in the nav) is never demoted, collapsed into an overflow or
  "more" menu, or hidden by default; when a surface offers the chance, promote it.

## Comments and messages

- Comments explain why, never what, and never narrate the task, a date, a run, or a person.
- Commit messages: short subject, then `-` bullets explaining the reasoning and naming the key symbols or files; one
  bullet is one line. No generated-by trailers.

## Verification

Before calling a change done, run and read:

```bash
npx vitest run
npx ng build --configuration development
npx ng lint
npm run lint:css
npx prettier --check <touched files>
```

Report what was run and what was not. A change that was not run is not done.

## Submodules

- `src/shared/design-system`: the shared Horde design system. Changes there are commits in the submodule on a branch,
  then a pointer bump here. The same submodule is consumed by other Haidra-Org frontends; keep it neutral (no
  page-specific names) and additive unless the change is coordinated across consumers.
- `docs/haidra-assets`: shared documentation standards and the evidence-library tooling.
