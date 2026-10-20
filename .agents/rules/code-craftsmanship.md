# Code Craftsmanship & Anti-Slop Rules

## 1. Zero-Toleration Quality Gates

### Gate 1: No Trivial or Redundant Comments
* Do not write comments that narrate the syntax or state the obvious.
* Forbidden:
  ```typescript
  // Set the error state
  setError(true);
  // Loop through items
  items.forEach(item => ...);
  ```
* Follow the [commenting standards](code-quality.md#3-commenting-quality-standards) for concise explanations of non-obvious constraints, formulas, security invariants, and failure modes.

### Gate 2: Strict Typing & Zero Type Escapes
* The following are strictly banned: `any`, `unknown as any`, `@ts-ignore`, `@ts-nocheck`, `Record<string, any>`.
* All external data (API requests, scan payloads, buyer registration forms) must be validated via Zod schemas with static type inference.

### Gate 3: Concrete Implementations Over Bloated Abstractions
* Reject multi-layered factory wrapper classes, provider managers, and premature micro-utilities.
* Write direct, idiomatic Next.js Server Actions and route handlers. Single clear functions are preferred over multi-level inheritance.

### Gate 4: Explicit Error Handling
* Never write empty or swallowed catch blocks (`catch (e) {}` or `catch (e) { console.log(e); }`).
* Always return a structured, typed error result object or re-throw a domain-specific error that surfaces a meaningful message to the user.

---

## 2. UI Anti-Slop Scope (Strictly Scoped)

UI anti-slop enforcement is strictly limited to the four constraints defined in [UI rules 2-5](ui-ux.md#rule-2-never-use-background-colors-on-text-or-icons): text/icon backgrounds, decorative gradients, redundant eyebrow labels, and repeated information. The separate accessibility and mobile requirements in that file still apply.

