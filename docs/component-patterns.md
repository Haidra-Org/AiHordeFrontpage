# CSS Component Patterns — AiHordeFrontpage

> **The shared catalog is the reference.** Every base class of both families, glass (`.btn`, `.card`, `.badge`,
> `.surface-glass*`) and HD (`.hd-*`), is documented in the
> [shared design system](../src/shared/design-system/docs/component-patterns.md). This file lists only what AiHordeFrontpage adds on
> top: project-specific extensions, page systems and conventions. A class not named here is in the shared catalog.

New surfaces are built on the HD family; see [STYLING.md](../STYLING.md) for the decision rule, and
`src/styles/_models.css` for a page built that way. Everything below is glass-family or page-level. For frontpage
tokens, surfaces and form shells, see [design-system.md](design-system.md).

- [Cards (`_cards.css`)](#cards-_cardscss)
- [Alerts and info notes (`_alerts.css`)](#alerts-and-info-notes-_alertscss)
- [Buttons (`_buttons.css`)](#buttons-_buttonscss)
- [Headings (`_typography-headings.css`)](#headings-_typography-headingscss)
- [Typography (`_typography-text.css`)](#typography-_typography-textcss)
- [Forms (`_forms.css`)](#forms-_formscss)
- [Badges (`_badges.css`)](#badges-_badgescss)
- [Tab system (`_details-tabs.css`)](#tab-system-_details-tabscss)
- [Table and list rows (`_tables.css`)](#table-and-list-rows-_tablescss)
- [Tooltip extensions (`_tooltips.css`)](#tooltip-extensions-_tooltipscss)
- [Collapsible and accordion system (`_collapsibles.css`)](#collapsible-and-accordion-system-_collapsiblescss)
- [Data display (`_data-display.css`)](#data-display-_data-displaycss)
- [Model list (`_models.css`)](#model-list-_modelscss)
- [Loading and empty states (`_utilities.css`)](#loading-and-empty-states-_utilitiescss)
- [Animation and motion](#animation-and-motion)
- [Icon system](#icon-system)
- [Responsive design](#responsive-design)
- [Accessibility patterns](#accessibility-patterns)

---

## Cards (`_cards.css`)

The card structure (`.card`, `.card-header`, `.card-body`, `.card-footer`) is shared. The frontpage overrides its
rounding, layout and border token for the homepage cards, and adds:

- `.card--interactive` for a hoverable or clickable card, `.card-title` and `.card-content`.
- `.danger-zone-card`, the red-tinted surface for a group of destructive actions. Used by the profile settings page and
  by `/generate/storage`; a third destructive surface reuses it rather than tinting a card of its own.

`card-bg-primary`, `panel` and similar wrappers exist for compatibility. Prefer a feature-semantic class over a surface
primitive for new glass UI.

---

## Alerts and info notes (`_alerts.css`)

`.alert` and its four semantic variants, plus `.alert-icon` and `.alert-content`, are shared. The frontpage adds the
quieter contextual box:

```css
.info-note              /* Contextual info box */
.info-note--blue        /* Blue variant */
.info-note--orange      /* Orange variant */
.info-note--padded      /* Extra padding */
```

---

## Buttons (`_buttons.css`)

`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`, `.btn-sm` and `.btn-lg` are shared. The
frontpage adds:

```css
.btn-purple             /* Purple branded button */
.btn-warning            /* Yellow cautionary button */
.btn-muted              /* Gray tertiary button */
.btn-icon               /* Icon-only button */
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

`.form-label`, `.form-input`, `.form-textarea`, `.form-select`, `.form-hint`, `.form-error` and the checkbox classes
are shared. The frontpage adds the layout around them:

```css
.form-field             /* Field container with gap */
.form-row               /* Horizontal row of fields */
.form-actions           /* Button row at form bottom */
```

For structured configuration forms, see the form shell system in
[design-system.md](design-system.md#form-shell-primitives). Modals are shared in full; see the shared catalog.

---

## Badges (`_badges.css`)

The base (`.badge`, `.badge-base`, `.badge-sm`, `.badge-container`) and the status variants (`.badge-primary`,
`.badge-secondary`, `.badge-info`, `.badge-warning`, `.badge-success`, `.badge-danger`) are shared. The frontpage adds
the non-status accents `.badge-purple`, `.badge-pink`, `.badge-indigo` and `.badge-teal`, and the special badges below.

### Special Badges

```css
.badge-recommended      /* Gold/yellow with star treatment */
.badge-easy-to-use      /* Green with border, beginner-friendly */
.badge-online           /* Green with pulsing dot */
.badge-outline          /* Transparent bg, gray border */
.badge-dismissible      /* Interactive, removable */
```

---

## Tab system (`_details-tabs.css`)

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

## Table and list rows (`_tables.css`)

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

## Tooltip extensions (`_tooltips.css`)

`.tooltip-wrapper`, `.dotted-underline`, `.tooltip-text` and the single-axis position variants are shared. The
frontpage adds combined positions, a fixed-position mode, text utilities inside a tooltip, and the touch variant.

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

## Collapsible and accordion system (`_collapsibles.css`)

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

## Data display (`_data-display.css`)

`.stat-column`, `.stat-item`, `.data-item-box`, `.data-label`, `.data-value` and the responsive `.data-grid-*` classes
are shared. The frontpage adds domain tinting and the skeleton set.

### Domain Tinting

```css
.domain-tint--image     /* Purple */
.domain-tint--text      /* Blue */
.domain-tint--alchemy   /* Green */
.domain-tint--combined  /* Red */
.domain-label--*        /* Inline text color per domain */
```

### Worker Card Layout

The worker card keeps the type in the top bar icon, which has the type as its accessible name, so there is no Worker Type
row. Info is listed only when set, or when the viewer can set it. Bridge Agent and Software Contact share one line.

```css
.worker-card-bridge         /* The agent name and version; linked to the contact when it is an http(s) address */
.worker-card-bridge-contact /* A contact that is not a web address, as a muted line under the name */
.worker-card-stats          /* The counters as a two-column <dl> grid */
.worker-card-stat           /* One counter tile, label above value */
```

Below 900px, `.worker-card-body--sticky-mobile` pins the card's name under the page's sticky bars at z-index 10, under
the worker type tabs (z-index 20), so a header that leaves with the end of its card passes under them. On the workers
list, `::before`/`::after` squares (page colour outside the corner curve) fill a pinned header's rounded top corners.
The space beside it is left clear for the section rail. Below 640px,
the worker type tabs (`.worker-subtabs`) and the details tab row (`.details-nav`) run to both screen edges instead
(`margin-inline: calc(50% - 50vw)` with matching padding), and the worker type tabs drop their rounded corners.

### Text Worker Capabilities

The worker card has a Capabilities section for text workers, laid out like the image one: `.worker-cap` badges, with
`.worker-cap--off` striking out what the worker does not do.

```css
.worker-cap--prompt-jobs   /* Plain text jobs, in the text hue */
.worker-cap--chat-jobs     /* Chat jobs, in the text hue */
.worker-cap--reads-images  /* Reads images in chat messages (vision plus an image transport), in the image hue */
.worker-card-note          /* One muted sentence under the badges, such as the chat-only note */
.worker-limits             /* The token limits table: one row for each job kind taken by the worker */
.worker-card-subsection    /* Space above a block that follows the table, such as the chat features */
.worker-chat-disclosure    /* The chat features as an hd-disclosure, closed by default */
.worker-chat-disclosure-head /* The head button: "Chat features" and the declared count, such as "10 of 16 declared" */
```

The declared count uses the same grouping as the open list (`chatCapabilityGroups(..., true)`), so both numbers match
what the disclosure shows when open.

### Worker List Sections

When the horde sends `accepts_chat_jobs`, the text tab of the workers list splits into Chat workers (chat-only workers
included) and Plain text only, in card and row views. Both start open. Each viewer's folded sections are stored in
localStorage under `workers.text_sections_folded`, and storage errors leave both open. A link to a worker in a folded
section opens it without changing the stored choice. The headings scroll with the list.

A heading is a line of text (chevron, title, count) with a rule to the right, and a 3px rail runs down the left of the
cards under it. The heading has more space above than below, so it groups with the cards that follow. The chat section
uses the text hue (`--hd-accent`) for the rule and rail. The plain section uses `--hd-border`. Below 900px, where card
names pin and the heading scrolls out of view, each text card shows a Chat, Chat only or Text badge beside its name.

```css
.worker-section-heading         /* <h2> wrapping the fold button */
.worker-section--railed         /* The cards under a heading: left rail and a small inset */
.worker-section--chat           /* On the heading and the cards: text hue for the rule and rail */
.worker-card-kind               /* The Chat / Chat only / Text badge in the card name row, hidden from 900px */
.worker-section-toggle          /* The fold button, borderless, with the rule as ::after. 44px on coarse pointers */
.worker-section-chevron         /* Rotated while folded */
.worker-section-chevron--open
.worker-section-count           /* The worker count pill */
```

`app-chat-capabilities` draws a chat declaration as labelled rows of `.worker-cap` badges. Each badge has a
plain-language label, and its tooltip adds the meaning and the API name. A worker card lists every described name and
strikes out the undeclared ones. A model page summarises several workers, so it lists only declared names.

```css
.chat-caps                 /* The rows: a label column and a wrapping badge column */
.chat-caps-group--sampling /* One hue per row: sampling, images, tools, format, guarantees, other */
.chat-caps-label           /* The row label */
.chat-caps-badges          /* The row's badges */
.chat-cap                  /* A badge that may include a glyph */
.chat-cap-icon             /* The check glyph on a guarantee, so guarantees are distinguishable without colour */
```

The model list and model page reuse `app-chat-capabilities`. Their chat classes are under
[Model list](#model-list-_modelscss).

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

## Model list (`_models.css`)

The `/details/models` list is drawn on HD; [STYLING.md](../STYLING.md) describes its layout at each width.

### Toolbar

```css
.models-toolbar            /* Summary, controls and active filters. Sets --hd-sec* from the accent */
.models-summary            /* Inline totals: model count and queued work */
.models-controls           /* Search, baseline select, the filter toggle and the secondary filters */
.models-filter-group       /* A label and its select on one line */
.models-filter-toggle      /* "More filters" disclosure, shown only below 1024px */
.models-extra-filters      /* Secondary filters, collapsed below 1024px unless --open */
.models-extra-filters--open
.models-filter-toggles     /* The on/off filter chips */
.models-active-filters     /* Result count, one removable chip per active filter, and Clear */
.models-mobile-sort        /* Sort select and direction button, shown below 640px where column heads are hidden */
```

### Chat column

The text tab adds a Chat workers column when the horde lists chat workers:

```css
.models-grid--chat         /* On .models-grid: adds the chat track to the text tab's columns */
.models-list-chat          /* The chat cell: chat worker count */
.models-list-sub           /* A smaller muted second line in a value cell: the largest chat context */
```

---

## Loading and empty states (`_utilities.css`)

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

## Animation and motion

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

## Icon system

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

## Responsive design

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

## Accessibility patterns

Focus rings, colour contrast, reduced motion and keyboard navigation are stated once in the
[shared catalog](../src/shared/design-system/docs/component-patterns.md) and hold here unchanged, as does `.sr-only`.
What is specific to this site:

### Modal Accessibility

- `role="dialog"` and `aria-modal="true"`
- `aria-labelledby` pointing to the title
- Focus trap while open
- Focus restoration on close
