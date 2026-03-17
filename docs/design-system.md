# Design System Reference

This document covers the visual foundation of the AI Horde frontend: design tokens, surface primitives, color system, and form structures. For the higher-level principles and file organization, see [STYLING.md](../STYLING.md). For the CSS class catalog, see [component-patterns.md](component-patterns.md).

- [Design System Reference](#design-system-reference)
    - [Design Ethic: Glassmorphism \& Depth](#design-ethic-glassmorphism--depth)
        - [Guiding Principles](#guiding-principles)
        - [Design Tokens (`_theme.css`)](#design-tokens-_themecss)
    - [Surface Primitives](#surface-primitives)
        - [Preferred Entry Points (in `_cards.css`)](#preferred-entry-points-in-_cardscss)
        - [Glass Modifier Classes (in `_details-tabs.css`)](#glass-modifier-classes-in-_details-tabscss)
        - [Tab Content Panels](#tab-content-panels)
        - [Feature-Semantic Wrappers](#feature-semantic-wrappers)
        - [Writing New Glass Components](#writing-new-glass-components)
        - [Glass Don'ts](#glass-donts)
        - [Surface Inheritance Model](#surface-inheritance-model)
    - [Status Color System](#status-color-system)
        - [Consistency Rules](#consistency-rules)
        - [Identity Colors (Non-Status)](#identity-colors-non-status)
        - [Domain Color Coding](#domain-color-coding)
    - [Section Transitions](#section-transitions)
    - [Hero Glass Stage](#hero-glass-stage)
    - [Shared Form Shell Primitives](#shared-form-shell-primitives)
        - [Form Principles](#form-principles)
        - [Recommended Form Structure](#recommended-form-structure)
    - [Tailwind v4 CSS-First Configuration](#tailwind-v4-css-first-configuration)

---

## Design Ethic: Glassmorphism & Depth

The site uses a glassmorphism-leaning surface system: translucent layers, restrained blur, and soft depth. The goal is hierarchy and polish, not decoration for its own sake.

### Guiding Principles

1. **Use translucency deliberately**: Surfaces should separate layers without making text or controls hard to read.
2. **Let elevation come from blur and layered shadow**: Stronger blur and heavier shadows signal more important surfaces.
3. **Keep borders light**: Prefer translucent borders over heavy outlines.
4. **Design light and dark together**: Every glass surface needs a paired dark-mode treatment.
5. **Prefer hierarchy over novelty**: Stronger treatments belong on modals, popovers, active tabs, and primary panels — not every element.

### Design Tokens (`_theme.css`)

```css
/* Glass surfaces */
--color-glass-surface: rgb(255 255 255 / 0.6);
--color-glass-surface-elevated: rgb(255 255 255 / 0.75);
--color-glass-surface-heavy: rgb(255 255 255 / 0.85);
--color-glass-border: rgb(255 255 255 / 0.35);
--color-glass-border-subtle: rgb(255 255 255 / 0.18);
--color-glass-highlight: rgb(255 255 255 / 0.5);

/* Blur radii */
--blur-glass-sm: 8px;   /* Inline elements, badges, stat boxes */
--blur-glass-md: 16px;  /* Cards, panels, tab bars */
--blur-glass-lg: 24px;  /* Modals, overlays */

/* Layered shadows */
--shadow-glass:          /* Base resting state */
--shadow-glass-hover:    /* Hovered / interactive state */
--shadow-glass-elevated: /* Modals, popovers, high-elevation */
--shadow-glass-inset:    /* Inner top highlight for extra depth */

/* Focus rings */
--shadow-focus-blue: 0 0 0 3px color-mix(in srgb, var(--color-brand-blue) 30%, transparent);
--shadow-focus-purple: 0 0 0 3px color-mix(in srgb, var(--color-brand-purple) 30%, transparent);

/* Transition tokens */
--transition-fast: 150ms;
--transition-normal: 200ms;
--transition-slow: 300ms;
```

All tokens are defined in `src/styles/_theme.css` using Tailwind v4's `@theme` directive.

---

## Surface Primitives

### Preferred Entry Points (in `_cards.css`)

| Class | Purpose | Blur |
|-------|---------|------|
| `.surface-glass` | Shared frosted base for section-level surfaces | `sm` |
| `.surface-glass--elevated` | Stronger glass surface for more prominent containers | `sm` |
| `.surface-glass--nested` | Inner field/group surface without blur | `none` |
| `.surface-glass--subtle` | Nested panel surface for secondary containment | `none` |
| `.surface-glass--hero` | Gradient hero-stage glass surface | `md` |
| `.surface-glass--accent` | Gradient accent surface for intro/identity panels | `inherited` |
| `.surface-floating` | Shared floating panel surface for menus and popovers | `md` |

Start from these when building new surfaces. Layer a feature-semantic class on top for domain meaning.

### Glass Modifier Classes (in `_details-tabs.css`)

| Class | Purpose |
|-------|---------|
| `.details-tabs--glass` | Frosted glass tab bar |
| `.details-tabs--connected` | Removes bottom margin & radius so tab bar joins panel |
| `.details-summary--glass` | Frosted summary stat block |

### Tab Content Panels

| Class | Purpose |
|-------|---------|
| `.tab-content-panel` | Glass container below major tabs — "folder tab" effect |
| `.tab-sub-panel` | Nested glass-bordered panel wrapping sub-tab content |
| `.details-toolbar` | Sticky glass action bar for non-tab controls |

### Feature-Semantic Wrappers

These remain valid template-facing APIs. Use the feature name when correct, but build on top of the primitive stack:

- **Layout/containers**: `.card`, `.panel`, `.modal-panel`, `.tab-content-panel`, `.tab-sub-panel`, `.details-toolbar`
- **Messaging/emphasis**: `.callout`, `.callout-accent`, `.callout-info`, `.warning-banner`, `.info-box`
- **Homepage/promo**: `.hero-glass-stage`, `.intro-feature-card`, `.intro-link-badge`, `.beginner-banner`
- **Data/list**: `.data-item-box`, `.item-list-row`, `.network-status-panel`, `.team-card`
- **Floating/nav**: `.nav-shell`, `.filter-autocomplete-dropdown`

### Writing New Glass Components

Compose a semantic wrapper over an existing primitive. Only add a new material definition when no existing primitive fits.

```css
.my-surface {
  border-radius: 1rem;
  padding: 1rem;
}
```

### Glass Don'ts

- Don't stack blur on nested surfaces without clear reason.
- Don't use `blur(24px)` for normal cards — reserve it for overlays.
- Don't skip `-webkit-backdrop-filter`.
- Don't keep translucency if it hurts readability or contrast.
- Don't apply glass treatment to tiny controls just because it's available.

### Surface Inheritance Model

Three layers:

1. **Tokens** (`_theme.css`) — glass opacity, borders, gradient endpoints, shadow depth.
2. **Shared primitives** (`_cards.css`, `_forms.css`) — reusable surface roles: `.surface-glass`, `.surface-glass--nested`, `.form-section-shell`.
3. **Feature-semantic classes** — `.shared-key-form-panel`, `.hero-glass-stage`, `.tab-content-panel`. Only add domain meaning or local layout.

Feature classes should not invent new glass values when an existing primitive matches. If a new treatment is needed, add or adjust the token and primitive layer first.

---

## Status Color System

| Status | Color Family | Usage |
|--------|-------------|-------|
| Danger | `red-*` | Errors, destructive actions, critical alerts |
| Warning | `amber-*` | Caution, pending actions, maintenance states |
| Info | `blue-*` | Informational content, neutral highlights |
| Success | `green-*` | Completed actions, healthy states, confirmations |

### Consistency Rules

1. **Alerts** (`_alerts.css`): `.alert--danger` = red, `.alert--warning` = amber, `.alert--info` = blue, `.alert--success` = green
2. **Badges** (`_badges.css`): Same color mapping.
3. **Worker indicators** (`_data-display.css`): Same families — red for errors, green for healthy, amber for warnings.

### Identity Colors (Non-Status)

- **Domain identities**: purple = image, blue = text, green = alchemy
- **Brand accents**: purple = kudos/premium, indigo = secondary brand
- **Categorical badges**: teal, pink, orange for tagging without status connotation

### Domain Color Coding

| Domain | Color | CSS Classes |
|--------|-------|-------------|
| Image generation (Dreamers) | Purple | `.domain-tint--image`, `.domain-label--image` |
| Text generation (Scribes) | Blue | `.domain-tint--text`, `.domain-label--text` |
| Alchemy (Alchemists) | Green | `.domain-tint--alchemy`, `.domain-label--alchemy` |

Domain tinting: subtle left-border accent plus soft gradient background, not full-surface color.

Rules:
1. Keep domain tinting light — preserve text contrast.
2. Apply consistently across cards, labels, and badges.
3. Pair color cues with text (don't rely on color alone).
4. Use `.domain-tint--combined` (red) for multi-domain cards.

---

## Section Transitions

The page alternates between `.section-primary` and `.section-secondary`. Keep transitions subtle in light mode and more pronounced in dark mode.

---

## Hero Glass Stage

`.hero-glass-stage` is for hero or orientation surfaces, not routine content blocks. Use sparingly:

```css
.hero-glass-stage {
  background: linear-gradient(135deg, rgb(255 255 255 / 0.55), rgb(249 250 251 / 0.4));
  backdrop-filter: blur(var(--blur-glass-md));
  border: 1px solid var(--color-glass-border);
  box-shadow: var(--shadow-glass), var(--shadow-glass-inset);
}
```

---

## Shared Form Shell Primitives

| Class | Purpose |
|-------|---------|
| `.form-section-shell` | Outer section container for a grouped decision area |
| `.form-section-shell__header` | Header stack: eyebrow, title, framing copy |
| `.form-section-shell__grid` | Responsive field grid inside a section |
| `.form-field-shell` | Inner grouped field container |
| `.form-field-shell--full` | Full-width field card spanning the grid |
| `.form-field-shell__header` | Label + state badge row |
| `.form-field-shell__footer` | Helper text + secondary control row |
| `.form-field-shell__footer--stacked` | Footer variant for presets |
| `.form-field-shell__footer-row` | Single row inside a stacked footer |
| `.form-state-badge` | Small status badge for contextual field states |
| `.form-actions-bar` | Closing actions row with helper copy and buttons |

### Form Principles

1. Group fields by decision, not by data type.
2. Give each section a visible container and short framing text.
3. Keep section containers visually stronger than field containers.
4. Keep helper text attached to the control it explains.
5. Represent states with explicit labels/badges, not hidden conventions.
6. Use presets only where they materially reduce decision cost.
7. End forms with a clear review-and-act zone.

### Recommended Form Structure

```html
<form class="domain-form">
  <section class="form-section form-section--intro">
    <div class="form-section__header">
      <p class="form-section__eyebrow">Section</p>
      <h4 class="section-title-sm">Form title</h4>
      <p class="text-secondary text-sm">Short framing copy.</p>
    </div>
    <div class="form-group-card form-group-card--full">
      <!-- primary identity or context field -->
    </div>
  </section>

  <section class="form-section">
    <div class="form-section__header">
      <h5 class="section-title-sm">Decision group</h5>
      <p class="text-secondary text-sm">Explain the tradeoff.</p>
    </div>
    <div class="form-section__grid">
      <div class="form-group-card">
        <label class="form-label">Field</label>
        <input class="form-input" type="number" />
        <div class="form-group-card__footer">
          <p class="text-secondary text-xs">Helper text.</p>
        </div>
      </div>
    </div>
  </section>

  <div class="form-review-bar">
    <!-- helper summary + primary action -->
  </div>
</form>
```

---

## Tailwind v4 CSS-First Configuration

Theme tokens are defined in CSS using `@theme`, not a JavaScript config:

```css
@theme {
  --color-brand-blue: #1d4ed8;
  --color-surface-primary: rgb(255 255 255);
}
```

Components use `@layer components`. Custom utilities use `@utility`.

Reference tokens via CSS variables:

```css
.my-component {
  background-color: var(--color-surface-primary);
}
```

Or use auto-generated Tailwind utilities:

```html
<div class="bg-surface-primary border-edge-primary shadow-card"></div>
```
