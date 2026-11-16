---
name: mobile-web-ui
description: >-
  Procedures and component patterns for architecting mobile-first web app UIs with Next.js
  and Tailwind CSS. Use when building handheld viewport layouts (360px-430px), dynamic viewport
  shells (dvh), safe-area insets, mobile touch ergonomics, bottom sheets, mobile camera scanner
  viewfinders, or virtual keyboard form interactions. Do not use for server actions, route
  handlers, database migrations, or cryptographic verification.
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

### 1.2 Strict No Chromatic Background Colors on Text and Icons
Never wrap text, badges, status pills, or icons in chromatic background color fills unless explicitly instructed by the user (`src/lib/test/standards-checker.ts` rejects chromatic `bg-*` classes).
* Forbidden: `bg-green-100 text-green-800 rounded-full px-2`, `bg-blue-500/10 p-3 rounded-full`.
* Permitted: Neutral surface backgrounds (`bg-white`, `bg-neutral-50`), monochrome borders (`border border-neutral-300`), and high-contrast monochrome primary action buttons (`bg-neutral-900 text-white` or `hover:bg-neutral-900 hover:text-white`):
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

      <main className="flex-1 overflow-y-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
```

### 2.2 Next.js Viewport Configuration & Safe Areas (`src/app/layout.tsx`)
Modern mobile screens feature notches, Dynamic Islands, and bottom home indicator bars. Root layout (`src/app/layout.tsx`) exports the Next.js `viewport` configuration with `viewportFit: 'cover'` and applies safe-area insets to the root shell:

```typescript
// src/app/layout.tsx
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

Note: `src/app/layout.tsx` currently sets `maximumScale: 1` and `userScalable: false` for kiosk/scanner lock-in; do not tighten zoom restrictions further, and ensure all text meets Rule 7 contrast and Rule 12 `16px` input sizing so users do not need to zoom to read or type.

Padding with hardware safe areas:
* Top headers / navbars: `pt-[env(safe-area-inset-top)]`
* Bottom action bars / footers: `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (ensures a baseline `0.75rem` buffer when the hardware inset evaluates to `0px`)
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
* **Natural Thumb Zone (Bottom 40%):** Place primary call-to-action buttons (e.g. "Start Camera Scanner", "Scan QR Image", "Manual Stub Entry", "Submit Vote").
* **Stretch Zone (Middle 35%):** Place live tallies, booth award lists, and recent scan logs.
* **Hard-to-Reach Zone (Top 25%):** Reserve strictly for persistent headers, booth identity labels, and sign-out buttons.

### 3.3 Touch Latency Elimination & Text Selection Guards
Prevent accidental double-tap zoom delays and text highlighting during rapid button tapping:
* Add `touch-manipulation` to all buttons and interactive cards to remove the 300ms mobile tap delay.
* Add `select-none` on buttons (and `select-text` on copyable serials/tallies).
* Add `active:scale-[0.98] transition-transform` or high-contrast active state shifts (`active:bg-neutral-800`) for immediate tactile feedback.

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

### 4.1 iOS Auto-Zoom Prevention (`16px` Rule) & Contrast
iOS Safari forces a viewport zoom-in whenever an `<input>`, `<select>`, or `<textarea>` has a computed font-size smaller than `16px` (`1rem`), enforced automatically by `auditInputFontSize` in `src/lib/test/standards-checker.ts`.
* Use `text-base` (or `text-base sm:text-xs` when compact desktop sizing is desired) and high-contrast placeholders (`placeholder:text-neutral-500`, never `text-neutral-400` on white per Rule 7):
  ```tsx
  <input
    type="text"
    className="min-h-11 w-full rounded border border-neutral-300 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-500 focus:border-neutral-900 focus:outline-none"
  />
  ```

### 4.2 Keyboard Types via `inputMode`
Always declare `inputMode` and `enterKeyHint` to trigger the most ergonomic keyboard for the field:
* Student ID / Card Serial numbers: `inputMode="numeric"` or `inputMode="text"` with `autoCapitalize="characters"`.
* Passwords / Email: `inputMode="email"`, `autoCapitalize="none"`, `autoComplete="email"`.
* Action button on keyboard: `enterKeyHint="done"` or `enterKeyHint="go"`.

---

## 5. Mobile Camera Viewfinder & Scanner Ergonomics (`src/components/ui/qr-scanner.tsx` & `src/components/exhibitor/mobile-scanner.tsx`)

Exhibitors scan physical paper stubs handheld at booth tables under variable lighting. The production scanner uses native `navigator.mediaDevices.getUserMedia` + `jsQR` (with `decodeQrImage` photo upload fallback and manual `<stubSerial>.<PIN>` input)—do not reintroduce `html5-qrcode`.

### 5.1 Viewfinder, Camera Switching & Manual Fallback Pattern
Keep the viewfinder compact (`aspect-square max-w-[280px]` when active) with camera start/stop, multi-camera switching, image upload fallback, and manual entry toggle reachable in the bottom thumb zone:

```tsx
'use client';

