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
- White/gray cards with subtle borders: `border border-gray-200 rounded-lg`
- One level of shadow max: `shadow-sm` or `shadow`
- Purposeful rounding: `rounded-md` or `rounded-lg`, not `rounded-3xl`
- Real, specific copy that describes actual system features
- Simple solid backgrounds: `bg-white`, `bg-gray-50`, `bg-gray-100`

## Consistent Spacing

Stick to Tailwind's default spacing scale (multiples of 4px):

```
p-1 p-2 p-3 p-4 p-5 p-6 p-8 p-10 p-12   (4px–48px)
gap-2 gap-4 gap-6 gap-8                    (spacing between grid/flex items)
space-y-2 space-y-4 space-y-6              (vertical stacking)
```

- Never use non-standard values like `mt-7`, `pb-13`, `gap-9`, or arbitrary `mt-[23px]`
- Use `space-y-*` or `gap-*` for consistent vertical/horizontal rhythm

## Component Consistency

### Buttons
All buttons project-wide must use the SAME base pattern:

```html
<!-- Primary action -->
<button class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
               text-sm font-medium">
    Cast Vote
</button>

<!-- Secondary action -->
<button class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md 
               hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500
               text-sm font-medium">
    Cancel
</button>
```

### Cards
```html
<div class="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
    <!-- content -->
</div>
```

### Form Inputs
```html
<label class="block text-sm font-medium text-gray-700 mb-1">Student Number</label>
<input type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          text-sm" />
<p class="mt-1 text-sm text-red-600"><!-- validation error here --></p>
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
