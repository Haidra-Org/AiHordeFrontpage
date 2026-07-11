# Styling Guide

Styling conventions for the AI Horde frontend. This project consumes the [shared Horde design system](src/shared/design-system/) as its foundation. For the shared design token reference and surface system, see [the design system docs](src/shared/design-system/docs/design-system.md). For the shared CSS class catalog, see [the design system component patterns](src/shared/design-system/docs/component-patterns.md). For AiHordeFrontpage-specific patterns, see [docs/design-system.md](docs/design-system.md) and [docs/component-patterns.md](docs/component-patterns.md).

---

## Core Principles

1. **Centralized Styles Only** — All styles live in `src/styles/*.css`. Component CSS files must remain empty.
2. **Semantic Classes Over Utilities** — Prefer `.card`, `.alert--danger` over inline Tailwind. Improves readability and maintainability.
   - Note that this apparent disconnect is due to organic progress from utility-first to a more semantic approach as the project evolved. The Tailwind utilities are still used under the hood via `@apply` in the semantic classes.
3. **Reusability-Focused** — Each concept (cards, buttons, alerts) has ONE canonical class. No duplication across files. This promotes consistency and reduces CSS bloat.
4. **Theme-Aware by Default** — All components must support light and dark modes using theme variables or `dark:`.
5. **Accessibility First** — All interactive elements meet WCAG AA: focus states, color contrast, ARIA attributes.

---

## Technology Stack

- **Tailwind CSS v4** — CSS-first configuration using `@theme` directive (not JS config)
- **PostCSS** — Build pipeline via `@tailwindcss/postcss`
- **CSS Layers** — `@layer` for cascade order

---

## File Organization

Styles in `src/styles/` are organized by concern:

### Theme Layer

| File         | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| `_theme.css` | Design tokens: colors, spacing, shadows, radii (via `@theme`) |

### Base Layer

| File        | Purpose                                     |
| ----------- | ------------------------------------------- |
| `_base.css` | HTML element defaults, dark mode, keyframes |

### Component Layers

| File                       | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `_navigation.css`          | Nav system: desktop shell, mobile drawer, links, dropdowns |
| `_footer.css`              | Footer component                                           |
| `_layout.css`              | Page layout containers (`.wrapper`, `.section-primary`)    |
| `_typography-headings.css` | Heading hierarchy (`.heading-hero`, `.heading-section`)    |
| `_typography-text.css`     | Text utilities, links, list styles                         |
| `_forms.css`               | Form inputs, labels, checkboxes, filters                   |
| `_buttons.css`             | Button variants (`.btn-primary`, `.btn-danger`)            |
| `_cards.css`               | Cards, callouts, feature cards, surface primitives         |
| `_alerts.css`              | Alert/notification components                              |
| `_modals.css`              | Dialog/modal components                                    |
| `_badges.css`              | Badge components and color variants                        |
| `_tables.css`              | Two-zone item list rows                                    |
| `_data-display.css`        | Data display, worker cards, stat columns, domain tinting   |
| `_tooltips.css`            | Tooltip system                                             |
| `_collapsibles.css`        | Collapsible cards and sticky section headers               |
| `_details-tabs.css`        | Tab bars, sub-tabs, glass variants, tab content panels     |
| `_floating-controls.css`   | Floating controls container, scroll-to-top                 |
| `_shared-keys.css`         | Shared key card, form, and list components                 |
| `_help.css`                | Info tooltip triggers, glossary links, page intro          |
| `_utilities.css`           | Spinners, state containers, code blocks                    |

### Page-Specific Layers

| File                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `_network-status.css` | Network status panel and domain stat grid    |
| `_intro-features.css` | Homepage hero stage, feature cards           |
| `_news.css`           | News timeline, date badges                   |
| `_workers-page.css`   | Worker type sections, domain-colored cards   |
| `_tools-page.css`     | Tool filter bar, view mode toggle            |
| `_leaderboard.css`    | Leaderboard layout, top cards                |
| `_faq.css`            | FAQ accordion, TOC sidebar                   |
| `_style-detail.css`   | Style detail page layout                     |
| `_prose.css`          | Rendered markdown/prose content              |
| `_generate.css`       | Generate "studio" workspace (see note below) |

### Other

