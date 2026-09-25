# Styling

Where styles live, which of the two families to use, and the rules that keep them apart. Read this with
[AGENTS.md](AGENTS.md), which states the same rules in short form.

The visual foundation is the shared Horde design system, a submodule at `src/shared/design-system/`. It is consumed by
more than one Haidra-Org frontend, so its token tables and class catalog live with it and are not restated here:

- [design-system README](src/shared/design-system/README.md) — the two families, structure, full token reference.
- [design-system docs/design-system.md](src/shared/design-system/docs/design-system.md) — the design ethic, tokens,
  surfaces, colour system, accessibility floor.
- [design-system docs/component-patterns.md](src/shared/design-system/docs/component-patterns.md) — the class catalog.

Frontpage-only material sits in [docs/design-system.md](docs/design-system.md),
[docs/component-patterns.md](docs/component-patterns.md) and [docs/design-language.md](docs/design-language.md).

---

## Core rules

1. Styles are central. Every rule lives in `src/styles/*.css` or in the submodule. Component `.css` files stay empty.
2. One canonical class per concept. Do not redeclare a submodule selector in `src/styles`; `npm run lint:css` fails the
   build if you do.
3. Semantic classes, not utility soup in templates. Tailwind utilities are for layout and spacing.
4. Tokens, never literals. A hex or rgb value in a rule is a bug unless it is defining a token.
5. Both themes come out of tokens. Light and dark are checked together, and a colour appears in both or in neither.
6. Accessibility is part of the style: visible focus, WCAG AA contrast in both themes, 44px touch targets on coarse
   pointers, reduced motion honoured, colour never the only signal.
7. Containers are flat; only leaves are boxes. A shell, a tab bar, a routed panel, a page region or a note that
   frames other content draws no fill, border or shadow of its own: it sits on the canvas, and a tab bar keeps only
   the hairline under it. The boxes are the things a reader acts on or reads as one object: a card of controls, a
   stat tile, a result tile, a dialog, a menu. Nesting a box inside a box is the smell; when a container needs
   structure, give it a heading, not a frame.

## The two families

The submodule ships two visual families. Pick one per surface. They are never mixed on one element.

|                    | Glass (legacy)                                                     | HD                                                                    |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Classes            | `.btn`, `.card`, `.badge`, `.surface-glass*`                       | `.hd-btn`, `.hd-card`, `.hd-chip`, and the rest of `.hd-*`            |
| Tokens             | `@theme` names in `tokens/colors.css`, `glass.css`, `spacing.css`  | `--hd-*` in `tokens/scale.css`, `tokens/semantic.css`                 |
| Tailwind utilities | Generated from `@theme`                                            | None; read them with `var()`                                          |
| Dark mode          | Paired light and dark token names, plus per-rule `.dark` overrides | One token name whose value flips under `.dark`; no `.dark .hd-*` rule |
| Look               | Translucent, blurred, gradient-lit                                 | Opaque, dense, low-shadow working surfaces                            |

**The decision rule.** New surfaces and rebuilt surfaces use HD. Glass is legacy: it still draws most of the site and
the sibling model-reference frontend, so it is maintained, not extended. Do not convert a working glass page for its own
sake. Convert it when it is being rebuilt anyway.

HD came out of the `/generate` studio and was promoted into the shared system, so a page on HD gets the studio's density
and control anatomy without importing anything studio-specific.

### The identity-hue contract

Six `--hd-*` names are read by the primitives but declared by the consuming app, on whatever element bounds the region:

| Tokens                                                 | What they colour                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `--hd-sec`, `--hd-sec-tint`, `--hd-sec-tint-border`    | One section: `.hd-chip`, `.hd-sec-chip`, the `.hd-card-title` hairline |
| `--hd-zone`, `--hd-zone-tint`, `--hd-zone-tint-border` | A whole plane: the top edge of `.hd-card`, the `.hd-help-*` glyphs     |

Every primitive that reads one falls back to the accent, so a page that supplies nothing still comes out coherent. The
studio supplies all six from its own zone and section hues in `_generate.css`. `_models.css` supplies `--hd-sec*` from
the accent on its filter bar. Identity hues are audited as graphic colour: glyphs and edges only, never text.

### The two dark ramps

