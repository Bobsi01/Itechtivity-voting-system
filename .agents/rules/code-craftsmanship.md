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
* Comments are reserved strictly for non-obvious mathematical formulas, security invariants, or cryptographic protocols.

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

To prevent anti-slop rules from hindering natural design flow, UI anti-slop enforcement is strictly limited to these four rules:

1. **Avoid Gradients Unless Meaningful:** Do not use decorative gradients unless they serve a clear functional or semantic purpose.
2. **No Background Colors on Text or Icons:** Avoid colored pill backgrounds behind text or colored container fills behind icons.
3. **No Redundant Eyebrow Labels:** Avoid small uppercase eyebrow text above headings (e.g., department/university sub-labels repeated above main titles) if the information is redundant.
4. **Avoid UI Redundancy:** Do not repeat information, labels, or subtitles that are already obvious from the primary heading or component context.

