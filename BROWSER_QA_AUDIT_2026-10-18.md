# Browser QA audit - 18 October 2026

Remediation follow-up: see `AUDIT_FIX_VERIFICATION_2026-10-18.md`. This file preserves the original audit findings and evidence.

## Outcome

The central generate -> download -> register -> activate -> redeem -> inspect lifecycle works locally through the built-in browser. This is a qualified pass for that lifecycle, not a full system or event-readiness pass. Printing, mobile preview, registration data isolation, login redirects, and accessibility have confirmed defects. Camera and QR-image operation need further verification.

Application source was not edited. The repository already had substantial uncommitted/untracked implementation files, so this audit preserved that work. Existing QA reports were used for orientation, not accepted as fresh test evidence.

## Environment and method

- Local Next.js development server, relaunched over HTTP at `http://127.0.0.1:3000` as requested. The listener remains restricted to loopback.
- Built-in browser driven with Computer Use; no external browser automation suite was substituted.
- Main interaction viewport: 390 x 844. Additional rendered layout checks: 360 x 800, 430 x 932, and desktop 1920 x 1080.
- Every main page was opened. The five seeded accounts were used: admin, production, registration, CS-01 exhibitor, and CS-02 exhibitor.
- Browser accessibility trees, DOM snapshots, rendered geometry, validation state, visible results, downloads, and selected console/server diagnostics supplied evidence.
- Browser screenshot capture failed through both documented screenshot methods, including a retry with browser visibility enabled. Consequently, browser aesthetics, clipping appearance, and contrast were not visually certified. Layout defects below are supported by measured element geometry.
- The downloaded batch #24 PDF was rendered and visually inspected using the PDF skill. An independent ZXing decoder read all 28 QR codes on its one page. Its actual signed tokens were used in browser forms; no forged session or direct database mutation was used to complete the lifecycle.
- A QR-image upload was followed by an in-app browser renderer crash. The browser recovered in a fresh tab and the server remained usable. This does not establish whether the crash originated in application code or the embedded browser.

## Execution plan and coverage

| Area | Executed | Outcome |
|---|---|---|
| Public home | Opened all portal destinations through mapped routes; followed production portal into login; measured portal links at all four sizes | Passed navigation/layout measurements; matching-role login redirect later stalled |
| Login | Empty submission, invalid credentials, all five quick test accounts, successful sign-in, role landing pages, logout | Required fields and invalid credentials passed; plain `/login` sign-ins passed; redirected sign-ins have defects |
| Signed-out route guards | `/admin`, `/production`, `/registration`, `/exhibitor` | All redirected to login with intended destination |
| Production role isolation | Attempted admin, registration, exhibitor pages | All rejected with `UNAUTHORIZED_ROLE` redirect |
| Registration role isolation | Attempted admin, production, exhibitor pages | All rejected with `UNAUTHORIZED_ROLE` redirect |
| Exhibitor isolation | CS-02 production-page attempt; separate booth identities/tallies; cross-booth duplicate stub | Unauthorized page rejected; totals remained booth-specific; duplicate rejected |
| Production generation | Four-card batch; quantity 5; boundary inputs 204 and 0; 200-card preset | Quantity 5 rejected by step validation; other values clamp to 200 and 4, respectively, and generated successfully |
| Production files | Refresh, reopen existing preview, A4 mode, PDF frame selection, PDF download | File list and downloads passed; PDF-frame source set correctly, actual embedded rendering not certified |
| Multi-sheet preview | Batch #25 sheet 1 -> sheet 2 -> sheet 1 | Passed; first serial changed from 0001 to 0005 and back; previous disabled on first sheet |
| Preview dismissal | Escape and close button on desktop | Passed dismissal; mobile close control offscreen; focus containment failed |
| Registration categories | CSD, non-CSD, guest with organization, alumni | All activated cards successfully; guest organization leaked into following alumni record |
| Registration selectors | Program search, no-match state, BSIT selection, year 4, section B | Selection and receipt passed; custom-program option is also exposed in no-match state |
| Registration queue | Plain and `MASTER:` serial entry, remove queued card, new-card queueing | Normalization/removal passed; fresh cards misleadingly reported as already queued |
| Registration binding | Four cards, four separate attendees; receipt and history; duplicate activation retry | Activation/receipt/history passed; duplicate prevented, with `ALREADY_ACTIVE` server evidence; duplicate error was not reliably visible in captured browser state |
| Registration camera | Start and close | Remained on starting state for over a minute in this environment; closed successfully; actual scanning blocked |
| Registration QR image | Uploaded independently decoded Master QR crop | No card queued before embedded browser crashed; failed/blocked in this environment |
| Exhibitor manual voting | Malformed token; genuine inactive token; genuine active tokens; same-booth and cross-booth retries | Rejections correct; all six awards accepted exactly once through sequential browser checks |
| Exhibitor tally/history | CS-01 and CS-02 before/after voting; CS-02 reload | CS-01 20 -> 21; CS-02 0 -> 5, persisted after reload |
| Exhibitor QR image | Uploaded independently decoded S3 crop | Decoder warning; no vote recorded; same token later worked through manual entry |
| Admin statistics | Cards, votes, slot totals, demographics, standings, refresh | Matched browser-created data; all four attendee categories represented |
| Admin awards | Edit/save slot 6 title; restore title; lock/unlock | Passed; editing disappeared while locked; original title/state restored |
| Admin voting control | Freeze then reopen | UI/state controls passed and restored; a vote submitted while frozen was not tested |
| Admin card inspector | Redeemed card; `MASTER:` inactive card; nonexistent card | Six correct redeemed stubs and destinations; six inactive stubs; missing-card result cleared prior details |
| Admin booth management | Edit CS-02 table assignment, save, verify registry, restore; refresh | Passed existing-record update; no passwords changed or accounts provisioned |
| Admin academic programs | BSEMC disable/re-enable; add QA program; verify in registration; disable QA program; refresh | Passed; original four programs active and QA program disabled at end |