Dark HD has two surface ramps. The default is a slate matched to the site's own dark body, so an HD plane on an ordinary
page sits level with the page around it rather than reading as a colder pit cut into it. A root that adds `hd-deep`
takes the neutral, deeper charcoal instead, because a hue in the surround biases the eye judging a picture: `/generate`
(the shell, the workspace and the storage page), `/alchemy`, the app landing and the `/docs` shell all carry it beside
`gen-studio`. The modifier only speaks under `.dark`; the light values are shared.

### The worked example

The contribution routes use `_contribute.css` for a canvas-level hero and full-width
route tabs. Contribution links keep their explanations visible at every viewport;
hover and keyboard focus add emphasis. Worker illustrations have separate image,
text and alchemy treatments, with motion enabled only when the reader permits it.
The homepage's small contribution network uses one symmetric geometry for its
connecting lines, node centres and packet endpoints.

`src/styles/_models.css` is the first page on HD: the `/details/models` list and the model detail page. It is the shape
every new page should take.

- Page layout rules live in a sheet under `src/styles/`. The controls in the markup are `.hd-*` classes from the
  submodule.
- Every value reads an `--hd-*` token. There is no `@theme` token, no glass token, and no literal.
- There is no `.dark` rule in the file, because there is nothing left for one to do.

## File tree

### `src/styles/`

`src/styles.css` is the single import order and the only entry point.

```text
src/styles.css              Import order: Tailwind, submodule tokens, submodule primitives, then the sheets below
src/styles/
├── _theme.css              Project @theme tokens: brand, content/surface/edge, status pairs, blue/purple/green scales
├── _base.css               Element defaults, the dark-mode variant, keyframes, scroll lock
├── _navigation.css         Header, nav links, mobile drawer, dropdowns, breadcrumbs
├── _footer.css             Site footer
├── _layout.css             Section backgrounds, containers, .wrapper, grids
├── _typography-headings.css  Heading hierarchy from hero to subsection
├── _typography-text.css    Text colours, links, list styles, body variants
├── _home.css               Home page: the dark hero plate, the mosaic, the live band, its sections
├── _forms.css              Frontpage form patterns over the shared form primitives
├── _buttons.css            Frontpage button overrides and additions
├── _cards.css              Card system: base, variants, feature cards, callouts
├── _alerts.css             Frontpage notification patterns over the shared alerts
├── _modals.css             Frontpage dialog patterns, content and actions layout
├── _data-display.css       Frontpage data-display extensions: worker cards, stat columns, domain tinting
├── _shared-keys.css        Shared key card, form and list
├── _tooltips.css           Frontpage tooltip extensions: combined positions, fixed positioning
├── _help.css               Info tooltip triggers, glossary modal and button, page intros
├── _badges.css             Frontpage badge extensions
├── _tables.css             Two-zone item list rows
├── _collapsibles.css       Collapsible cards, sticky section headers, expanded panels
├── _details-tabs.css       Tab bars, sub-tabs, glass variants, tab content panels
├── _models.css             Model list and model detail, drawn on --hd-*; the HD worked example
├── _tools-page.css         Tools filter bar, table of contents, grid and card view
├── _workers-page.css       Worker type sections and domain-coloured cards
├── _network-status.css     Network status panel in its sidebar, compact and tiny variants
├── _prose.css              Rendered markdown and external HTML
├── _faq.css                FAQ accordion and its table of contents
├── _news.css               News timeline, cards, date badges
├── _rate.css               Rating page: info cards, image display, scale buttons
├── _alchemy.css            Alchemy inside the studio, scoped under .gen-studio
├── _generate.css           The studio: .gen-studio scope, .gs-* classes, --gs-* aliases, self-hosted fonts
├── _civitai.css            CivitAI LoRA and embedding rows; unscoped so the style editor gets them too
├── _status.css             Public status page: roll-up banner, incidents, per-service history
├── _sponsors.css           Sponsors page: sponsor cards, patron run, donate plate, drawn on --hd-*
├── _utilities.css          Spinners, skeletons, state containers, code blocks, icon sizing
├── _floating-controls.css  Floating control stack and scroll-to-top
├── _admin.css              Admin layout: sidebar, admin nav, drawer
├── _style-detail.css       Style detail page layout
├── _leaderboard.css        Kudos leaderboard layout and top cards
├── _legacy.css             Deprecated aliases; migrate away from these
└── _additional_pieces.css  Third-party overrides and breakpoint media queries
```

