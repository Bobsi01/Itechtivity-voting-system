# Agent Evaluation Guide - Itechtivity 2027

> **Author:** Daniel Bobis (GitHub: [@ItsMeYourNightmare](https://github.com/ItsMeYourNightmare))
> **Assisted by:** OpenAI Codex and Google Gemini

Start with [AGENTS.md](../AGENTS.md) for required rules, working boundaries, task-specific runbooks, and verification commands. This guide defines review questions and evidence expectations; it does not duplicate those requirements.

## Review focus

Evaluate concrete event-day conditions: intermittent Wi-Fi, constrained container memory, concurrent scans, dim exhibition lighting, and mobile browser limitations. Propose changes tied to a demonstrated failure mode or measurable benefit.

- **Cryptography and redemption:** Can malformed tokens reach the database? Can concurrent scans or retries create extra votes or partial state? See [Security](rules/security.md).
- **Authorization and isolation:** Can an account act outside its role, access another booth, or receive competitor tallies through APIs or Realtime? See [Security](rules/security.md).
- **Resource use and persistence:** Do PDF batches stay within measured memory limits? Do exports survive container replacement? Are connections bounded? See [Architecture](rules/architecture.md).
- **Handheld operation:** Can registration and exhibitor flows be completed in a compact viewport, dim lighting, and interrupted network conditions? See [UI and UX](rules/ui-ux.md).
- **Maintainability:** Can a student follow validation, state transitions, persistence, and error handling without hidden abstractions? See [Code quality](rules/code-quality.md) and [craftsmanship](rules/code-craftsmanship.md).

## Evidence and proposals

1. Identify the affected route, action, component, or service and trace its dependencies before proposing a change.
2. Explain the failure trigger, current behavior, expected behavior, and practical impact. Label unverified assumptions.
3. Assess security, concurrency, tenant isolation, compatibility, and recovery implications.
4. Follow the verification guidance in [AGENTS.md](../AGENTS.md#verification-and-delivery), using isolated data where checks mutate state.
5. Report exact files changed and checks performed. Keep source inspection, local runtime/browser results, production evidence, and physical-device evidence distinct.

Rules own policy. Skills own task procedures and examples. When these documents drift, correct the authoritative requirement or its references instead of adding another competing summary here.
