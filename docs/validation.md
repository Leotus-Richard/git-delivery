# Recorded validation

Observed on Windows, 2026-10-20, Node.js 24.9.0.

- `node skills/commit-workflow/scripts/commit-gate.test.mjs`: **25 cases passed**.
- Native `claude plugin validate` accepted the package manifest.
- JSON parse, direct active Markdown links, skill directory/frontmatter identity, nested discovery and excluded-source checks passed.

Disposable synthetic Git repositories only; no real requester commits and zero network calls.

Manifest validation does not demonstrate live host behavior. These results do not establish macOS/Linux behavior, installed-host integration, or desktop runtime support. Repeat relevant checks in release CI.
