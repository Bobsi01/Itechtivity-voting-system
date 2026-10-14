# UI & UX Governance Rules

## 1. Absolute Styling Invariants (Strict User Directives)

### Rule 1: NEVER Use Emoji in the UI
* **Strict Prohibition:** Emojis (e.g., 🚀, ✅, ❌, 🎉, 📱, 🔒) are strictly forbidden across all user interfaces, alerts, buttons, badges, headings, and toast messages.
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

---

## 2. Tactile Booth & Mobile Ergonomics

### Rule 3: Minimum Touch Target Size
* All clickable elements, scanner action buttons, manual entry keys, and form inputs must have a minimum touch target of **44x44px** to ensure error-free operation on handheld mobile devices.

### Rule 4: High-Contrast Venue Visibility
* Exhibition halls often have dim ambient lighting or harsh overhead glare.
* Never use faint gray-on-gray text (e.g., `text-neutral-400` on white). Use high-contrast contrast ratios ($> 7:1$) for critical statuses, award titles, and scan alerts.

### Rule 5: Multi-Sensory Feedback
* Every successful ticket scan must trigger three simultaneous signals:
  1. **Visual:** Clean high-contrast border and status text.
  2. **Acoustic:** Immediate synthesized audio beep via HTML5 Web Audio API.
  3. **Haptic:** Hardware vibration pulse (`navigator.vibrate([80])`) on mobile devices.