## Confirmed defects

### P1 - Printed cards omit two booth numbers

Reproduction: production -> generate four cards -> download batch #24 -> inspect the stamp grid.

Each card repeats CS-17 and CS-24 and omits CS-20 and CS-21. Both the HTML sheet preview and downloaded PDF contain this error. The rendered PDF visibly confirms it. Attendees cannot complete a correct one-stamp-per-booth card using these labels.

The preview's numbering logic in `src/components/production/pdf-preview-modal.tsx` subtracts two for selected positions around a two-cell Master QR area rather than numbering only actual booth cells. Fix both preview and PDF output, and verify the exact set CS-01 through CS-40 occurs once per card. This run did not locate and modify the PDF-generation implementation.

### P1 - Guest organization carries into the next attendee

Reproduction:

1. Register guest `Browser QA Guest 20261018` with organization `QA Test Organization`, card `B27-B24-0003`.
2. Switch to Alumni and register `Browser QA Alumni 20261018`, card `B27-B24-0004`.
3. Inspect the registration history: the alumni row contains `QA Test Organization`, although no organization field was shown for that submission.

Root cause: `src/components/registration/registration-counter.tsx:330` submits affiliation without conditioning it on attendee type. The success reset around lines 358-361 clears name, student number, contact and cards, but leaves affiliation. Clear purchaser-specific fields after success and exclude irrelevant fields on category change/submission; enforce the same category contract server-side.

### P1 - Mobile PDF preview hides close/download controls

Reproduction: open any PDF preview at 360, 390, or 430 pixels wide.

At all three widths, Download PDF spans x=334-463 and Close spans x=471-515. The close button is entirely outside all tested mobile viewports. New Tab is only 42 pixels wide. Desktop controls fit at 1920 pixels.

Likely structural contributor: the toolbar in `src/components/production/pdf-preview-modal.tsx:88` is a nonshrinking flex group. Give the toolbar its own full-width wrapping row, make close independently anchored and always visible, and ensure every control remains at least 44 x 44. Test actual touch dismissal afterward.

### P1 - Login with a redirect can leave the user stranded

Two observed paths:

- Visit a protected exhibitor URL signed out, then authenticate as registration. Login succeeds, but the requested exhibitor route rejects the role and returns to `/login?error=UNAUTHORIZED_ROLE`; there is no visible explanation of that parameter.
- Follow the production portal while signed out, then use the production account. Authentication succeeds with a welcome message, but the page remains at `/login?redirect=%2Fproduction` with disabled `Signing in...` for over 30 seconds. Direct browser navigation to `/production` works with that same authenticated session.

`src/app/login/page.tsx:56-76` follows the redirect without a role compatibility check and immediately calls `router.refresh()` after pushing. The source establishes the missing role check; the exact cause of the matching-role navigation stall remains unproven. Validate destinations, fall back to the account's role home, render access errors, and ensure loading exits if navigation does not complete.