import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { QrScanner } from '@/components/ui/qr-scanner';

interface ScannerLayoutProps {
  onDecode: (qrPayload: string) => Promise<void>;
}

export function ExhibitorScannerPanel({ onDecode }: ScannerLayoutProps) {

  const [showManualInput, setShowManualInput] = useState(false);

  return (
    <div className="flex flex-col gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Native getUserMedia + jsQR viewfinder with image upload fallback */}
      <QrScanner onDecode={onDecode} />

      <button
        type="button"
        aria-expanded={showManualInput}
        onClick={() => setShowManualInput(!showManualInput)}
        className="flex min-h-11 w-full select-none touch-manipulation items-center justify-center gap-2 rounded border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-neutral-900 hover:text-white"
      >
        <Keyboard className="h-4 w-4" />
        <span>{showManualInput ? 'Hide Manual Entry' : 'Manual Stub Entry'}</span>
      </button>
    </div>
  );
}
```

### 5.2 Multi-Sensory Hardware Feedback (`src/lib/scanner/feedback.ts`)
Every scan outcome triggers simultaneous visual, acoustic (`playAudioFeedback`), and haptic (`triggerHapticFeedback`) signals via `src/lib/scanner/feedback.ts`:

```typescript
// Production implementation in src/lib/scanner/feedback.ts
export function triggerHapticFeedback(isSuccess: boolean): void {

  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      // Single 80ms pulse on valid vote; triple pulse on rejection
      navigator.vibrate(isSuccess ? [80] : [120, 80, 120]);
    } catch (error) {
      console.warn('Haptic vibration error:', error);
    }
  }
}

export function playAudioFeedback(isSuccess: boolean): void {

  if (typeof window === 'undefined') {
    return;
  }

  const browserWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextClass = typeof AudioContext !== 'undefined'
    ? AudioContext
    : browserWindow.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (isSuccess) {
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1174, audioContext.currentTime + 0.08);
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.25);
    } else {
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.18, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.35);
    }

    oscillator.onended = () => {

      void audioContext.close();
    };
  } catch (error) {
    console.warn('Audio feedback initialization error:', error);
  }
}
```

Use `triggerMultiSensoryFeedback(isSuccess)` (or `playAudioFeedback` + `triggerHapticFeedback`) directly from `@/lib/scanner/feedback` rather than duplicating Web Audio boilerplate in components.

---

## 6. Mobile Bottom Sheet / Drawer Patterns

For manual serial entry, confirmation receipts, or filter menus on handheld devices, anchor drawers cleanly with baseline safe-area buffering:

* **Anchor:** Aligned to bottom with rounded top corners (`rounded-t-xl`).
* **Safe Area:** Bottom padding enforces `pb-[max(0.75rem,env(safe-area-inset-bottom))]` so devices without a home indicator retain a `0.75rem` bottom buffer.
* **Handle:** A clean monochrome drag handle bar (`w-12 h-1 bg-neutral-300 rounded-full mx-auto my-2`).
* **Focus Management:** Auto-focus the input upon sheet expansion (`text-base` minimum `16px` font size).
