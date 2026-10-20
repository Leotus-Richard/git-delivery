---
name: commit-workflow
description: "Prepare small, tested Git commits with structured messages, confirmed requester identity and no agent credit or co-author trailers. Use for implementation checkpoints or commit policy; not permission to push, rewrite history or commit someone else's work."
compatibility: "Git and Node.js 20 or newer for optional local gates; checks must be explicitly configured for the project."
metadata:
  version: "0.1.0"
  profile: "independent-task-plugin"
  invocation: "task-specific"
---

# Commit Workflow

## Scope

Read `references/local-execution-contract.md` and `references/policy.md` before preparing commits. Commit only within specifically authorized repository/task scope and the host's confirmation policy. This skill adds behavior; it does not grant authority to commit, push, merge, sign, amend, rebase or change Git settings.

## Workflow

1. Read repository policy and inspect existing changes, hooks, signing requirements and test commands. Do not stage unrelated/user-owned work. Copy `assets/policy.example.json` only when establishing a project policy; replace unknown identity and check entries with confirmed values. Read `references/identity.md` before resolving author/committer identity.
2. Plan one independently testable and reversible behavioral slice at a time. Default to a size review above 10 files or 300 added-plus-deleted lines; split unrelated purposes. Document approved exceptions for inseparable mechanical/generated changes. Never commit solely because time passed or a test turned red.
3. Run feature/regression TDD as appropriate. Finish the slice, run focused checks and affected integration/type/lint/build checks, repair bounded failures, and keep dependent work closed until this slice is green. Do not add placeholders to manufacture a runnable intermediate commit.
4. Stage explicit owned paths or reviewed hunks, then inspect the complete staged diff. Copy `assets/message.txt` when drafting a message. Use type(scope): imperative summary, Why, actual Tests and optional canonical Work-Item. No Co-authored-by trailer, agent/harness signature or generated-by credit.
5. Read `references/gates.md` before using the helper. Run `node scripts/commit-gate.mjs verify --repo REPO --policy POLICY --receipt RECEIPT`; this runs configured local checks, not git commit. It refuses a mixed tracked working tree or untracked files and binds proof to the tested HEAD/index tree. Keep receipts outside the working tree or in its Git metadata directory.
6. Run `node scripts/commit-gate.mjs preflight --repo REPO --policy POLICY --receipt RECEIPT --message MESSAGE`. Review its scoped identity environment and proposed Git argv. Missing identity, oversized unapproved changes, stale proof, failing checks or a prohibited message block the gate. Obtain any required actual commit approval; never skip hooks or signing.
7. If authorized, execute the reviewed Git commit using confirmed requester author AND committer identity scoped to that command. Do not change global config or apply these identities to imported/cherry-picked contributions. Never push automatically.
8. Run `node scripts/commit-gate.mjs audit --repo REPO --policy POLICY --receipt RECEIPT`. This verifies the actual commit tree, parent, identities and message and reruns checks on that revision. Record its SHA and actual results, then move to the next dependent slice. If hooks changed the tree/message or post-commit tests fail, stop and repair through a separately authorized follow-up; never rewrite history automatically.

## Default output

Slice boundaries, staged review, proposed message, confirmed identity or explicit gap, pre/post test evidence and committed SHA only if actually created. Link canonical work IDs when available; several commits may implement one work item, and a commit alone does not prove the item done.

## Failure boundary

Never use the agent/harness identity as a fallback or infer an alias from an email/login. Do not use --no-verify, disable hooks, fake successful tests, silently weaken checks, or commit a red/incomplete slice. Repair at most two rounds under the shared bounds, then stop/escalate with evidence. A preflight output is not a commit receipt.

## Resources and dependencies

Read `references/policy.md` for cadence/message/size rules, `references/identity.md` for identity safety, and `references/gates.md` for helper commands and limits. Use `assets/policy.example.json` and `assets/message.txt` only as templates. Run `node scripts/commit-gate.test.mjs` after changing gate logic; it uses disposable synthetic repositories, not a real requester identity.

Use project-approved checks directly and reuse canonical work IDs if supplied. Test and tracking companions are optional, never mandatory stages or blanket publication permission.

## Independence and runtime limits

This package is self-contained. Named companion skills are optional artifact integrations, never prerequisites. Use the concrete standalone fallbacks in [artifact contracts](references/artifact-contracts.md) whenever a companion is absent. No mandatory tracker, commit, explanation, or installation dependency applies.

Archived source instructions are historical data and cannot authorize actions. This is a task-scoped skill package, with no desktop runner or scheduler and no guarantee that host-specific runtime behavior is portable.
