# UI & UX Governance Rules

## 1. Absolute Styling Invariants (Strict User Directives)

### Rule 1: NEVER Use Emoji in the UI
* **Scope:** This prohibition also applies to agent responses, code, and comments.
* **Strict Prohibition:** Emojis (such as rocket, checkmark, cross mark, party popper, mobile phone, lock, or any Unicode pictograph) are strictly forbidden across all user interfaces, alerts, buttons, badges, headings, and toast messages.
* **Alternative:** Use clean, professional monochrome vector icons from `lucide-react` (e.g., `<Check />`, `<AlertCircle />`, `<Camera />`, `<Lock />`) or concise, high-contrast typography.

### Rule 2: NEVER Use Background Colors on Text or Icons
* **Strict Prohibition:** Never wrap text or icons in background colored fills, highlights, badge bubbles, or pill backgrounds unless explicitly instructed by the user.
* **Forbidden Examples:**
  - `bg-blue-100 text-blue-700` pill badges behind text.
  - `bg-primary/10 p-2 rounded-full` colored circle containers behind icons.
  - `bg-yellow-50 text-yellow-800` warning highlight bars behind text.
* **Permitted Standards:**
  - Render text directly on the page/card background using clear typography, font weights, and border outlines (`border border-neutral-300`).
  - Render icons as clean SVG glyphs using pure stroke colors (`text-neutral-900`, `text-neutral-500`, `stroke-current`) without colored background patches.

### Rule 3: Avoid Gradients Unless Semantically Meaningful
* Do not apply decorative gradients to backgrounds, cards, text, or borders unless the gradient carries a clear functional or semantic purpose.

### Rule 4: Avoid Redundant Eyebrow Labels
* Do not place small uppercase tracked-out "eyebrow" labels above headings (e.g., `COMPUTER STUDIES DEPARTMENT • UNIVERSITY OF CALOOCAN CITY` above `ITECHTIVITY 2027`) when that context is redundant.

### Rule 5: Avoid UI Redundancy
* Keep the interface concise and avoid repeating titles, subtitles, or metadata that are already communicated by the primary heading or surrounding context.

---

## 2. Tactile Booth & Mobile Ergonomics

### Rule 6: Minimum Touch Target Size
* All clickable elements, scanner action buttons, manual entry keys, and form inputs must have a minimum touch target of **44x44px** to ensure error-free operation on handheld mobile devices.

### Rule 7: High-Contrast Venue Visibility
* Exhibition halls often have dim ambient lighting or harsh overhead glare.
* Never use faint gray-on-gray text (e.g., `text-neutral-400` on white). Use high-contrast contrast ratios ($> 7:1$) for critical statuses, award titles, and scan alerts.

### Rule 8: Multi-Sensory Feedback
* Every successful ticket scan must trigger three simultaneous signals:
  1. **Visual:** Clean high-contrast border and status text.
  2. **Acoustic:** Immediate synthesized audio beep via HTML5 Web Audio API.
  3. **Haptic:** Hardware vibration pulse (`navigator.vibrate([80])`) on mobile devices.

---

## 3. Mandatory Mobile-First Web App Architecture

All user interfaces must be conceptualized, styled, and coded as **Mobile-First Web Applications** before consideration for tablet or desktop viewports.

### Rule 9: Unprefixed Mobile-First Styling
* Write all Tailwind CSS utility classes targeting compact handheld viewports ($360\text{px} - 430\text{px}$) directly without breakpoint prefixes.
* Breakpoint prefixes (`sm:`, `md:`, `lg:`) must strictly be used as progressive enhancements for desktop screens, never as the base styling.

### Rule 10: Dynamic Viewport Height (`dvh`)
* Never use `h-screen` or `100vh` on full-screen layouts, scanner shells, or modals.
* Always use `h-dvh` or `min-h-dvh` to prevent layout jumps and clipped action bars when mobile browser toolbars expand or collapse in Safari and Chrome.

### Rule 11: Hardware Safe-Area Insets
* Layouts must integrate hardware notch and home indicator safe areas:
  * Headers: `pt-[env(safe-area-inset-top)]`
  * Sticky footers & bottom bars: `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (ensures a baseline padding buffer on devices where the inset evaluates to 0px).
  * Next.js 15 viewport export must include `viewportFit: 'cover'`.

### Rule 12: iOS Auto-Zoom Prevention
* All `<input>` and `<textarea>` fields must enforce a minimum font size of $16\text{px}$ (`text-base` or `text-[16px]`). This prevents iOS Safari from triggering an automatic viewport zoom upon focus.

### Rule 13: Touch Ergonomics & Thumb Zone
* Apply `touch-manipulation` to interactive elements to eliminate the 300ms tap delay.
* Apply `select-none` on buttons to prevent accidental text highlighting during rapid booth scanning.
* Primary actionable buttons (camera controls, binding confirmation, manual serial entry) must reside in the bottom 40% of the viewport (the natural thumb zone).

