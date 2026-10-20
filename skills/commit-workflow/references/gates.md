# Local commit gates

The helper runs explicitly configured checks and validates evidence/identity/messages. It is not a publisher, hook installer or git commit executor. No package installation, remote request or real repository commit is part of the bundled tests.

## Inputs

Use a project policy based on the example, with confirmed requester identity, default limits, and nonempty checks:

```json
{
  "id": "unit",
  "argv": ["npm", "run", "test", "--", "--run"]
}
```

This is an illustrative command, not a default or an inferred project command. Configure the actual repository's commands, including focused/integration/type/lint/build checks where relevant. Inspect commands before execution; do not use installation, deployment, remote writes or destructive operations as tests.

Receipts and message files must not create unintended untracked files in the tested worktree. Prefer a selected external task directory or the repository's Git metadata directory. The helper refuses tracked unstaged changes and nonignored untracked files; it does not silently stash/remove somebody else's changes. For a mixed tree, use a separately reviewed clean worktree or an isolated owned copy and run the gate there.

## Commands

```sh
node scripts/commit-gate.mjs verify --repo REPO --policy POLICY --receipt RECEIPT
node scripts/commit-gate.mjs preflight --repo REPO --policy POLICY --receipt RECEIPT --message MESSAGE
node scripts/commit-gate.mjs audit --repo REPO --policy POLICY --receipt RECEIPT
node scripts/commit-gate.test.mjs
```

Verify records actual argv, exit status and bounded stdout/stderr for every configured check. Its receipt binds the current HEAD, staged tree, policy hash and staged diff statistics. Checks have configured timeouts; any failure or repo drift blocks success. Receipts record completion, not cryptographic proof of test truth.

Preflight is read-only and requires unchanged HEAD/index/policy, a passing receipt, correct message check IDs, confirmed identity and reviewed size. It emits a proposed Git command with command-scoped identity. It does not execute that command, automatically obtain approval, stage files, skip hooks or configure signing.

After an actually authorized commit, audit verifies that its parent is the tested HEAD, its tree is the tested staged tree, both identities match the requester, and the message passes the rules. It requires a clean working tree/index and reruns checks on that commit. If a hook rewrites content or the parent changes, regenerate evidence rather than assuming the old tests cover the commit.

Audit failures leave history untouched. Stop dependent work and propose a small corrective commit; no automatic amend/reset/rebase/push. Any required broader CI remains a separate actual gate and cannot be inferred from local tests.

## Exceptions and limits

A size exception is `{reason, approvalReference, approvedByRequester: true}`. Binary review uses the same shape. An agent-created note is not approval.

Ignored files, dependencies, environment, clocks and services can affect tests without changing the index tree. The helper does not prove hermeticity or detect every ignored-file change. Record environment-specific limits; use the project's clean build/container procedure when needed. No gate prevents another process from racing after preflight; inspect the commit with audit, and use stronger isolation when the repository needs it.

The helper rejects pending merge/cherry-pick/revert/rebase workflows. Resolve these with their own authorized process. It detects a hooksPath configured to a null sink; it cannot prove every project hook or signing policy is installed correctly. It never supplies --no-verify or disables hooks.
