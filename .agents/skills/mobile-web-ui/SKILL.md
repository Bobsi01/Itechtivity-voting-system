---
name: mobile-web-ui
description: >-
  Procedures and component patterns for architecting mobile-first web app UIs with Next.js
  and Tailwind CSS. Use when building handheld viewport layouts (360px-430px), dynamic viewport
  shells (dvh), safe-area insets, mobile touch ergonomics, bottom sheets, mobile camera scanner
  viewfinders, or virtual keyboard form interactions. Do not use for server actions, route
  handlers, database migrations, or cryptographic verification.
author: Daniel Bobis (GitHub: @ItsMeYourNightmare)
assisted_by:
  - OpenAI Codex
  - Google Gemini
---

# Mobile-First Web App UI Engineering Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

This skill governs the development of mobile-first web application interfaces for handheld devices (smartphones, mobile Safari, and Android Chrome). It establishes concrete rules for viewports, touch ergonomics, virtual keyboard behaviors, safe areas, and handheld booth scanner workflows.

---

## 1. Absolute Design Constraints (Strict Governance)

### 1.1 Strict No Emoji Policy
Never output, render, or embed literal emojis in UI templates, buttons, toasts, dialogs, badges, or form helpers.
* Always import and render monochrome vector icons from `lucide-react` with explicit dimensions (e.g. `className="h-5 w-5 stroke-[1.75]"`).
* Maintain consistent icon stroke weights and high contrast without ornamental decoration.

### 1.2 Strict No Background Colors on Text and Icons
Never wrap text, badges, status pills, or icons in background color fills unless explicitly instructed by the user.
* Forbidden: `bg-green-100 text-green-800 rounded-full px-2`, `bg-blue-500/10 p-3 rounded-full`.
* Required: Use clean borders and font weights:
  ```tsx
  // Active status tag
  <span className="border border-neutral-300 rounded px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-900">
    Active
  </span>

  // Icon container
  <div className="border border-neutral-300 rounded p-2.5 text-neutral-900">
    <Camera className="h-5 w-5" />
  </div>
  ```

---

## 2. Viewport & Layout Architecture

Mobile web browsers feature collapsible address bars and navigation footers. Using traditional `100vh` or `h-screen` causes jarring layout recalculations and clipped footers.

### 2.1 Dynamic Viewport Height (`dvh`)
Always use dynamic viewport units (`h-dvh` or `min-h-dvh`) for full-screen app shells, camera scanner views, and modal drawers:

```tsx
// Full-height mobile app shell
export default function MobileAppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-50 text-neutral-900">
      <header className="flex-none border-b border-neutral-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-sm font-bold uppercase tracking-wider">Itechtivity 2027</span>
          <span className="border border-neutral-300 rounded px-2 py-0.5 text-xs font-medium">Booth CS-01</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3">
        {children}
      </main>
    </div>
  );
}
```

### 2.2 Next.js 15 Viewport Configuration & Safe Areas
Modern mobile screens feature notches, Dynamic Islands, and bottom home indicator bars. Export the official Next.js 15 `viewport` configuration in the root or route layout:

```typescript
// app/layout.tsx or app/(booth)/layout.tsx
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};
```

Padding with hardware safe areas:
* Top headers / navbars: `pt-[env(safe-area-inset-top)]`
* Bottom action bars / footers: `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (ensures a baseline buffer on devices where the inset evaluates to 0px)
* Full horizontal screen coverage: `px-[env(safe-area-inset-left)]` and `px-[env(safe-area-inset-right)]`

---

## 3. Touch Ergonomics & Thumb Zone Design

Mobile users operate handheld devices with one thumb in dynamic, high-distraction event environments.

### 3.1 The 44x44px Touch Target Rule
Every interactive control, button, input trigger, and tab item must provide at least a **44x44px** hit target:
* Apply `min-h-11 min-w-11` (`min-h-[44px] min-w-[44px]`) to all actionable elements.
* On smaller visual icons (e.g., 20x20px), expand the hit boundary using padding: `p-3` around an `h-5 w-5` icon.

### 3.2 Thumb-Zone Layout Prioritization
Divide the mobile viewport into reachability zones:
* **Natural Thumb Zone (Bottom 40%):** Place primary call-to-action buttons (e.g. "Start Scanner", "Confirm & Bind", "Manual Entry", "Submit Vote").
* **Stretch Zone (Middle 35%):** Place live tallies, booth award lists, and recent scan logs.
* **Hard-to-Reach Zone (Top 25%):** Reserve strictly for persistent headers, booth identity badges, and sign-out buttons.

### 3.3 Touch Latency Elimination & Text Selection Guards
Prevent accidental double-tap zoom delays and text highlighting during rapid button tapping:
* Add `touch-manipulation` to all buttons and interactive cards to remove the 300ms mobile tap delay.
* Add `select-none` to prevent accidental text highlight callouts when tapping fast.
* Add `active:scale-[0.98] transition-transform` for immediate tactile micro-interaction feedback.

```tsx
<button
  type="button"
  className="flex min-h-12 w-full select-none touch-manipulation items-center justify-center gap-2 rounded border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
