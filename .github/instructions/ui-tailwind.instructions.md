---
description: "Use when writing Blade templates, Tailwind CSS, or any frontend UI code. Enforces mobile-first design, consistent styling, no AI slop aesthetics, and accessibility standards for the voting system."
applyTo: "resources/views/**"
---
# UI & Tailwind CSS Rules

## Mobile-First — Always

Design for 375px (phone) first, then add responsive prefixes:

```html
<!-- DO — mobile-first, scales up -->
<div class="p-4 sm:p-6 lg:p-8">
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

<!-- DON'T — desktop-first -->
<div class="p-8 md:p-4">
```

- Every interactive element must be at least 44px tall (tap target)
- Test every page mentally at 375px width before wider breakpoints

## No AI Slop — Hard Rule

The UI must look like a real student project, not a SaaS landing page.

### NEVER use:
- Gradient text (`bg-gradient-to-r ... bg-clip-text text-transparent`)
- Gradient card backgrounds
- Glassmorphism / frosted-glass (`backdrop-blur`, semi-transparent cards)
- Floating particles or animated decorative backgrounds
- Oversized hero sections with generic motivational text
- Shadow stacking (`shadow-lg shadow-xl`)
- Excessive rounding (`rounded-3xl` on everything)
- SVG decorative blobs or wave dividers
- Placeholder text like "Welcome to our amazing platform" or "Empowering students"
- Lorem ipsum in committed code

### DO use:
- White/gray cards with subtle borders:
  ```html
  border          {{-- adds a 1px border --}}
  border-gray-200 {{-- light gray color --}}
  rounded-lg      {{-- slightly rounded corners --}}
  ```
- One level of shadow max: `shadow-sm` (slight lift) or `shadow` (subtle)
- Purposeful rounding: `rounded-md` (buttons) or `rounded-lg` (cards) — not `rounded-3xl`
- Real, specific copy that describes actual system features
- Simple solid backgrounds: `bg-white`, `bg-gray-50` (very light gray), `bg-gray-100` (light gray)

## Consistent Spacing

Stick to Tailwind's default spacing scale (multiples of 4px):

```
Class     Pixels   When to use
─────     ──────   ───────────
p-1       4px      Tight inner padding (badges, small tags)
p-2       8px      Compact elements (table cells, inline items)
p-3       12px     Snug padding (small cards, list items)
p-4       16px     Standard padding (cards, sections)
p-6       24px     Roomy padding (main content areas)
p-8       32px     Spacious padding (page-level sections)

gap-2     8px      Tight gap between grid/flex children
gap-4     16px     Standard gap (most layouts)
gap-6     24px     Roomy gap (card grids, form fields)
gap-8     32px     Wide gap (major sections)

space-y-2  8px     Tight vertical stacking (form labels to inputs)
space-y-4  16px    Standard vertical stacking (paragraphs, list items)
space-y-6  24px    Section-level vertical stacking
```

- **Never** use odd values: `mt-7`, `pb-13`, `gap-9` — these break the rhythm
- **Never** use arbitrary values: `mt-[23px]`, `p-[7px]` — defeats the purpose of a design system
- Use `space-y-*` or `gap-*` for consistent vertical/horizontal rhythm — avoid manual margins on each child

## Component Consistency

Group Tailwind classes by purpose so they're easy to scan and maintain.
Order: **layout → sizing → colors → typography → borders → effects → states**

### Buttons

All buttons project-wide must follow the SAME base pattern:

```html
<!-- Primary button (main action on the page) -->
<button class="
    px-4 py-2                {{-- Padding: comfortable click area --}}
    bg-blue-600 text-white   {{-- Colors: solid blue background, white text --}}
    text-sm font-medium      {{-- Typography: small, medium weight --}}
    rounded-md               {{-- Shape: slightly rounded corners --}}
    hover:bg-blue-700        {{-- Hover: darker blue on mouse over --}}
    focus:outline-none       {{-- Focus: remove default browser outline --}}
    focus:ring-2             {{-- Focus: add a visible ring instead --}}
    focus:ring-blue-500      {{-- Focus: blue ring color --}}
    focus:ring-offset-2      {{-- Focus: small gap between ring and button --}}
">
    Cast Vote
</button>

<!-- Secondary button (cancel, back, less important actions) -->
<button class="
    px-4 py-2                          {{-- Padding: same as primary --}}
    border border-gray-300 text-gray-700  {{-- Colors: gray border + text, no fill --}}
    text-sm font-medium                {{-- Typography: matches primary --}}
    rounded-md                         {{-- Shape: matches primary --}}
    hover:bg-gray-50                   {{-- Hover: light gray fill --}}
    focus:outline-none focus:ring-2    {{-- Focus: same ring pattern --}}
    focus:ring-blue-500
">
    Cancel
</button>

<!-- Danger button (delete, remove actions) -->
<button class="
    px-4 py-2
    bg-red-600 text-white
    text-sm font-medium
    rounded-md
    hover:bg-red-700
    focus:outline-none focus:ring-2
    focus:ring-red-500 focus:ring-offset-2
">
    Delete
</button>
```

### Cards

```html
<!-- Standard content card -->
<div class="
    bg-white              {{-- Background: clean white --}}
    border border-gray-200 {{-- Border: subtle light gray line --}}
    rounded-lg            {{-- Shape: rounded, but not excessively --}}
    p-4 sm:p-6            {{-- Padding: tighter on mobile, roomier on desktop --}}
">
    <!-- card content here -->
</div>
```

### Form Inputs

```html
<!-- Label — always above the input, never beside it on mobile -->
<label class="
    block                 {{-- Layout: full width, sits above input --}}
    text-sm font-medium   {{-- Typography: small, readable --}}
    text-gray-700         {{-- Color: dark enough to read easily --}}
    mb-1                  {{-- Spacing: small gap before the input --}}
">
    Student Number
</label>

<!-- Text input -->
<input type="text" class="
    w-full                {{-- Layout: full width of container --}}
    px-3 py-2             {{-- Padding: comfortable typing area --}}
    text-sm               {{-- Typography: matches label size --}}
    border border-gray-300 {{-- Border: visible but not heavy --}}
    rounded-md            {{-- Shape: matches buttons --}}
    focus:outline-none    {{-- Focus: replace default outline --}}
    focus:ring-2          {{-- Focus: blue ring appears on click --}}
    focus:ring-blue-500
    focus:border-blue-500 {{-- Focus: border also turns blue --}}
" />

<!-- Validation error message (shown below input when invalid) -->
<p class="
    mt-1                  {{-- Spacing: small gap below input --}}
    text-sm text-red-600  {{-- Typography: small, red for errors --}}
">
    This field is required.
</p>
```

## Data Display

- Desktop: use tables with clear headers
- Mobile (< 640px): convert tables to stacked card layouts
- Admin tables: horizontal scroll with sticky first column on small screens

## Feedback Patterns

- Success/error → toast notifications (not `alert()` boxes)
- Loading → simple spinner (`animate-spin`) or skeleton placeholder
- Empty states → short helpful message, not elaborate illustrations

## Security in Templates

- Always use `{{ }}` for output — escapes HTML entities automatically
- Always include `@csrf` in every `<form>`
- Never use `{!! !!}` unless the content is sanitized through HTMLPurifier
