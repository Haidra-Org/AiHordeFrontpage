# Design System Reference — AiHordeFrontpage

> **The shared system owns the foundation.** The design ethic, the token reference, the surface primitives, the status
> colour system, the form primitives, the accessibility floor and the Tailwind v4 `@theme` configuration are documented
> in the [shared design system](../src/shared/design-system/docs/design-system.md), including the split between the
> glass family and the HD family. This file covers only what is specific to AiHordeFrontpage. For which family to use,
> see [STYLING.md](../STYLING.md); for the frontpage class catalog, see [component-patterns.md](component-patterns.md).

Everything below is a glass-family extension. New surfaces go on HD, where the tokens and primitives are the shared
ones and there is nothing project-specific to document: `src/styles/_models.css` is the worked example.

- [Project tokens (`_theme.css`)](#project-tokens-_themecss)
- [Surface entry points](#surface-entry-points)
- [Domain colour coding](#domain-colour-coding)
- [Section transitions](#section-transitions)
- [Hero glass stage](#hero-glass-stage)
- [Form shell primitives](#form-shell-primitives)

---

## Project tokens (`_theme.css`)

The shared token file carries the colour scales, the glass surfaces and the spacing, radius, shadow and transition
scales. `src/styles/_theme.css` adds what only this site needs, all through Tailwind v4's `@theme` directive:

| Group                  | Names                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Brand                  | `--color-brand-purple`, `--color-brand-blue`, and their `-hover` pairs                                      |
| Content, surface, edge | `--color-content-*`, `--color-surface-*`, `--color-edge-*`                                                  |
| Compatibility aliases  | `--color-text-*`, `--color-bg-*`, `--color-border-*`                                                        |
| Status pairs           | `--color-success-*`, `--color-warning-*`, `--color-danger-*`, `--color-info-*` as bg, text, border and icon |
| Extra scales           | `--color-blue-*`, `--color-purple-*`, `--color-green-*` at 50–900                                           |
| Focus rings            | `--shadow-focus-blue`, `--shadow-focus-purple`, and their `-dark` pairs                                     |

Read tokens with `var()`, or through the Tailwind utilities the `@theme` names generate. Never a literal.

---

## Surface entry points

Start from a shared primitive and layer a feature-semantic class on top for domain meaning.

| Class                      | Purpose                                               | Blur        |
| -------------------------- | ----------------------------------------------------- | ----------- |
| `.surface-glass`           | Shared frosted base for section-level surfaces        | `sm`        |
| `.surface-glass--elevated` | Stronger glass for more prominent containers          | `sm`        |
| `.surface-glass--nested`   | Inner field or group surface without blur             | `none`      |
| `.surface-glass--subtle`   | Nested panel surface for secondary containment        | `none`      |
| `.surface-glass--hero`     | Gradient hero-stage glass surface                     | `md`        |
| `.surface-glass--accent`   | Gradient accent surface for intro and identity panels | `inherited` |
| `.surface-floating`        | Floating panel surface for menus and popovers         | `md`        |

Frontpage modifiers on top of them, in `_details-tabs.css`:

| Class                      | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `.details-tabs--glass`     | Frosted glass tab bar                                         |
| `.details-tabs--connected` | Drops the bottom margin and radius so the bar joins the panel |
| `.details-summary--glass`  | Frosted summary stat block                                    |
| `.tab-content-panel`       | Glass container below major tabs, the folder-tab effect       |
| `.tab-sub-panel`           | Nested glass-bordered panel around sub-tab content            |
| `.details-toolbar`         | Sticky glass action bar for non-tab controls                  |

**Feature-semantic wrappers.** These stay valid template-facing names. Use the feature name where it is the true one,
but build it on a primitive rather than on new glass values.

- Layout and containers: `.card`, `.panel`, `.modal-panel`, `.tab-content-panel`, `.tab-sub-panel`, `.details-toolbar`
- Messaging and emphasis: `.callout`, `.callout-accent`, `.callout-info`, `.warning-banner`, `.info-box`
- Homepage and promo: `.hero-glass-stage`, `.intro-feature-card`, `.intro-link-badge`, `.beginner-banner`
- Data and list: `.data-item-box`, `.item-list-row`, `.network-status-panel`, `.team-card`
- Floating and nav: `.nav-shell`, `.filter-autocomplete-dropdown`

A feature class must not invent a glass value when a primitive matches. If a genuinely new treatment is needed, adjust
the token and primitive layer in the submodule first. The shared doc's glass don'ts and inheritance model apply here
unchanged.

---

## Domain colour coding

Identity colours for the three kinds of work. These are frontpage-only.

| Domain                      | Colour | Classes                                           |
| --------------------------- | ------ | ------------------------------------------------- |
| Image generation (Dreamers) | Purple | `.domain-tint--image`, `.domain-label--image`     |
| Text generation (Scribes)   | Blue   | `.domain-tint--text`, `.domain-label--text`       |
| Alchemy (Alchemists)        | Green  | `.domain-tint--alchemy`, `.domain-label--alchemy` |

Domain tinting is a subtle left-border accent plus a soft gradient background, never a full-surface colour. Keep the
tint light enough to preserve text contrast, apply it consistently across cards, labels and badges, and always pair the
colour with a word. Use `.domain-tint--combined` for a card that covers more than one domain.

The status colour system (danger, warning, info, success) is shared; see the submodule doc.

---

## Section transitions

The page alternates between `.section-primary` and `.section-secondary`. Keep the transition subtle in light mode and
more pronounced in dark.

---

## Hero glass stage

`.hero-glass-stage` is for hero and orientation surfaces, not routine content blocks. Use it sparingly: a gradient over
`--blur-glass-md`, a glass border, and the base glass shadow with its inset highlight.

---

## Form shell primitives

The shared system provides the controls (`.form-input`, `.form-label`, `.form-hint` and the rest). The shells that
group them are frontpage-only.

| Class                                | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `.form-section-shell`                | Outer container for a grouped decision area         |
| `.form-section-shell__header`        | Header stack: eyebrow, title, framing copy          |
| `.form-section-shell__grid`          | Responsive field grid inside a section              |
| `.form-field-shell`                  | Inner grouped field container                       |
| `.form-field-shell--full`            | Full-width field card spanning the grid             |
| `.form-field-shell__header`          | Label and state badge row                           |
| `.form-field-shell__footer`          | Helper text and secondary control row               |
| `.form-field-shell__footer--stacked` | Stacked footer variant, with `__footer-row` per row |
| `.form-state-badge`                  | Small status badge for a contextual field state     |
| `.form-actions-bar`                  | Closing actions row with helper copy and buttons    |

Group fields by decision rather than by data type. Give each section a visible container and one line of framing copy,
keep the section container visually stronger than the field containers inside it, keep helper text attached to the
control it explains, say a state in words rather than by convention, and end the form with a clear review-and-act zone.