### `src/shared/design-system/`

```text
tokens/
├── colors.css         Gray, primary, success, danger, warning, info scales as @theme names
├── glass.css          Glass surfaces, borders, gradients, blur radii, shadows
├── spacing.css        Spacing, radius, shadow and transition scales
├── scale.css          HD type, space, radius and control scales; the same in both themes
├── semantic.css       HD surfaces, elevation, ink, fields, popovers, accents, status, motion, stage; flips under .dark
└── index.css          Barrel import
primitives/
├── surfaces.css       The .surface-glass family and .surface-floating
├── buttons.css        The .btn family; .hd-btn and its modifiers
├── badges.css         The .badge family; .hd-badge, .hd-sec-chip
├── cards.css          The .card family; .hd-card, .hd-card-title
├── chips.css          .filter-chip; .hd-chip
├── forms.css          The .form-* family; .hd-input, .hd-textarea, .hd-label, .hd-help
├── modals.css         Overlay, dialog, title, content, actions
├── alerts.css         .alert and its semantic variants
├── typography.css     Heading scales, .link, .text-muted, field label and value
├── tables.css         Low-level dense table head, body, row and cell treatments
├── tabs.css           .tabs-nav and .tabs-link, with aliases; .hd-subtabs
├── tooltips.css       .tooltip-wrapper, .tooltip-text, position variants
├── data-display.css   .data-item, .data-value, .stat-column, grids; .hd-row, .hd-empty
├── menus.css          .hd-menu, .hd-menu-item: the plane, not the position
├── segmented.css      .hd-seg, .hd-seg-opt, styled off aria-pressed
├── utilities.css      .sr-only and other accessibility helpers
└── index.css          Barrel import
```

## Import order

`src/styles.css` imports in this order, and the order is what makes the cascade predictable.

1. `tailwindcss`.
2. Submodule `tokens/index.css`, then `primitives/index.css`. Every token is defined before a rule reads it, and every
   primitive is defined before a project rule could override it.
3. `_theme.css`, the project's own `@theme` tokens. They come after the shared tokens so a project name can alias a
   shared one.
4. `_base.css`, then the component and page sheets. Later sheets win ties, so page rules sit after the component rules
   they build on.
5. The studio sheets (`_alchemy.css`, `_generate.css`, `_civitai.css`) come late among the page sheets, so a studio rule
   settles a tie against the general component sheets.
6. `_legacy.css` and `_additional_pieces.css` last: deprecated aliases and breakpoint overrides that have to win.

## The studio

`/generate` is a full-height creation workspace with the site footer dropped. `src/styles/_generate.css` still owns it,
scoped under the `.gen-studio` page-root class, and its controls are still `.gs-*` classes. What is left studio-only:

- The shell: tab bar and pin bar heights, the workspace and results panes, the phone sheet with its three stops.
- Controls HD has no equivalent for: the slider, the switch, the tile grid, the viewer, the sweep plates, the tutorial
  and reference surfaces.
- Section and zone identity hues, one per panel area, which the studio then republishes under the `--hd-sec*` and
  `--hd-zone*` names so shared primitives inside it pick the right hue up. A studio's create plane carries its
  domain's hue (image purple, alchemy green, the same tokens the rest of the site reads), its results plane carries
  none, and its accent is the site accent in both studios: identity hues colour edges and glyphs, never controls.
- Self-hosted Inter and JetBrains Mono, declared with `@font-face` in `_generate.css` so the download only fires for
  text under `.gen-studio`.
- The `/docs` area, which is not a studio but opts into the studio's vocabulary: its shell carries `gen-studio` beside
  `gs-docs`, and its rules (the hub row, the section heads, the doors, the reference and tutorial pages) live in
  `_generate.css` under the same scope. See [docs/design-language.md](docs/design-language.md).

Everything else is now HD. The `--gs-*` token set is a set of aliases: `--gs-card` is `var(--hd-card)`, `--gs-blue` is
`var(--hd-accent)`, and so on down the scales. Change a value in the submodule and the studio moves with the rest of the
site.

