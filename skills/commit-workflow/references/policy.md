# Commit policy

Apply these defaults to the selected task; explicit repository policy can change message style and review thresholds, but must not weaken the requester's identity/no-credit rules or fabricate testing. The optional helper implements the default format; adapt and retest it before using a different project format.

## Cadence and boundaries

Create a commit at the end of each small, green, independently meaningful slice, not at the end of a large feature and not after every edit. Keep code, its focused tests and necessary same-slice docs together. Separate unrelated cleanup, dependency upgrades, formatting sweeps and generated churn. For migrations, choose expand/compatible intermediate/contract units that each remain runnable.

Use 10 changed files or 300 total added-plus-deleted lines as a default review trigger, not a universal definition of quality. Above either threshold, split or document an explicit reason and requester-approved exception. Binary changes require a reviewed evidence reference because line counts are not meaningful. Never evade a limit by spreading a logically atomic change into broken commits or by raising the configured limits without discussion.

There is no fixed minutes-per-commit target and no daily quota. A slice that cannot pass is unfinished; repair it before dependent work, or stop with evidence. Independent branches may proceed only within authorized ownership; they do not allow recording a failed slice as complete.

## Default message

```text
fix(parser): reject incomplete dependency contracts

Why: prevent routing work with missing input tokens
Tests: passed (unit, typecheck)
Work-Item: T-17
```

Use feat, fix, refactor, perf, test, docs, build, ci, chore, revert or style. Include a concise imperative summary; the helper limits the subject to 72 characters. Scope is optional but should identify the subsystem. An intentional breaking change uses ! and an explanatory BREAKING CHANGE footer. This format follows the core Conventional Commits prefix while adding this toolkit's Why/Tests policy ([Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)).

Why states intent rather than restating a diff. Tests lists the exact check IDs that actually passed for that slice, in configured order. Put detailed commands/results in the local receipt, not a misleading blanket "all tests pass." Work-Item uses a canonical local ID and does not invoke tracker-specific auto-closing behavior.

Never insert Co-authored-by trailers, agent/harness credits, generated-by signatures or agent names into author/committer identity. Do not strip legitimate copyright/license notices from source files; this policy concerns new commit attribution, not rewriting source provenance.

## Per-slice completion

1. Observe intended failure when TDD applies.
2. Implement the smallest complete behavior and review staged paths.
3. Run focused plus affected broader checks on the exact candidate tree.
4. Review message, size, identity, scope and authorization.
5. Create the local commit only when allowed.
6. Verify actual SHA/tree/parent/identity/message and rerun checks.
7. Attach actual SHA/evidence to the shared work record if used.

Commit creation and work-item completion are different events. Never mark a work item done until all its acceptance/output/gate obligations are met.