### P2 - Fresh card entry emits a false duplicate warning

Reproduction: add a new batch #24 serial once. One card appears in the queue, but the toast says it is already in the queue. Reproduced with 0001, 0002, 0003 and 0004.

Root cause: `src/components/registration/registration-counter.tsx:128-137` sets a local `added` variable inside a React state updater and reads it immediately afterward. That updater is not a synchronous result channel. Decide duplicate status from current queue state and keep updater functions free of outcome signaling.

### P2 - Dialog focus escapes behind the preview

With a PDF dialog open, Shift+Tab from its first mode control focused a file download link behind the dialog. `aria-modal=true` alone does not trap focus. Opening the preview also left focus on the invoking Preview File button. Add initial focus, focus containment, an accessible dialog title, and return focus to the invoking control after dismissal. Escape already works.

### P2 - Mobile logout and login fields lack accessible names

At mobile sizes the four portal headers expose an unnamed button. Their only Logout text is hidden below the `sm` breakpoint and no persistent accessible label is supplied. A role locator for button `Logout` fails on mobile and works on desktop.

Login inputs had zero associated labels and no `aria-label`; visible labels in `src/app/login/page.tsx:93,105` are not programmatically associated with the inputs. Add `htmlFor`/`id` pairs and permanent logout labels. Audit the other form fields for the same pattern.

## Failed or blocked checks requiring follow-up

| Check | Evidence and limit | Follow-up |
|---|---|---|
| QR-image scanning | S3 image independently decoded; app logged `Failed to decode QR from image file: Event`; manual submission of that token succeeded. Registration image attempt preceded embedded browser crash | Reproduce with the supplied fixtures in physical Chrome/Safari and diagnose image loading/decoder lifecycle; do not assume a cryptographic failure |
| Camera initialization | Registration remained on `Starting camera for Master QR scan...` for over a minute | Add permission/start timeout, cancel/retry and direct fallback; verify actual cameras on phones |
| Screenshot/visual browser QA | Every screenshot attempt failed at the browser tool layer | Repeat visual inspection once capture works; current layout evidence is DOM/geometry-based |
| Native PDF viewer | Frame source changed correctly; frame rendering not verified | Test browser PDF support and fallback on iOS/Android |

## UI assessment and recommended improvements

The role separation and direct operational tasks are a useful foundation. Most measured controls meet 44 x 44 and inspected text inputs use 16px fonts. Main page widths fit the tested mobile sizes and desktop. The strongest usability problem is how much navigation and technical interpretation staff must perform during repetitive event work.

This assessment is based on interaction, accessible structure and layout measurements; it is not a complete visual styling or contrast verdict because browser screenshots were unavailable.

1. **Fix the preview toolbar first.** A mobile operator must always be able to close the preview. Stack mode controls and download actions, and keep close in a stable reachable position.
2. **Split admin into task sections.** With a card expanded, the page measured 14,316px tall at 390 x 844 and 8,563px at 1920 x 1080. Before the extra QA program, desktop card inspection began around y=4,456 and program configuration around y=7,890. Use Overview, Awards, Cards, Booths and Programs tabs or links. Add booth search and pagination rather than rendering 40 standings plus 40 registry entries in one long page.
3. **Make scanning a compact task screen.** Keep scan, fallback and persistent result together in the thumb zone. Keep tally/history secondary. Provide clear camera-permission, unavailable-device and timeout guidance.
4. **Use plain operational language.** Replace `Stub QR Payload / Cryptographic Token` with `QR code text`, `INVALID_EMAIL_OR_PASSWORD` with `Email or password is incorrect`, and technical access codes with recovery guidance. Show the award and short card serial with every accepted or rejected scan.
5. **Keep validation beside the field/result.** Duplicate binding and missing-card errors should remain visible until corrected, rather than relying exclusively on transient toasts. Never show a stale prior receipt as if it describes the current failed submission.
6. **Correct form semantics.** Associate labels, expose selected category state, implement keyboard-friendly searchable lists, and name icon controls. Preserve a visible focus indicator. Mobile sizing passes do not establish accessibility by themselves.
7. **Make previews faithful.** The default A4 view uses decorative QR placeholders and hardcoded award titles; it is a blueprint rather than a rendering of the saved PDF. Label it explicitly or render the actual saved pages so users can trust what they approve for printing. A renamed award must not be represented by an unrelated hardcoded title.
8. **Clarify quantities and metrics.** Tell users when a typed quantity is clamped. Show singular/plural correctly (`1 card`, `1 vote`, `1 sheet`). Replace raw `NON CSD_STUDENT` display with `Non-CSD student`. Explain redemption rate as used stubs divided by activated stubs.
9. **Keep test login conveniences visibly local.** Quick role controls are useful for rehearsal but should be gated out of production. This audit only observed them in local development and did not establish production exposure.
10. **Retain the project's restrained styling.** Favor clear text, borders and spacing; avoid adding colored status pills or icon backplates. The current preview source uses filled mode/download buttons, which should be reconciled with the repository's strict no-background-fill policy during design remediation.