| File                     | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `_admin.css`             | Admin-specific layout (sidebar, admin nav)      |
| `_legacy.css`            | Deprecated aliases (migrate away from these)    |
| `_additional_pieces.css` | Third-party overrides, breakpoint media queries |

---

## The `/generate` studio exception

The `/generate` page is a deliberate, approved departure from the shared design
system: it is a focused creation workspace with its own visual language taken
from the interactive design mockup. Its styles still follow the core principle of
living centrally in `src/styles/_generate.css` (component CSS stays empty), but:

- **Scoped, not shared.** Every rule is namespaced under the `.gen-studio`
  page-root class and prefixed `gs-*` (for example `.gs-card`, `.gs-switch`,
  `.gs-tile`). Nothing here is meant for reuse elsewhere, and the `gs-` prefix
  keeps it from colliding with the shared catalog.
- **Its own tokens.** A local `--gs-*` variable set defines the studio palette on
  `.gen-studio` (light) and `.dark .gen-studio` (dark). Prefer these over both raw
  literals and the global tokens when working inside the studio.
- **Self-hosted fonts.** `Inter` / `JetBrains Mono` are declared with `@font-face`
  in `_generate.css` so the download only triggers for text under `.gen-studio`.
- **Tailwind utilities** are still used for layout/spacing inside the studio
  templates (`flex`, `gap-*`, `grid`), same as the rest of the app.

Do not carry `gs-*` classes or the `--gs-*` tokens outside `/generate`, and do not
pull shared component classes into the studio unless a control is intentionally
left in the shared style (e.g. the model autocomplete).

## Naming Conventions

BEM-inspired semantic class names:

```text
.block                  → .card, .alert, .btn
.block--modifier        → .card--interactive, .alert--danger
.block-element          → .card-title, .alert-icon
```

---

## Anti-Patterns

1. **Inline Tailwind on elements** — Use semantic classes (`.alert--danger`) not utility soup (`bg-red-100 border border-red-300 ...`).
2. **Styles in component CSS files** — All component `.css` files must be empty. Styles belong in `src/styles/`.
3. **Duplicating Tailwind utilities** — Don't recreate built-in classes. Use `@apply` in semantic classes instead.
4. **Admin-prefixed duplicates** — Don't create admin-specific versions of shared classes.
5. **Hardcoded color values** — Use theme variables (`var(--color-surface-primary)`) not hex or rgb literals.

---

## Quick Reference

| Need               | Use                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| Page layout        | `.wrapper`, `.section-primary`                                       |
| Card               | `.card` or feature-semantic wrapper over surface primitives          |
| Error/warning      | `.alert--danger`, `.alert--warning`                                  |
| Info note          | `.info-note`, `.info-note--blue`                                     |
| Primary button     | `.btn-primary`                                                       |
| Secondary button   | `.btn-secondary`                                                     |
| Destructive action | `.btn-danger`                                                        |
| Form input         | `.form-input`                                                        |
| Structured form    | Form shell system (see [design-system.md](docs/design-system.md))    |
| Page heading       | `.heading-page-title`                                                |
| Section heading    | `.heading-section`                                                   |
| Loading state      | `.spinner`, `.state-container`                                       |
| Empty state        | `.state-empty`                                                       |
| Skeleton           | `.skeleton-bar`, `.skeleton-box`                                     |
| Modal              | `.modal-overlay`, `.modal-panel`                                     |
| Tooltip            | `.tooltip-wrapper` + `.tooltip-text`                                 |
| Tab bar            | `.details-tabs`, `.details-tab`                                      |
| List row           | `.item-list-row` (2-zone grid)                                       |
| Badge              | `.badge-base` + color variant                                        |
| Domain tinting     | `.domain-tint--image`, `.domain-tint--text`, `.domain-tint--alchemy` |
| Data grid          | `.data-grid-1-2-3`                                                   |
| Scroll reveal      | `.scroll-reveal` + `.scroll-reveal-delay-N`                          |

---

## Further Reading

- **[docs/design-system.md](docs/design-system.md)** — Tokens, surface primitives, glass system, color system, form shells
- **[docs/component-patterns.md](docs/component-patterns.md)** — Full CSS class catalog with usage examples
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical overview: routes, services, data flow, SSR config
