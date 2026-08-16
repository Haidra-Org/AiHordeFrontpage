# Design language: the studio and the Learn area

This document is the visual grammar every `gs-*` surface is built from: the scales, the tokens that
carry them, and the anatomy of each control. It sits under [STYLING.md](../STYLING.md) (where styles
live and how they are named) and beside [design-system.md](design-system.md) (the site-wide glass
system, which the studio deliberately does not use). Copy is governed by
[docs/haidra-assets/docs/meta/copy.md](haidra-assets/docs/meta/copy.md).

In brief:

- Four scales: type, space, radius, elevation. Every value on a `gs-*` rule comes off one of them.
- Motion is short and eased, and only ever a consequence of a state change.
- One control anatomy per role (field, button, chip, segmented, card, header, sheet), reused rather
  than restyled per page.
- Touch targets 44px, contrast in both themes, focus rings on every interactive thing, forced-colors
  edges, reduced-motion honoured, all by default from the tokens.

## Scales and tokens

All tokens live on `.gen-studio` (light) and `.dark .gen-studio` (dark) in `_generate.css`.

### Type

Inter for text, JetBrains Mono for values. Six sizes; nothing between them.

| token           | px   | use                                              |
| --------------- | ---- | ------------------------------------------------ |
| `--gs-text-2xs` | 10   | eyebrows (uppercase, tracked), fine print        |
| `--gs-text-xs`  | 11.5 | hints, captions, chip values, sublabels          |
| `--gs-text-sm`  | 12.5 | labels, buttons, chips, table cells, dense prose |
| `--gs-text-md`  | 13.5 | body prose, inputs                               |
| `--gs-text-lg`  | 15.5 | pane titles, card titles                         |
| `--gs-text-xl`  | 20   | page titles                                      |

Weights: 400 body, 600 labels and buttons, 700 titles and eyebrows. Line height 1.5 for prose,
1.3 for titles and controls. Eyebrows are `--gs-text-2xs`, uppercase, `letter-spacing: 0.12em`,
`--gs-ink-2`, and are always the first line of a group; a coloured dot or a section mark may
precede them.

### Space

A 4px base. Use the tokens; do not invent 5px or 7px gaps.

| token            | px  | use                                                                |
| ---------------- | --- | ------------------------------------------------------------------ |
| `--gs-space-1`   | 4   | inside a chip, between an icon and its word, label to its control  |
| `--gs-space-2`   | 8   | between controls in a row, chip gaps, gap between cards on a phone |
| `--gs-space-2-5` | 10  | card padding on a phone, the rows inside a card                    |
| `--gs-space-3`   | 12  | card padding, gap between cards, pane header and body padding      |
| `--gs-space-4`   | 16  | pane header and body side padding, results pane padding            |
| `--gs-space-6`   | 24  | section gaps                                                       |
| `--gs-space-8`   | 32  | page-level gaps                                                    |

`--gs-space-2-5` is a half step, and the only one: the studio's cards are dense enough that 12
reads as loose inside them and 8 puts the content on the edge. Nothing outside a dense surface
uses it.

### Radius

| token              | px  | use                                       |
| ------------------ | --- | ----------------------------------------- |
| `--gs-radius-sm`   | 8   | inputs, buttons, chips, segmented options |
| `--gs-radius-md`   | 12  | cards, popovers, sheet body               |
| `--gs-radius-lg`   | 16  | panes, the sheet, heroes                  |
| `--gs-radius-pill` | 999 | pills, dots, toggles                      |

### Elevation

| token         | use                                             |
| ------------- | ----------------------------------------------- |
| `--gs-elev-1` | a card or a field at rest                       |
| `--gs-elev-2` | a card on hover, an open popover, a raised pane |
| `--gs-elev-3` | a sheet at full, a modal                        |

Elevation is a soft low shadow, never a bevel or a bright edge. A raised thing also gets a
slightly lighter surface (`--gs-panel` over `--gs-card`); the two together are what read as depth.

### Motion

`--gs-dur-fast` (150ms) for hover, press and focus; `--gs-dur` (220ms) for open, close, expand and
reflow; `--gs-ease` for both. Both durations are 0 under `prefers-reduced-motion`. Transforms used
for motion (a lift, a nudge) are cancelled under reduced motion as well. No decorative animation.

## Control anatomy

Each role has one anatomy. A page that needs a variant changes a token or adds a modifier; it does
not write a second control.

### Field

