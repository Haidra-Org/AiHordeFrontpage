# Design language: the studio

The studio's scales and control anatomy are no longer the studio's. They were promoted into the shared design system
as the HD family, and the family itself is documented there:

- [design-system docs/design-system.md](../src/shared/design-system/docs/design-system.md) — the `--hd-*` scales, the
  semantic tokens, how a new HD rule is written.
- [design-system docs/component-patterns.md](../src/shared/design-system/docs/component-patterns.md) — the anatomy of
  each `.hd-*` control.
- [STYLING.md](../STYLING.md) — which family to use, where rules live, the migration rule.

What follows is what is still specific to `/generate`. Copy is governed by
[docs/haidra-assets/docs/meta/copy.md](haidra-assets/docs/meta/copy.md).

## Tokens: `--gs-*` is `--hd-*`

The studio's `--gs-*` set is now a set of aliases declared on `.gen-studio` in `_generate.css`. `--gs-card` is
`var(--hd-card)`, `--gs-text-sm` is `var(--hd-text-sm)`, `--gs-blue` is `var(--hd-accent)`, and so on through the type,
space, radius, elevation, ink, field, popover, accent, status and motion sets. A scale question is answered by the
shared token file, not here.

Three groups are still declared in `_generate.css` with values of their own:

- The section and zone identity hues, and the tints derived from them.
- The tutorials' amber (`--gs-tut*`), which marks learning surfaces and belongs to no panel area.
- A few layout constants: the tab bar and pin bar heights, the widened panel's column split, the bound on how far a
  switch may travel from the words it belongs to.

## Zones

The studio is divided into planes, and each plane carries one hue: blue for the create plane (the settings panel),
green for the results plane, purple for the same panel under Alchemy, whose work is transformation rather than
creation. The hue is applied through repeated small devices, section ticks, pane-title ticks, card edges and step
numbers, rather than through washes, so the coding aids scanning without turning the studio technicolor.

Each zone root also restates its hue under the shared `--hd-zone*` names, so an `.hd-*` primitive placed inside a plane
picks the plane's hue up through the contract without knowing the studio's token names.

## Section identity hues

Every settings section carries a hue: prompt, model, size, source, sampling, finishing, horde, workflows, alchemy. The
hue marks the section chip, the card title hairline and the setting chips that belong to that section, and it is
restated under `--hd-sec*` for the same reason the zone hues are.

These are audited as graphic colour only. Every hue clears 3:1 against `--gs-panel` and `--gs-card`, but the size hue
falls under 4.5:1, so the whole set is restricted to glyphs and edges and never colours text. A section that needs to
say something in colour says it with a badge or a word instead.

Dark has its own values for each hue, not a filter over the light ones.

## The remaining `.gs-*` idiom

- Every studio rule is scoped under `.gen-studio` and prefixed `gs-`. Nothing here is for reuse elsewhere, and the
  prefix keeps it from colliding with the shared catalog.
- One accent, recoloured per tool. The image tool reads `--gs-blue` as blue; the Alchemy tool redeclares it as purple
  on the `.gs-alchemy` page root, recolouring the whole control set without a duplicate rule. Reach for a token flip
  before a new class.
- The `.gs-*` primitives that duplicate an HD primitive are transitional. When a template is rebuilt its markup moves
  to the `.hd-*` class and the `.gs-*` rule goes with it.
- What has no HD equivalent stays: the shell and its panes, the phone sheet with its three stops, the slider, the
  switch, the tile grid, the viewer, the sweep plates, the tutorial and reference surfaces.
- Fonts are self-hosted in `_generate.css` so the download only fires for text under `.gen-studio`.

Two studio sheets sit beside `_generate.css`. `_alchemy.css` holds what belongs to Alchemy alone and is scoped the same
way. `_civitai.css` is deliberately unscoped: the style editor renders the same LoRA and embedding rows outside
`.gen-studio`, so a scoped rule would leave it unstyled.

## The phone sheet

Three stops: peek (one row with a progress line, the title, one action and the stop button), half (that row plus the
body at a readable height), full (from under the site nav to the safe area). The page behind is scroll-locked above
peek; the body scrolls internally with `overscroll-behavior: contain` and a scroll shadow at its top edge. Focus is
trapped at full and the sheet is `aria-modal` there. Stop controls carry a word and a chevron.

## Rules that hold everywhere in the studio

- Touch targets are at least 44px on coarse pointers, drag targets included.
- Every interactive thing has a focus-visible ring, 2px in the accent at 2px offset.
- Both themes are checked. A colour appears in both token blocks or in neither.
- `@media (forced-colors: active)` gives every card, chip, thumb and sheet a system-colour edge.
- Icon-only controls carry `aria-label`; live changes are announced.
- Motion is short, eased, and only ever a consequence of a state change. Both durations go to zero under
  `prefers-reduced-motion`, and transforms used for motion are cancelled with them.
- No em dashes in UI text. See the copy standard.