## Checks not completed

- Card voiding, program deletion, and permanent cleanup were not executed. They are destructive operations under repository rules and were not needed to verify the safe lifecycle. No destructive confirmation is being requested by this report.
- New scanner-account provisioning and password changes were not performed. Existing-account metadata editing was tested with the password left untouched.
- Not every combination of role and protected route/API was exercised. The table lists the exact browser route checks; this is not a complete API authorization/security assessment.
- Frozen-vote server rejection, same-key idempotency replay, concurrent double scans, browser offline/slow-network replay, session expiry, and security bypass attempts were not verified.
- No production deployment, Heroku memory/load test, Appwrite Cloud upload/realtime transport proof, or venue concurrency test was performed. Local tally updates and a `Real-Time Fanout Active` label do not prove Appwrite transport.
- Physical iOS/Android devices, software keyboards, safe areas, glare, torch, actual camera decoding, vibration, audible feedback, screen readers, and paper printing/scanning remain unverified.
- Full keyboard-only coverage, contrast certification, and theme coverage remain incomplete. PDF-dialog keyboard behavior was specifically tested and failed containment.
- The maximum batch PDF was checked for page/card count and unique serials; its 1,400 QRs were not all decoded and all 50 pages were not visually inspected.

## Test data and final state

| Item | Final state |
|---|---|
| Local server | HTTP, loopback port 3000; no source/config change needed to relaunch |
| Production baseline -> final | 23 -> 26 batches; 300 -> 508 cards |
| Created batches | #24: 4 cards; #25: 200 cards; #26: 4 cards |
| Cards registered | Batch #24 cards 0001-0004, one attendee each |
| QA attendee names | Browser QA 20261018; Browser QA NonCSD 20261018; Browser QA Guest 20261018; Browser QA Alumni 20261018 |
| Registration references | `076aacca`, `d0edde9b`, `84bfabe3`, `78f57abc` |
| Registered card count | 32 before this run -> 36 final |
| Votes | 20 before this run -> 26 final; six new votes from card 0001 |
| Vote allocation | S1 -> CS-01; S2-S6 -> CS-02 |
| Award titles | Original titles restored, including Best Innovation |
| Voting | ACTIVE, restored after freeze/open check |
| Award lock | Unlocked, original state restored |
| CS-02 table | Booth-2, restored after metadata test |
| Original academic programs | BSCS, BSIT, BSIS, BSEMC active |
| QA academic program | QA20261018 exists but is disabled; retained rather than deleted |
| Authentication | Signed out at end of interaction checks |

The guest/alumni organization carryover remains in labeled QA records as evidence; no existing attendee data was edited to hide the defect. Generated batches, cards, votes and QA program were not deleted.

## Artifacts

- Downloaded one-page PDF: `C:\Users\Daniel\Downloads\bingo-batch-024-cards-1-4.pdf`.
- Downloaded maximum batch PDF: `C:\Users\Daniel\Downloads\bingo-batch-025-cards-1-200.pdf`.
- Rendered batch #24: `storage/browser-audit-batch24.png`.
- QR fixtures extracted from that actual PDF: `storage/browser-audit-master-0002.png`, `storage/browser-audit-stub-0001-s3.png`.
- Independent decoded QR data: `storage/browser-audit-qr.json` (contains test bearer tokens; do not publish it).
- HTTP server diagnostics: `storage/browser-audit-http.log`, `storage/browser-audit-http-error.log` (local only; may contain operational details).
- The 200-card PDF contains 50 A4 pages, 200 distinct card serials, first `B27-B25-0001`, last `B27-B25-0200`, page size 595.28 x 841.89 points.

Prioritize the P1 printing, registration data, mobile preview and login navigation defects before an event rehearsal, then re-run their exact reproduction steps on physical phones. This report does not certify release readiness.