>
  Confirm Ticket Redemption
</button>
```

---

## 4. Mobile Form & Virtual Keyboard Discipline

Virtual keyboards compress mobile viewports by 40% to 50% upon input focus, often obscuring submit buttons and causing jarring automatic zoom.

### 4.1 iOS Auto-Zoom Prevention (16px Rule)
iOS Safari forces a viewport zoom-in whenever an `<input>` or `<textarea>` has a font-size smaller than 16px ($1\text{rem}$), destroying layout alignment.
* Every form input on mobile must use `text-base` or `text-[16px]`:
  ```tsx
  <input
    type="text"
    className="min-h-11 w-full rounded border border-neutral-300 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
  />
  ```

### 4.2 Keyboard Types via `inputmode`
Always declare `inputmode` and `enterkeyhint` to trigger the most ergonomic keyboard for the field:
* Student ID / Card Serial numbers: `inputmode="numeric"` or `inputmode="text"` with `autoCapitalize="characters"`.
* Passwords / Email: `inputmode="email"`, `autoCapitalize="none"`, `autoComplete="email"`.
* Action button on keyboard: `enterKeyHint="done"` or `enterKeyHint="go"`.

---

## 5. Mobile Camera Viewfinder & Scanner Ergonomics

Exhibitors scan physical paper stubs handheld at booth tables under variable lighting.

### 5.1 Single-Screen No-Scroll Viewfinder Layout
The scanner viewfinder, torch toggle, and result banner must fit entirely in one screen without vertical scrolling:

```tsx
'use client';

import { useState } from 'react';
import { Camera, Flashlight, Keyboard } from 'lucide-react';

interface ScannerLayoutProps {
  onManualEntryOpen: () => void;
}

export function MobileScannerShell({ onManualEntryOpen }: ScannerLayoutProps) {
  const [torchActive, setTorchActive] = useState(false);

  return (
    <div className="flex h-full flex-col justify-between">
      {/* Viewfinder Frame (1:1 Aspect Ratio) */}
      <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded border border-neutral-300 bg-neutral-950">
        <div id="html5qr-code-scanner-element" className="h-full w-full" />
        
        {/* Subtle Corner Reticle Alignment Marks */}
        <div className="pointer-events-none absolute inset-6 border border-white/40" />

        {/* Torch Toggle Overlay Button */}
        <button
          type="button"
          onClick={() => setTorchActive(!torchActive)}
          className="absolute right-3 top-3 flex min-h-11 min-w-11 items-center justify-center rounded border border-white/60 text-white backdrop-blur-sm active:scale-95"
          aria-label="Toggle Flashlight"
        >
          <Flashlight className="h-5 w-5" />
        </button>
      </div>

      {/* Thumb-Zone Secondary Fallback Actions with Baseline Safe Area Buffer */}
      <div className="mt-4 flex flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onManualEntryOpen}
          className="flex min-h-11 w-full select-none touch-manipulation items-center justify-center gap-2 rounded border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-transform active:scale-[0.98]"
        >
          <Keyboard className="h-4 w-4" />
          Enter Stub Serial Manually
        </button>
      </div>
    </div>
  );
}
```

### 5.2 Multi-Sensory Hardware Feedback
Trigger instantaneous auditory and haptic feedback on successful decode so booth attendants know a scan succeeded without staring at the screen:
```typescript
export function triggerScanSuccessFeedback() {
  // Haptic feedback (supported on Android Chrome and PWA iOS)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([70]);
  }

  // Synthesized HTML5 Web Audio beep (no external audio assets needed)
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz A5 note
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // Auto-close audio context upon playback completion to free audio hardware channels
    osc.onended = () => {
      audioCtx.close().catch(() => {});
    };

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    // Graceful fallback if audio context is blocked by user gesture restrictions
  }
}
```

---

## 6. Mobile Bottom Sheet / Drawer Patterns

For manual serial entry, confirmation receipts, or filter menus, use slide-up bottom sheets anchored to the screen bottom rather than centered desktop modals.

* **Anchor:** Aligned to bottom with rounded top corners (`rounded-t-xl`).
* **Safe Area:** Bottom padding respects `pb-[env(safe-area-inset-bottom)]`.
* **Handle:** A clean monochrome drag handle bar (`w-12 h-1 bg-neutral-300 rounded-full mx-auto my-2`).
* **Focus Management:** Auto-focus the input upon sheet expansion.
