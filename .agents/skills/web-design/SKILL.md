---
name: web-design
description: >-
  Defines component standards, high-contrast monochrome styling, responsive layouts, and tactile UI
  patterns in Next.js with Tailwind CSS and custom UI primitives. Use when building UI layouts,
  styling components, designing mobile-to-desktop viewports, or formatting typography. Do not use
  for server actions, route handlers, database mutations, or cryptographic operations.
---

# Web Design & Interface Craftsmanship Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Absolute Design Constraints (Aligned with `.agents/rules/ui-ux.md`)

### Constraint 1: Zero Emojis (Rule 1)
* **Rule:** Never use emojis anywhere in the interface (buttons, toasts, dialogs, headers, badges, or cards).
* **Implementation:** Always use clean, scalable vector icons from `lucide-react` with explicit sizing and stroke widths:
  ```tsx
  // BAD: Embedding literal emojis in UI
  <button>[Rocket-Emoji] Submit Vote</button>
  <p>[Checkmark-Emoji] Vote recorded successfully!</p>

  // GOOD
  import { ArrowRight, Check } from 'lucide-react';

  <button className="flex items-center gap-2 font-medium">
    Submit Vote
    <ArrowRight className="h-4 w-4" />
  </button>

  <p className="flex items-center gap-2 font-medium text-neutral-900">
    <Check className="h-4 w-4 stroke-2" />
    Vote recorded successfully.
  </p>
  ```

### Constraint 2: Zero Chromatic Background Colors on Text and Icons (Rule 2)
* **Rule:** Do not place chromatic background color fills behind text (e.g. colored badge pills, text highlights) or behind icons (e.g. colored circle containers). `src/lib/test/standards-checker.ts` rejects chromatic `bg-*` classes (`bg-blue-*`, `bg-emerald-*`, etc.).
* **Permitted Surfaces:** Neutral container surfaces (`bg-white`, `bg-neutral-50`), monochrome borders (`border border-neutral-300`), and high-contrast monochrome primary buttons (`bg-neutral-900 text-white` or `hover:bg-neutral-900 hover:text-white`):
  ```tsx
  // BAD: Bloated colored backgrounds
  <span className="bg-emerald-100 text-emerald-800 rounded-full px-2 py-1">Active</span>
  <div className="bg-blue-100 p-2 rounded-full">
    <Camera className="text-blue-600" />
  </div>

  // GOOD: Clean, minimalist, high-contrast borders and typography
  <span className="border border-neutral-300 rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-900">
    Active
  </span>
  <div className="border border-neutral-300 p-2 rounded">
    <Camera className="h-5 w-5 text-neutral-900" />
  </div>
  ```

### Constraint 3: Visual Restraint (Rules 3-5)
* **No Decorative Gradients:** Avoid decorative background, card, text, or border gradients unless carrying semantic meaning.
* **No Redundant Eyebrow Labels:** Omit stacked uppercase context labels above primary headings when context is already clear.
* **No UI Redundancy:** Avoid repeating titles, status badges, or explanatory subtitles that duplicate surrounding headings.

---

## 2. Layout, Contrast & Typography Architecture

### 2.1 Mobile-First Viewports & Progressive Grids (Rules 9-11)
* Write unprefixed Tailwind classes for compact handheld viewports (`360px - 430px`) used by booth exhibitors and registration clerks, using `sm:`, `md:`, and `lg:` solely as progressive desktop enhancements (e.g. `grid-cols-1 lg:grid-cols-2`).
* Use `min-h-dvh` or `h-dvh` instead of `h-screen` / `100vh`, and ensure zero horizontal overflow (`auditHorizontalOverflow`).
* Reuse existing shared UI primitives in `src/components/ui/` (`SimpleSelect`, `SearchableProgramPicker`, `QrScanner`) rather than inventing duplicate dropdown or scanner controls.

### 2.2 High-Contrast Typography & Input Zoom Safety (Rules 7 & 12)
* **Exhibition Contrast (> 7:1):** Keep critical statuses, headings, and scan alerts high-contrast (`text-neutral-900`, `text-neutral-800`, `text-neutral-700`, `text-neutral-600`). Never use faint gray-on-gray copy or `text-neutral-400` on white (use `placeholder:text-neutral-500` on inputs).
* **Body & Metadata Scale:** Minimum `14px` (`text-sm`) for body copy and `12px` (`text-xs`) for secondary metadata.
* **Mandatory 16px Inputs:** All `<input>`, `<select>`, and `<textarea>` fields must render at least `16px` (`text-base` or `text-base sm:text-sm`) on mobile to prevent iOS Safari focus auto-zoom (`auditInputFontSize` in `src/lib/test/standards-checker.ts`).

### 2.3 Tactile Touch Ergonomics (Rules 6 & 13)
* Minimum tap target size: `44x44px` (`min-h-11 min-w-11` / `min-h-[44px] min-w-[44px]`).
* Generous interactive padding (`px-4 py-3`), `touch-manipulation`, and `select-none` on rapid-tap controls.
* Prominent active states (`active:scale-[0.98] transition-transform` or `active:bg-neutral-800`).
