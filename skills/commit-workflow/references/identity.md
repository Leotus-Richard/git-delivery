# Requester identity

Use the requester's explicitly confirmed Git alias and corresponding email for both author and committer of new task commits. Do not use an AI, bot, harness or platform identity, and do not infer either identity field from login, account email or environment defaults.

Repository config may provide a candidate identity, but configuration existence is not requester confirmation. If the requester has not confirmed the identity, prepare the message and diff; stop at the commit boundary and ask for alias/email or confirmation of the repository's identity. Never request credentials. A verified private/noreply address is acceptable when selected by the requester.

The gate requires `identity.confirmedByRequester: true`, a nonempty confirmationReference, alias and email. Keep this policy local and avoid bundling the requester's private identity into a publicly redistributed skill. The distributed example deliberately leaves identity unset.

Git has separate author and committer fields, and command environment values can override both; setting only --author does not control committer identity ([Git commit documentation](https://git-scm.com/docs/git-commit)). Use command-scoped environment values rather than changing global configuration:

```text
GIT_AUTHOR_NAME=<confirmed requester alias>
GIT_AUTHOR_EMAIL=<confirmed requester email>
GIT_COMMITTER_NAME=<confirmed requester alias>
GIT_COMMITTER_EMAIL=<confirmed requester email>
```

The helper emits those values and command-scoped user.name/user.email/useConfigOnly settings in a proposed invocation, but it never executes the commit. Preserve normal hooks/signing and inspect the actual commit afterward. Git's useConfigOnly setting prevents default identity guessing, while author/committer environment values take precedence over configuration ([Git configuration documentation](https://git-scm.com/docs/git-config)).

Do not amend, reset-author, rebase or rewrite existing commits merely to apply this policy. Preserve legitimate imported/cherry-picked authorship rather than attributing somebody else's contribution to the requester. Signing identity is separate: honor project policy and the user's authorized signing mechanism; do not borrow an agent key or forge a signature.

No co-author trailer or generated-by note is added. If the repository mandates a conflicting attribution rule, stop and surface the conflict rather than silently overriding it or the user's request. Do not falsely claim that no automation assisted; the rule controls commit metadata and message attribution, not the truth of answers when asked.
