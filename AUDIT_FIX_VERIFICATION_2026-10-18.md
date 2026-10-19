# Audit fixes and verification - 18 October 2026

The confirmed code defects from `BROWSER_QA_AUDIT_2026-10-18.md` have been addressed. Browser retesting used the built-in browser at 360 x 800, 390 x 844, 430 x 932 and 1920 x 1080. Live camera decoding on physical phones remains unverified.

## Changes

| Finding | Fix | Verification |
|---|---|---|
| Duplicate/missing booth labels on cards | Number actual booth cells after skipping the two Master QR cells | All four cards in new batch #27 contain exactly CS-01 through CS-40, in order, once each; independently extracted from downloaded PDF and visually rendered |
| Guest organization leaks into next attendee | Clear affiliation after success and category changes; server Zod transformation removes fields inappropriate to the attendee category | Fresh guest then alumni registrations passed; guest field reset to empty; alumni history has no prior organization; schema regression covers all four categories |
| False duplicate warning on first card entry | Keep a synchronous queue reference for camera/manual events; state updater no longer communicates its result through a local variable | New card displayed `Queued Card: B27-B27-0001`, without a false duplicate warning |
| Login redirect stalls or sends another role into an access loop | Validate role-compatible local return paths; normalize traversal; navigate with the newly issued cookie instead of racing router push/refresh | Production portal -> login -> production passed; exhibitor return path with registration login correctly opened registration |
| Mobile PDF close/download controls offscreen | Independent close control, wrapping two-column actions, bounded native dialog | Controls remained inside 360/390/430/1920px viewports; all action heights at least 44px |
| PDF dialog focus escapes | Native modal dialog, explicit focus wrapping, initial focus on Close, restore invoking button on dismissal | Shift+Tab from Close focused Download inside dialog; Tab returned to Close; Escape dismissed and restored Preview File focus |
| Preview is a decorative blueprint rather than saved content; native PDF frame blank in embedded browser | PDF.js canvas renders the actual authenticated saved PDF; remove hardcoded awards and QR placeholders; keep open/download fallbacks | Actual batch #27 rendered visibly at 360px; multi-page batch #25 sheet 2 finished rendering with `aria-busy=false` and no error |
| QR-image input fails | Shared bounded jsQR decoder; image-loading fallback for embedded browsers; persistent actionable errors | Previously failing Master QR fixture queued successfully; actual signed stub image from batch #27 was accepted as a vote |
| Camera request stays pending | Shared scanner with 15-second deadline, cancel/retry, explicit permission errors, late-stream cleanup, bounded frame decoding and camera switching | Pending request exited to retry/fallback guidance after its deadline; actual device decoding and multi-camera switching remain hardware checks |
| Mobile logout unnamed; form labels disconnected | Permanent logout accessible labels; associate field labels and IDs; name scan/serial inputs; visible keyboard focus | Mobile browser exposed Logout by name; login exposes Email Address and Password; registration exposes name/contact/student/organization/card fields |
| Long admin page | Overview, Cards, Booths and Programs sections; booth search and 10-row pagination in standings and registry | Cards section before lookup fits one viewport at all four tested sizes; CS-40 filtering and registry page 2 worked |
| Transient errors and stale result presentation | Persistent registration and card-lookup alerts; clear prior receipt/result before a new request | Duplicate activation displayed persistent `Cards already bound` alert; missing-card lookup displayed a persistent recovery message |
| Technical/raw UI language and inconsistent styling | Plain sign-in/scan errors, readable attendee types, count grammar, clarified redemption-rate denominator, outline action buttons | Reviewed mobile scanner and 1080p admin screenshots; preview has explicit saved-file wording |
| Quick credentials on login | Render test-account controls only in development | Development controls retained for local QA; production build completed with the development block excluded |

## Implementation notes

