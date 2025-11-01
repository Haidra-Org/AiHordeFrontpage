# Styling Guide for AI Horde Frontpage

This document outlines the styling conventions, patterns, and best practices for the AI Horde Frontpage Angular application using Tailwind CSS v4.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [When to Use What](#when-to-use-what)
- [Custom Classes Reference](#custom-classes-reference)
- [CSS Variables](#css-variables)
- [Component Styling](#component-styling)
- [Responsive Design](#responsive-design)
- [Dark Mode](#dark-mode)
- [Performance Considerations](#performance-considerations)

## Overview

This project uses a **hybrid styling approach** that combines:

1. **Tailwind CSS v4 Utilities** - For one-off, unique styling needs
2. **Custom CSS Classes** - For frequently reused complex component patterns
3. **CSS Custom Properties** - For theming and consistent values

This approach follows Tailwind CSS best practices while maintaining readability and reducing HTML bloat.

## Architecture

```
src/
├── styles.css              # Global styles with @theme configuration
└── app/
    └── components/
        └── *.component.css # Component-specific styles (minimal)
```

### Global Styles (`styles.css`)

Contains:
- Tailwind v4 `@theme` configuration
- Reusable component classes (`.card`, `.btn-*`, `.heading-*`)
- Layout containers (`.container-*`, `.grid-*`)
- Utility patterns used across multiple components

### Component Styles

Should be:
- **Minimal** - Most components use only global styles and Tailwind utilities
- **Scoped** - Use `ViewEncapsulation.Emulated` (default) for style isolation
- **Documented** - Empty or minimal CSS files should have comments explaining why

## When to Use What

### Use Custom Classes When:

✅ **Pattern is used in 3+ places**
```css
/* Good: Frequently reused card pattern */
.card {
  display: flex;
  flex-direction: column;
  max-width: 32rem;
  padding: 1.5rem;
  /* ... more styles */
}
```

✅ **Complex responsive behavior**
```css
/* Good: Complex container with multiple breakpoints */
.container-page-header {
  /* Mobile styles */
  padding: 5rem 1rem 2rem;
  
  @media (min-width: theme('screens.lg')) {
    /* Desktop styles */
  }
}
```

✅ **State-dependent styling**
```css
/* Good: Hover, focus, active states */
.btn-primary {
  background-color: var(--color-brand-blue);
  transition: background-color 200ms ease;
}

.btn-primary:hover {
  background-color: var(--color-brand-blue-hover);
}
```

### Use Tailwind Utilities When:

✅ **One-off, unique styling**
```html
<!-- Good: Unique layout needs -->
<div class="flex items-center justify-between mb-4">
```

✅ **Simple, self-explanatory patterns**
```html
<!-- Good: Clear intent from utilities -->
<p class="text-gray-500 dark:text-gray-400">
```

✅ **Quick prototyping or layout adjustments**
```html
<!-- Good: Spacing and alignment -->
<div class="mt-8 space-y-4">
```

### Avoid:

❌ **Duplicating long utility chains**
```html
<!-- Bad: Repeated 5+ times -->
<p class="max-w-2xl mb-6 font-light text-gray-500 lg:mb-8 md:text-lg lg:text-xl dark:text-gray-400">
```
→ Create a custom class like `.text-body-intro`

❌ **Using ::ng-deep**
```css
/* Bad: Deprecated */
:host ::ng-deep .child-element {
  color: red;
}
```
→ Move to global styles or use CSS custom properties

❌ **Hard-coded values that should be variables**
```css
/* Bad */
color: rgb(17 24 39);

/* Good */
color: var(--color-text-primary);
```

## Custom Classes Reference

### Sections

- `.section-primary` - White background (gray-900 in dark mode)
- `.section-secondary` - Gray background (gray-800 in dark mode)

### Containers

- `.container-page-header` - Hero section container with grid layout
- `.container-content` - Standard content container (6rem padding on large screens)
- `.container-content-sm` - Reduced padding content container (3rem padding)
- `.container-spaced` - Content container with auto spacing between children
- `.container-spaced-sm` - Reduced spacing version

### Headings

- `.heading-hero` - H1 for hero sections (responsive: 2.25rem → 3rem → 3.75rem)
- `.heading-section` - H2 for major sections (1.875rem)
- `.heading-section-mb` - H2 with margin-bottom
- `.heading-section-lg` - Larger H2 variant (1.5rem)
- `.heading-subsection` - H3 for subsections
- `.heading-stats` - Stats category heading with border

### Text

- `.text-primary` - Primary text color with dark mode support
- `.text-secondary` - Secondary/muted text color
- `.text-secondary-lg` - Large secondary text (responsive)
- `.text-stat` - Text for stat items with icon
- `.text-error` - Error state text (red)
- `.text-success` - Success state text (green)

### Buttons

- `.btn-primary` - Blue primary button with hover/focus states
- `.btn-purple` - Purple brand button with hover/focus states
- `.btn-disabled` - Disabled button state

### Cards

- `.card` - Base card component with shadow and border
- `.card-bg-primary` - Card with primary background
- `.card-bg-secondary` - Card with secondary background

### Forms

- `.form-label` - Form field labels
- `.form-input` - Text input fields with focus states

### Grids & Layouts

- `.grid-items` - Standard grid that becomes active on lg breakpoint
- `.grid-cards` - Responsive 2→3→4 column grid for cards
- `.grid-stats` - Responsive 1→2→4 column grid for statistics

### Lists

- `.list-checkboxes` - Checkbox list with consistent spacing
- `.list-stats` - Statistics list with spacing
- `.list-item-with-icon` - Flex layout for item with icon

### Utilities

- `.place-center` - Center element with auto margin
- `.icon-sm` - Small icon sizing (1rem × 1rem)
- `.divider-section` - Section divider with padding
- `.faq-button` - FAQ accordion button style
- `.skeleton-pulse` - Loading skeleton animation

## CSS Variables

All custom properties are defined in the `@theme` block in `styles.css`:

### Brand Colors

```css
--color-brand-purple: #9333ea;
--color-brand-purple-hover: #7e22ce;
--color-brand-blue: #1d4ed8;
--color-brand-blue-hover: #1e40af;
```

### Semantic Colors

```css
--color-text-primary: rgb(17 24 39);
--color-text-secondary: rgb(107 114 128);
--color-bg-primary: rgb(255 255 255);
--color-bg-secondary: rgb(249 250 251);
--color-border-primary: rgb(229 231 235);
--color-border-secondary: rgb(243 244 246);
```

### Spacing & Layout

```css
--spacing-container-padding: 1.5rem;
--spacing-container-padding-mobile: 1rem;
--max-width-container: 80rem;
```

### Using Variables

```css
/* In custom CSS */
.my-component {
  color: var(--color-text-primary);
  padding: var(--spacing-container-padding);
}

/* In media queries */
@media (min-width: theme('screens.lg')) {
  /* ... */
}
```

## Component Styling

### ViewEncapsulation

All components should explicitly declare their encapsulation strategy:

```typescript
@Component({
  selector: 'app-my-component',
  encapsulation: ViewEncapsulation.Emulated, // Default, but be explicit
  // or ViewEncapsulation.ShadowDom for true isolation
})
```

### Component CSS File Guidelines

1. **Empty or minimal?** Add a comment explaining why:
```css
/* This component uses only global styles and Tailwind utilities - no component-specific styles needed */
```

2. **Component-specific overrides only:**
```css
/* gui-card.component.css */
.description {
  height: 120px; /* Fixed height for consistent card appearance */
}
```

3. **Avoid ::ng-deep** - Use these alternatives:
   - Move styles to global `styles.css`
   - Use CSS custom properties for theming
   - Use `:host-context()` for parent-dependent styling

### Host Element Styling

Use the `host` property in component metadata:

```typescript
@Component({
  selector: 'app-card',
  host: {
    class: 'block rounded-lg',
    '[class.shadow-lg]': 'elevated()',
  },
})
```

## Responsive Design

### Breakpoints

Tailwind v4 default breakpoints:

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px
- `3xl`: 120rem (custom - defined in @theme)

### Using Breakpoints

**In HTML with Tailwind utilities:**
```html
<div class="text-base md:text-lg lg:text-xl">
```

**In custom CSS:**
```css
.my-class {
  font-size: 1rem;
  
  @media (min-width: theme('screens.md')) {
    font-size: 1.125rem;
  }
  
  @media (min-width: theme('screens.lg')) {
    font-size: 1.25rem;
  }
}
```

### Container Queries (Tailwind v4)

For component-based responsive design:

```html
<div class="@container">
  <div class="@md:flex-row flex-col">
    <!-- Responds to container size, not viewport -->
  </div>
</div>
```

## Dark Mode

Dark mode is implemented using the `dark:` variant:

### In HTML

```html
<p class="text-gray-900 dark:text-white">
```

### In Custom CSS

```css
.my-class {
  color: var(--color-text-primary);
}

.dark .my-class {
  color: white;
}
```

### Dark Mode Variables

Consider adding dark mode variants to CSS variables:

```css
@theme {
  --color-text-primary: rgb(17 24 39);
}

.dark {
  --color-text-primary: rgb(255 255 255);
}
```

## Performance Considerations

### CSS Containment

Use `contain` property for isolated components:

```css
.card {
  contain: layout style; /* Improves paint and layout performance */
}
```

### Transitions

Add transitions only where needed:

```css
.btn-primary {
  transition: background-color 200ms ease; /* Single property */
  /* Avoid: transition: all 200ms; */
}
```

### Bundle Size

- Tailwind v4's JIT mode automatically purges unused styles
- Custom classes in `styles.css` (~15KB) are reasonable for this app
- Component CSS should be minimal

### Loading Performance

- Use `ngSrc` for images (already implemented)
- Lazy load routes with `loadComponent()` where appropriate
- Keep critical CSS in main bundle

## Examples

### Creating a New Card Component

```typescript
// card-example.component.ts
import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-card-example',
  template: `
    <div class="card card-bg-primary">
      <h3 class="heading-subsection">{{ title }}</h3>
      <p class="text-secondary">{{ description }}</p>
    </div>
  `,
  styles: [`
    /* Component-specific override only if needed */
    .custom-spacing {
      padding: 2rem; /* Different from card default */
    }
  `],
  encapsulation: ViewEncapsulation.Emulated,
})
export class CardExampleComponent {}
```

### Creating a New Button Variant

If you need a new button style used in 3+ places:

```css
/* In styles.css */
.btn-outline {
  background-color: transparent;
  border: 2px solid var(--color-brand-blue);
  color: var(--color-brand-blue);
  font-weight: 500;
  border-radius: 0.5rem;
  padding: 0.625rem 1.25rem;
  transition: all 200ms ease;
}

.btn-outline:hover {
  background-color: var(--color-brand-blue);
  color: white;
}
```

### Responsive Text Pattern

```html
<!-- One-off: Use utilities directly -->
<p class="text-sm md:text-base lg:text-lg">

<!-- Repeated: Create custom class -->
<p class="text-body-intro">
```

```css
/* In styles.css */
.text-body-intro {
  font-size: 0.875rem;
  
  @media (min-width: theme('screens.md')) {
    font-size: 1rem;
  }
  
  @media (min-width: theme('screens.lg')) {
    font-size: 1.125rem;
  }
}
```

## Migration Notes

### From Hard-coded Values to Variables

**Before:**
```css
color: rgb(17 24 39);
background: white;
```

**After:**
```css
color: var(--color-text-primary);
background: var(--color-bg-primary);
```

### From Hard-coded Breakpoints to Theme Functions

**Before:**
```css
@media (min-width: 1024px) {
  /* ... */
}
```

**After:**
```css
@media (min-width: theme('screens.lg')) {
  /* ... */
}
```

### From ::ng-deep to Global Styles

**Before (component CSS):**
```css
:host ::ng-deep .sponsor-svg svg {
  filter: grayscale(1);
}
```

**After (styles.css):**
```css
.sponsor-svg svg {
  filter: grayscale(1);
  transition: filter 500ms ease;
}
```

## Resources

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Angular Style Guide](https://angular.dev/style-guide)
- [Angular ViewEncapsulation](https://angular.dev/api/core/ViewEncapsulation)
- [CSS Containment](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment)

## Questions?

For questions about styling patterns or conventions, please:
1. Check this guide first
2. Review existing component implementations
3. Ask in team discussions

---

*Last updated: November 2025*
