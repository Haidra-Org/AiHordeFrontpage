# CSS Component Patterns — AiHordeFrontpage

> **Shared primitives**: The base CSS class catalog (buttons, badges, alerts, forms, modals, cards, typography, tables, tabs, tooltips, data display) is documented in the [shared design system](../src/shared/design-system/docs/component-patterns.md). This document covers the **full class inventory** as consumed by AiHordeFrontpage, including project-specific extensions and overrides.

Class catalog for the AI Horde frontend. For design philosophy, tokens, and surface primitives, see [design-system.md](design-system.md). For high-level rules and file organization, see [STYLING.md](../STYLING.md).

- [CSS Component Patterns](#css-component-patterns)
  - [Cards (`_cards.css`)](#cards-_cardscss)
  - [Alerts (`_alerts.css`)](#alerts-_alertscss)
  - [Buttons (`_buttons.css`)](#buttons-_buttonscss)
  - [Headings (`_typography-headings.css`)](#headings-_typography-headingscss)
  - [Typography (`_typography-text.css`)](#typography-_typography-textcss)
  - [Forms (`_forms.css`)](#forms-_formscss)
  - [Modals (`_modals.css`)](#modals-_modalscss)
  - [Badges (`_badges.css`)](#badges-_badgescss)
    - [Base](#base)
    - [Color Variants](#color-variants)
    - [Special Badges](#special-badges)
  - [Tab System (`_details-tabs.css`)](#tab-system-_details-tabscss)
    - [Primary Tab Bar](#primary-tab-bar)
    - [Sub-Tabs](#sub-tabs)
    - [Scroll Arrows](#scroll-arrows)
  - [Table \& List Rows (`_tables.css`)](#table--list-rows-_tablescss)
  - [Tooltip System (`_tooltips.css`)](#tooltip-system-_tooltipscss)
    - [Classes](#classes)
    - [Position Variants](#position-variants)
    - [Fixed-Position Mode](#fixed-position-mode)
    - [Text Utilities](#text-utilities)
    - [Touch Tooltip](#touch-tooltip)
    - [Usage](#usage)
  - [Collapsible \& Accordion System (`_collapsibles.css`)](#collapsible--accordion-system-_collapsiblescss)
    - [Card-Style Collapsible](#card-style-collapsible)
    - [Sticky Section Header](#sticky-section-header)
    - [Expanded Detail Panel](#expanded-detail-panel)
  - [Data Display (`_data-display.css`)](#data-display-_data-displaycss)
    - [Stat Columns](#stat-columns)
    - [Data Item Boxes](#data-item-boxes)
    - [Responsive Data Grids](#responsive-data-grids)
    - [Domain Tinting](#domain-tinting)
    - [Skeleton Loading](#skeleton-loading)
  - [Loading \& Empty States (`_utilities.css`)](#loading--empty-states-_utilitiescss)
  - [Animation \& Motion](#animation--motion)
    - [Scroll Reveal (`_base.css`)](#scroll-reveal-_basecss)
    - [Keyframe Inventory](#keyframe-inventory)
    - [Easing Convention](#easing-convention)
    - [Reduced Motion](#reduced-motion)
  - [Icon System](#icon-system)
    - [Sizing](#sizing)
    - [SVG Color](#svg-color)
    - [Tooltip Trigger (`_help.css`)](#tooltip-trigger-_helpcss)
    - [Glossary Links](#glossary-links)
  - [Responsive Design](#responsive-design)
    - [Breakpoints](#breakpoints)
    - [Fluid Typography](#fluid-typography)
    - [Sticky Header Management](#sticky-header-management)
  - [Accessibility Patterns](#accessibility-patterns)
    - [Focus Rings](#focus-rings)
    - [Screen Reader](#screen-reader)
    - [Keyboard Navigation](#keyboard-navigation)
    - [Modal Accessibility](#modal-accessibility)
    - [Color Contrast](#color-contrast)

---

## Cards (`_cards.css`)

```css
.card                   /* Base card container */
.card--interactive      /* Hoverable/clickable card */
.card-title             /* Card heading */
.card-content           /* Card body content */
.card-footer            /* Card footer area */
```

`card-bg-primary`, `panel`, and similar wrappers exist for compatibility. Prefer feature-semantic classes inheriting from surface primitives for new UI.

---

## Alerts (`_alerts.css`)

```css
.alert                  /* Base alert container */
.alert--danger          /* Red error/danger alert */
.alert--warning         /* Yellow/amber warning alert */
.alert--info            /* Blue informational alert */
.alert--success         /* Green success alert */
.alert-icon             /* Icon container */
.alert-content          /* Text content area */
```

Info notes:

```css
.info-note              /* Contextual info box */
.info-note--blue        /* Blue variant */
.info-note--orange      /* Orange variant */
.info-note--padded      /* Extra padding */
```

---

## Buttons (`_buttons.css`)

```css
.btn-primary            /* Blue branded button */
.btn-purple             /* Purple branded button */
.btn-secondary          /* Gray secondary button */
.btn-danger             /* Red destructive button */
.btn-warning            /* Yellow cautionary button */
.btn-muted              /* Gray tertiary button */
.btn-icon               /* Icon-only button */
.btn-sm                 /* Small size modifier */
.btn-xs                 /* Extra-small size modifier */
.btn-group              /* Responsive button row */
.btn-group--center      /* Centered button group */
```

---

## Headings (`_typography-headings.css`)

```css
.heading-hero           /* h1 hero text (responsive 4xl→6xl) */
.heading-page-title     /* Page title with margin */
.heading-section        /* h2 section heading */
.heading-card           /* h3 card heading */
.heading-item           /* List item heading */
```

---

## Typography (`_typography-text.css`)

```css
.text-lead              /* Large emphasized body text */
.checkmark-list         /* Flex container for inline checkmarks */
.checkmark-item         /* Green checkmark + text item */
.card-inline-title      /* Card title (inline with icon) */
.card-inline-description /* Card subtitle */
```

---

## Forms (`_forms.css`)

```css
.form-label             /* Input label */
.form-input             /* Text input field */
.form-hint              /* Help text below input */
.form-field             /* Field container with gap */
.form-row               /* Horizontal row of fields */
.form-actions           /* Button row at form bottom */
```

For structured configuration forms, see the form shell system in [design-system.md](design-system.md#shared-form-shell-primitives).

---

## Modals (`_modals.css`)

```css
.modal-overlay          /* Full-screen backdrop */
.modal-panel            /* Dialog container */
.modal-actions          /* Button row in modal */
```

---

## Badges (`_badges.css`)

### Base

```css
.badge-base             /* inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium */
.badge-sm               /* Compact: px-2 py-0.5 */
.badge-container        /* Flex wrap gap-2 for badge groups */
```

### Color Variants

| Class              | Color  | Usage                  |
| ------------------ | ------ | ---------------------- |
| `.badge-primary`   | Blue   | Brand / default        |
| `.badge-secondary` | Gray   | Neutral / deemphasized |
| `.badge-info`      | Blue   | Informational          |
| `.badge-warning`   | Amber  | Caution                |
| `.badge-success`   | Green  | Positive / healthy     |
| `.badge-danger`    | Red    | Error / destructive    |
| `.badge-purple`    | Purple | Brand accent / kudos   |
| `.badge-pink`      | Pink   | Alternative accent     |
| `.badge-indigo`    | Indigo | Secondary brand        |
| `.badge-teal`      | Teal   | Categorical            |

### Special Badges

```css
.badge-recommended      /* Gold/yellow with star treatment */
.badge-easy-to-use      /* Green with border, beginner-friendly */
.badge-online           /* Green with pulsing dot */
.badge-outline          /* Transparent bg, gray border */
.badge-dismissible      /* Interactive, removable */
```

---

## Tab System (`_details-tabs.css`)

### Primary Tab Bar

```css
.details-tabs           /* Sticky flex container with horizontal scroll */
.details-tab            /* Individual tab button */
.details-tab-active     /* Active state: purple border, font-weight 600 */
```

### Sub-Tabs

```css
.details-tabs--sub      /* Lighter 1px border, smaller font */
```

### Scroll Arrows

```css
.details-tabs-arrow     /* Sticky left/right scroll button */
.details-tabs-arrow.is-visible  /* Visible state */
```

---

## Table & List Rows (`_tables.css`)

Two-zone grid layout: content (left) and actions (right).

```css
.item-list-row          /* 2-zone grid: grid-template-columns: 1fr auto */
.table-cell-content     /* Left content zone */
.table-cell-title       /* Row title (truncated) */
.table-cell-description /* 2-line clamped description */
.table-cell-actions     /* Right actions zone */
.table-item-recommended /* Yellow accent for featured items */
```

---

## Tooltip System (`_tooltips.css`)

### Classes

```css
.tooltip-wrapper        /* Trigger container (position: relative) */
.dotted-underline       /* Dotted border-bottom hover hint */
.tooltip-text           /* Tooltip bubble (hidden by default) */
```

### Position Variants

```css
.tooltip-pos-left       /* Left-aligned */
.tooltip-pos-right      /* Right-aligned */
.tooltip-pos-bottom     /* Below trigger */
```

### Fixed-Position Mode

`.tooltip-fixed-mode` + `.tooltip-text-fixed` for escaping parent `overflow: hidden`. Position is set via JS; CSS controls appearance only.

### Text Utilities

```css
.tooltip-highlight      /* Brand blue emphasis */
.tooltip-code           /* Purple monospace */
.tooltip-muted          /* Secondary italic */
.tooltip-math           /* Purple monospace for equations */
```

### Touch Tooltip

`[appTouchTooltip]` directive with Popover API:

```css
.touch-tooltip          /* Fixed-position, width: max-content */
.touch-tooltip-title    /* Bold title line */
.touch-tooltip-desc     /* Secondary description */
```

### Usage

```html
<span class="tooltip-wrapper" tabindex="0">
  <span class="dotted-underline">hover text</span>
  <span class="tooltip-text">Tooltip content here</span>
</span>
```

---

## Collapsible & Accordion System (`_collapsibles.css`)

### Card-Style Collapsible

```css
.collapsible-card           /* Glass-surface wrapper */
.collapsible-header-button  /* Non-sticky trigger button */
.collapsible-header-icon    /* Chevron icon container */
```

### Sticky Section Header

```css
.section-header-collapsible         /* Sticky at var(--sticky-offset, 80px) */
.section-header-collapsible--light  /* Less prominent dark mode tint */
```

### Expanded Detail Panel

```css
.expanded-detail-panel  /* Content revealed when row is expanded */
.expanded-detail-grid   /* Responsive grid inside expanded area */
```

---

## Data Display (`_data-display.css`)

### Stat Columns

```css
.stat-column            /* Padded glass card for stats */
.stat-item              /* Icon + text row */
.stat-text              /* Body text in stat items */
.stat-text-label        /* Label within stat text */
```

### Data Item Boxes

```css
.data-item-box          /* Glass surface for key-value pairs */
.data-label             /* Label text */
.data-value             /* Value text */
.data-value-lg          /* Prominent stat (text-2xl) */
.data-value-xl          /* Hero stat (text-4xl) */
.data-value-split       /* Stacked metric pairs */
```

### Responsive Data Grids

| Class              | Columns                                     |
| ------------------ | ------------------------------------------- |
| `.data-grid-2`     | `grid-cols-2`                               |
| `.data-grid-2-3`   | `grid-cols-2 lg:grid-cols-3`                |
| `.data-grid-1-2`   | `grid-cols-1 sm:grid-cols-2`                |
| `.data-grid-1-2-3` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| `.data-grid-2-4`   | `grid-cols-2 md:grid-cols-4`                |

### Domain Tinting

```css
.domain-tint--image     /* Purple */
.domain-tint--text      /* Blue */
.domain-tint--alchemy   /* Green */
.domain-tint--combined  /* Red */
.domain-label--*        /* Inline text color per domain */
```

### Skeleton Loading

```css
.skeleton-bar           /* Animated placeholder bar */
.skeleton-bar-sm        /* 40% width */
.skeleton-bar-md        /* 60% width */
.skeleton-bar-lg        /* 70% width */
.skeleton-box           /* Container for skeleton groups */
.skeleton-box-dashed    /* Dashed border "missing" state */
```

---

## Loading & Empty States (`_utilities.css`)

```css
.spinner                /* Border-based rotating spinner */
.spinner-sm / -md / -lg /* Size variants */
.state-container        /* Centered flex column */
.state-container-sm     /* Compact variant */
.state-empty            /* Minimal empty state */
.state-icon / -lg       /* State icons */
.state-error            /* Red text */
.state-muted            /* Gray text */
```

---

## Animation & Motion

### Scroll Reveal (`_base.css`)

```css
.scroll-reveal          /* Initial hidden state: opacity 0, translateY */
.scroll-reveal--visible /* Revealed state */
.scroll-reveal-delay-1 through -6  /* 70ms increments for stagger */
```

### Keyframe Inventory

| Keyframe              | Duration | Usage                   |
| --------------------- | -------- | ----------------------- |
| `pulse`               | 2s       | Online badges, loading  |
| `fadeIn`              | —        | Element appearance      |
| `slideDown`           | —        | Expanded content        |
| `heroEntrance`        | 0.7s     | Homepage hero           |
| `featureCardEntrance` | 0.5s     | Staggered feature cards |
| `btn-shake`           | 0.35s    | Button error feedback   |
| `toast-slide-in`      | 300ms    | Toast notifications     |
| `skeleton-pulse`      | 1.4s     | Skeleton loading        |
| `faq-highlight-fade`  | 2.5s     | FAQ jump highlight      |

### Easing Convention

- Entrance animations: `cubic-bezier(0.22, 1, 0.36, 1)`
- Standard transitions: `ease` with `--transition-fast/normal/slow`

### Reduced Motion

All animations respect `@media (prefers-reduced-motion: reduce)`. Content is shown immediately without transitions.

---

## Icon System

### Sizing

```css
.icon-sm                /* shrink-0 w-4 h-4 mt-0.5 — inline hints */
.icon-md                /* shrink-0 w-5 h-5 — buttons/toggles */
```

### SVG Color

Use `fill="currentColor"` or `stroke="currentColor"` so icons inherit text color and respond to dark mode.

### Tooltip Trigger (`_help.css`)

```css
.info-tooltip-trigger   /* inline-flex, cursor: help */
.info-tooltip-icon      /* w-4 h-4, hover: brand-blue */
```

### Glossary Links

```css
a.glossary-link         /* Dotted underline, purple text; hover: solid, blue */
```

---

## Responsive Design

### Breakpoints

| Token              | Width  | Purpose                  |
| ------------------ | ------ | ------------------------ |
| `sm`               | 640px  | Large phones             |
| `md`               | 768px  | Tablets                  |
| `lg`               | 1024px | Desktops                 |
| `xl`               | 1280px | Large desktops           |
| `2xl`              | 1536px | Extra-large              |
| `--breakpoint-nav` | 1249px | Navigation layout switch |

Mobile-first: all responsive styles use `@media (min-width: …)`.

### Fluid Typography

```css
font-size: clamp(0.75rem, 1.4vw, 0.9375rem); /* Body */
font-size: clamp(0.6875rem, 1.2vw, 0.875rem); /* Sub-tabs */
```

### Sticky Header Management

`StickyRegistryService` manages `--sticky-offset` (default 80px). Multiple sticky elements read this property for `top` and `scroll-margin-top`.

---

## Accessibility Patterns

### Focus Rings

Interactive elements use `box-shadow` focus rings:

- Links / informational: `--shadow-focus-blue`
- Buttons / brand: `--shadow-focus-purple`

### Screen Reader

```css
.sr-only  /* Visually hidden but accessible */
```

### Keyboard Navigation

- Tooltips: visible on `:focus-within`
- Collapsibles: keyboard-focusable triggers
- Dropdowns: arrow key navigation
- Tab bars: standard tab/arrow key patterns

### Modal Accessibility

- `role="dialog"` and `aria-modal="true"`
- `aria-labelledby` pointing to the title
- Focus trap while open
- Focus restoration on close

### Color Contrast

All badge, alert, and status variants meet WCAG AA 4.5:1 contrast ratio. Test dark mode after changing translucent surfaces.
