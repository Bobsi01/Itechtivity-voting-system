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
