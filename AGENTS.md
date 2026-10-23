# AGENTS.md

Radical-simplicity coding guidelines distilled from George Hotz's public philosophy. The reflex: **complexity is the enemy — remove before you add.** Merge with project-specific instructions as needed.

**Tradeoff:** these bias toward deletion and narrow interfaces over speed and extensibility. For trivial tasks, use judgment. Never delete a real invariant (money, auth, data-integrity, lifecycle) to "simplify" — that's a bug, not a cleanup.

## 1. Complexity is the enemy

**More capability at equal or lower complexity is the only real win.** Adding a feature by adding a layer is a loss.

- Solve the actual request with the least machinery that works.
- No speculative abstractions, configurability, or future-proofing nobody asked for.
- Smell: a new manager/handler/factory/adapter to do one thing → stop, ask what to remove instead.

## 2. You have never refactored enough

**Line count is a number you drive down. The best change is often a negative diff.**

- Delete-first: before touching a subsystem, ask "can this not exist?"
- Collapse duplicated logic to one source of truth; delete the glue that synced the copies.
- Prove something is dead before deleting it (check the callers). LOC is debt, not output.

## 3. Wide interfaces mean your abstraction is wrong

**A wide interface is a design signal, not a styling nit.**

- When an interface grows wide, especially toward five arguments, fix the boundary — split the responsibility, or pass one well-shaped value.
- Don't paper over it with an options/`**kwargs` bag so the count "looks" smaller.

## 4. Understand the whole stack — nothing is magic

**Don't reason about what code "should" do — look at what it does.**

- Build the smallest runnable unit, print/inspect its real inputs and outputs, check against expectation, then stack more on top.
- Read the definition and the callsites before concluding.
- Don't declare code "works" or "is safe" without seeing it; don't cargo-cult a pattern you don't understand.
- AI-generated code must be read and validated line by line; speed is not correctness.

---

**These guidelines are working if:** diffs trend smaller, the agent proposes deleting/collapsing before adding, interfaces stay narrow, and claims come with an observed value instead of "this should work."

## Project conventions

- GraphQL reads use Apollo hooks; do not add custom fetch hooks for GraphQL. Keep the small REST resource hook only for actual REST callers, and check every caller before removing it.
- Browser requests call Lambda directly with Supabase bearer tokens and credentials omitted. Fastify owns exact-origin CORS; GraphQL keeps Apollo's native CSRF prevention and its preflight header. Do not restore cookie sessions, auth proxy routes, or signed CSRF tokens.
- The API owns canonical rankings, validation, and authorization. Browser mappers validate response shapes and prepare display data; they must not become a second source of league rules.

## Refactoring evidence and structure changes

- Before deleting code, read its definitions and callers and record the evidence that it is unused or that it can be simplified or the logic can be condensed/simplified by deleting/pruning existing code.
- Use dependency-cruiser to check dependency boundary rules.
- Work in small batches and run typecheck/tests after each batch. Separate architecture changes from cleanup; record the current behavior, structural change, and smallest parity check for each pass.
- For an identical edit across more than two files, use a tested codemod.
- Use the [pinned Brooks PR Review skill](https://github.com/hyhmrright/brooks-lint/blob/c85f65eada5c56721275ef89e2dd41ac453dcba2/skills/brooks-review/SKILL.md) alongside ESLint for refactor reviews; it is advisory and does not replace typecheck, tests, or ESLint.