- `src/lib/pdf/booth-grid.ts` supplies the corrected numbering for `a4-sheet-renderer.ts`.
- `src/lib/registration/demographics.ts` validates and sanitizes attendee data before the registration transaction. Existing atomic activation and redemption operations were preserved.
- `src/lib/auth/redirect.ts` restricts sign-in destinations to compatible local portals, including normalized path traversal checks.
- `src/components/ui/qr-scanner.tsx` is shared by registration and exhibitors. It releases streams that arrive after cancellation or timeout. `src/lib/scanner/decode-image.ts` caps image input at 10 MB and bounds decoder canvas dimensions.
- `src/components/production/saved-pdf-page.tsx` loads the saved file and renders one page at a time. PDF worker/fonts are prepared by `scripts/prepare-pdf-viewer.mjs` during install, dev startup and build. No PDF.js resources are fetched from a third-party CDN.
- `src/components/admin/admin-workspace.tsx` separates operational tasks. Existing role/API permissions were not broadened.
- Shared selectors expose expansion/selection state and support arrow-key navigation and Escape.
- Added `jsqr` and `pdfjs-dist`; lockfile updated. Existing files were backed up under `storage/audit-fix-baseline-20261018/` before editing.
- Excluded `storage` from TypeScript source discovery so QA artifacts and source backups are not compiled as application code.
- Updated older QA-runner selectors for task sections, saved-page canvases and camera video. Their external-browser suites were not executed in this run. One existing registration fixture was repaired to use the real Prisma stub status, master identifier and signing field.

## Checks

Passed:

- TypeScript: `npx tsc --noEmit`.
- Lint: `npm run lint`.
- Production build: `npm run build`.
- Targeted regressions: `npm run test:audit` checks all 40 booth labels, matching/mismatched/external/traversal redirects, all four attendee field contracts, whitespace validation, and actual PDF generation.
- Existing cryptographic suite: 9 passed, 0 failed.
- Existing PDF geometry suite: 29 passed, 0 failed.
- Independent downloaded-PDF extraction and visual inspection of the corrected grid.
- Built-in browser: matching and mismatched login destinations, quantity 204/0 rejection without silent clamping, fresh four-card generation/download, guest-to-alumni data isolation, correct queue notification, persistent duplicate binding error, Master QR image decoding, signed stub image redemption, admin inspection, task navigation/search/pagination, mobile labels, modal focus/dismissal and actual saved PDF rendering.

The existing middleware-convention deprecation notice remains a build warning; it did not prevent compilation.

## Retest data and final state

- Created batch #27 with four cards. Total printed cards changed from 508 to 512.
- Registered `B27-B27-0001` to **Fix Verification Guest** with **Guest Only Organization**, transaction reference `a25e2a65`.
- Registered `B27-B27-0002` to **Fix Verification Alumni**, transaction reference `aafe1486`. No organization was carried into this record.
- Accepted one image-based vote from `B27-B27-0001-S1` at CS-01. Its total changed from 21 to 22; global votes are 27. Admin inspection confirmed that stub REDEEMED and the remaining five stubs ACTIVATED.
- No existing attendee records, PDFs, cards, votes or programs were deleted. The disabled QA program from the earlier audit remains disabled.
- Voting remains open, original award titles and award-lock state preserved.
- Application remains available over HTTP on loopback port 3000.

## Remaining verification limits

- Physical iOS/Android camera decoding, permission prompts, camera switching, torch/haptic/audio behavior, printing and optical scanning still require device testing.
- Browser image decoding and PDF display now pass in the embedded browser. That does not certify performance on every phone or accessibility with a screen reader.
- No production deployment, Heroku load/memory test, Appwrite Cloud transport verification, exhaustive API security audit, destructive cleanup or concurrent redemption test was performed.
- Older generated PDFs were deliberately preserved. They still contain their original printed layout; regenerate the required batches before printing. Old labeled QA records retain the historical carryover evidence.

## Review artifacts

- `storage/audit-fix-verification/changes.patch`: source changes relative to the pre-fix backup.
- `storage/audit-fix-verification/changed-files.json`: changed source-file list.
- `storage/audit-fix-verification/corrected-grid.png`: actual batch #27 rendered for visual inspection.
- `storage/audit-fix-verification/corrected-grid.pdf`: isolated renderer regression output, not a registered voting batch.
- `C:\Users\Daniel\Downloads\bingo-batch-027-cards-1-4.pdf`: downloaded new batch used for browser verification.