`.gs-input`, `.gs-textarea`, `.gs-select`: 40px tall (textarea grows), `--gs-space-3` horizontal
padding, `--gs-radius-sm`, 1px `--gs-field-border`, `--gs-field` surface, `--gs-text-md` text,
`--gs-muted` placeholder. Focus: 2px `--gs-blue` ring at 2px offset (no glow halo). Disabled: 55%
opacity, no ring. Invalid: `--gs-danger` border and a hint line under, never colour alone. A label
(`.gs-slabel`) is `--gs-text-sm` 600 `--gs-label`, sits above the control with `--gs-space-1`
between, and may carry a `?` help trigger after it. A hint (`.gs-sublabel`) is `--gs-text-xs`
`--gs-muted` under the control.

### Slider

Track 4px, `--gs-radius-pill`, `--gs-border` with the filled part in `--gs-blue`; thumb 20px
(24px on coarse pointers) `--gs-panel` with a 2px `--gs-blue` edge and `--gs-elev-1`; the value
reads in mono beside the label. Focus ring on the thumb.

### Button

Four kinds, one shape: 40px min height (36px in dense rows, 44px on coarse pointers), `--gs-space-4`
horizontal padding, `--gs-radius-sm`, `--gs-text-sm` 600, icon 16px with `--gs-space-1` to the
word.

- Primary (`.gs-btn-primary`): `--gs-blue` surface, white text, lifts nothing, darkens 6% on hover,
  presses 1px down.
- Secondary (`.gs-btn`): `--gs-panel` surface, 1px `--gs-border`, `--gs-ink`, `--gs-elev-1`; hover
  `--gs-elev-2`.
- Tonal (`.gs-btn-tonal`): `--gs-blue-tint` surface, `--gs-blue` text, no border.
- Ghost (`.gs-btn-ghost`): no surface until hover, `--gs-ink-2` text.

A button always has a visible word unless it is an icon-only control with an `aria-label`, and an
icon-only control is 40px square.

### Chip

`.gs-chip`, `.gs-setting-chip`, presets: 32px tall (36 on coarse pointers), `--gs-space-3`
horizontal padding, `--gs-radius-pill`, `--gs-text-sm` 600, 1px border in the area's tint. Selected:
the area's tint as surface, `--gs-ink` text. A chip that opens something is a button and shows it
on hover (underline, brighter edge) and focus (ring).

### Segmented control

`.gs-seg`: a `--gs-seg-track` well with 3px inset, options 32px tall, `--gs-radius-sm`; the
selected option lifts to `--gs-seg-active` with `--gs-elev-1`. Never more than four options; more
becomes chips or a select.

### Card

`.gs-card`: `--gs-card` surface, 1px `--gs-card-border`, the area's 2px tint as a top edge,
`--gs-radius-md`, `--gs-space-3` padding (`--gs-space-2-5` on a phone), `--gs-elev-1`,
`--gs-elev-2` on focus-within. A card starts with its header (mark, eyebrow, `?`), then its
controls with `--gs-space-2-5` between them, the header included. Two cards in a column stand
`--gs-space-3` apart (`--gs-space-2` on a phone): near enough to read as one stack of settings.

### Header

A pane or page header is one row: title (`--gs-text-lg` 700) with an optional quiet subtitle,
then the row's actions right-aligned. Under it, if the surface has one, a single control row.
Never two stacked headers: when a surface changes purpose (a tutorial takes the results pane), the
header changes with it rather than being added to.

### Sheet (phone)

Three stops: peek (one row: a 3px progress line at the very top, title, one action, the stop
button), half (the row plus the body at a readable height), full (from under the site nav to the
safe area). The page behind is scroll-locked above peek (CDK `BlockScrollStrategy`); the body
scrolls internally, `overscroll-behavior: contain`, with a scroll shadow at its top edge so it reads
as scrollable. Focus is trapped at full (`cdkTrapFocus`), and the sheet is `aria-modal` there. Stop
controls carry a word and a chevron.

### Popover and note

`--gs-card` surface, `--gs-radius-md`, `--gs-elev-2`, `--gs-space-3` padding, `--gs-text-sm` prose,
placed by the thing that opened it, dismissed by Escape and outside press, focus returned.

## Rules that hold everywhere

- Touch targets are at least 44px on coarse pointers; drag targets too.
- Every interactive thing has a focus-visible ring (2px `--gs-blue`, 2px offset).
- Both themes are checked; a colour appears in both token blocks or not at all.
- `@media (forced-colors: active)` gives every card, chip, thumb and sheet a system-colour edge.
- Icon-only controls carry `aria-label`; live changes (a step, a sheet stop) are announced.
- One accent (`--gs-blue`) recoloured per tool; area tints only mark which panel area a thing
  belongs to.
- No em dashes in UI text; see the copy standard.
