---
name: web-design
description: >-
  Defines component standards, responsive layouts, and tactile UI patterns in Next.js
  with Tailwind CSS and shadcn/ui. Use when building UI layouts, styling components,
  designing mobile viewports, or formatting typography. Do not use for server actions,
  route handlers, database mutations, or cryptographic operations.
---

# Web Design & Interface Craftsmanship Skill

## 1. Absolute Design Constraints

### Constraint 1: Zero Emojis
* **Rule:** Never use emojis anywhere in the interface (no buttons, toasts, dialogs, headers, or cards).
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

### Constraint 2: Zero Background Colors on Text and Icons (Unless Explicitly Instructed)
* **Rule:** Do not place background color fills behind text (e.g. colored badge pills, text highlights) or behind icons (e.g. colored circle containers).
* **Implementation:** Use borders, font weight, and clean typography to structure information:
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

---

## 2. Layout & Typography Architecture

### 2.1 Mobile-First Viewports
* Optimize primarily for mobile phone screens ($360\text{px} - 430\text{px}$ width) used by booth exhibitors and registration staff.
* Keep viewport layout compact: ensure the camera viewfinder and manual entry controls fit in a single screen without vertical scrollbars during live scanning.

### 2.2 Typography Scale
* Use system-ui or Inter font stack.
* Headings: Crisp, high-contrast (`text-neutral-900 font-bold tracking-tight`).
* Subheadings & Meta: Neutral gray (`text-neutral-600 font-normal`).
* Minimum Body Font: $14\text{px}$ (`text-sm`) for readability; never smaller than $12\text{px}$ (`text-xs`) for secondary metadata.

### 2.3 Tactile Touch Ergonomics
* Minimum tap target size: $44 \times 44\text{px}$ (`min-h-[44px] min-w-[44px]`).
* Generous button padding: `px-4 py-3`.
* Prominent active and pressed states: `active:scale-[0.98] transition-transform`.