**The migration rule.** A `.gs-*` class never leaves `.gen-studio`, and no bare `.hd-*` selector is declared in
`src/styles`. When a studio template is rebuilt, its markup moves to the `.hd-*` classes and the matching `.gs-*` rules
go. Until then the two sit side by side and cost nothing, because they read the same tokens. If a studio control turns
out to be worth sharing, promote it into the submodule as an `.hd-*` primitive rather than un-scoping the `.gs-*` rule.

## Idioms

- **Tokens, not literals.** `var(--hd-space-3)`, `var(--color-surface-primary)`. A raw value is only allowed where a
  token is being defined.
- **Semantic classes.** `.alert--danger`, not `bg-red-100 border border-red-300`. BEM-inspired: `.block`,
  `.block--modifier`, `.block-element`.
- **Component CSS stays empty.** No exceptions. A rule's scope is expressed by its selector, not by its file.
- **Scoping.** Studio rules are scoped by `.gen-studio`. HD rules in `src/styles` are page classes that read `--hd-*`;
  they never declare a bare `.hd-*` selector.
- **Identity by contract.** A page or region sets `--hd-sec*` and `--hd-zone*` on its root and lets the primitives take
  the hue. Do not restyle a primitive to recolour it.
- **Dark mode by tokens.** In HD there is one token name and its value flips. In glass there are paired names and a
  `.dark` rule. Never add a `.dark` rule to an HD surface.
- **Flip a token before adding a class.** A variant that only needs a different hue is a token declaration on the
  region's root, not a second copy of the rule.

## Anti-patterns

1. Utility soup in a template where a semantic class exists.
2. Any rule in a component `.css` file.
3. Redeclaring a submodule selector in `src/styles`. `npm run lint:css` catches it.
4. A `.dark .hd-*` rule, or an HD rule reading a glass token. Both cross the line between the families.
5. `.gs-*` markup outside `/generate`, or a bare `.hd-*` selector declared in `src/styles`.
6. Hardcoded colours, spacing or radii where a token exists.
7. Building a new surface on glass. New work goes on HD.

## Verification

```bash
npm run lint:css
npx prettier --check <touched files>
```

`npm run lint:css` runs `scripts/lint-css-duplicates.mjs`. It parses every `@layer components` block in the submodule's
`primitives/*.css` and in `src/styles/*.css`, collects the selectors declared at the top level of each block, and fails
if a selector declared in the submodule is declared again in `src/styles`. A small allowlist inside the script covers
the overrides that are deliberate, each with its reason. The point is that a project sheet cannot quietly shadow a
shared primitive: either use the primitive, or give the project rule its own name.

`AGENTS.md` lists the rest of the checks a change has to pass.

## Quick reference

The HD column is what new work uses. The glass column is legacy, kept for the pages already drawn on it.

| Need              | HD                                                                 | Glass (legacy)                                                |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Button            | `.hd-btn` + `--primary`, `--tonal`, `--ghost`, `--dense`, `--icon` | `.btn-primary`, `.btn-secondary`, `.btn-danger`               |
| Card              | `.hd-card`, `.hd-card-title`                                       | `.card`, `.surface-glass` and its modifiers                   |
| Chip              | `.hd-chip`, `.hd-chip--active`                                     | `.filter-chip`                                                |
| Badge             | `.hd-badge`, `.hd-sec-chip` + `--sm`, `--lg`                       | `.badge`, `.badge-base` plus a colour variant                 |
| Field             | `.hd-input`, `.hd-textarea`, `.hd-label`, `.hd-sublabel`           | `.form-input`, `.form-textarea`, `.form-label`, `.form-hint`  |
| Help glyph        | `.hd-help`, `.hd-help-btn`, `.hd-help-note`                        | `.info-tooltip-trigger`, `.tooltip-wrapper` + `.tooltip-text` |
| Segmented control | `.hd-seg`, `.hd-seg-opt`, `.hd-seg--xs`                            | none; use tabs or chips                                       |
| Sub-tabs          | `.hd-subtabs`, `.hd-subtab`, `.hd-subtab--active`                  | `.details-tabs`, `.details-tab`                               |
| Row               | `.hd-row`, `.hd-row-val`                                           | `.item-list-row`, `.data-item`                                |
| Empty state       | `.hd-empty`, `.hd-empty-title`, `.hd-empty-sub`                    | `.state-empty`, `.state-container`                            |
| Menu              | `.hd-menu`, `.hd-menu-item`                                        | `.surface-floating`                                           |
