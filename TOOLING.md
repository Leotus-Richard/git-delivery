# Standalone validation and release tooling

Copy `scripts/`, `tests/test_package_tools.py`, `.github/workflows/validate.yml`,
`.gitattributes`, and `.gitignore` from this common tooling directory into each
independent plugin repository. Preserve package-specific scripts and tests;
merge existing ignore/attributes entries rather than discarding them. Each
repository then works without access to the marketplace checkout.

Run from the plugin repository with Python 3.12 (use `py` on Windows if needed):

```text
python scripts/validate_package.py
python -m unittest discover -s tests -p test_package_tools.py -v
python scripts/test_helpers.py
python scripts/build_release.py
```

The validator uses only the standard library. It checks required string
frontmatter fields, active skill IDs, linked local resources, manifests, LICENSE,
and symlink/path boundaries; it is not a full YAML or JSON Schema implementation.
SWE IDs are excluded from active skills. Historical reference files are preserved
as evidence and do not become active skill entrypoints.

The release builder produces four ZIPs plus a package-specific SHA256SUMS file
under `dist/releases/`. Archives have flat package roots: extract each into a
dedicated package directory before passing it to a host importer. Portable ZIPs
include source manifests, skill resources, notices, and maintenance tooling.
Cursor, Gemini, and Antigravity ZIPs retain skill/resource bytes and attribution,
with the relevant native manifest and a source-file hash receipt. This is format
adaptation; host discovery and behavior need their own verification.

Archives use sorted entries, fixed timestamps/modes, and stored ZIP members for
reproducible bytes across platforms. Line endings are normalized through the
repository's `.gitattributes`. Changed existing build artifacts are rejected;
use a fresh output directory or a new version after source changes.

CI uses pinned Actions and Python 3.12/Node 22 on Ubuntu, Windows, and macOS.
Node helper tests run only when `skills/*/scripts/*.test.mjs` exists. The workflow
validates and builds artifacts; it does not publish a GitHub release or install
plugins. Push events are limited to main so release tags do not duplicate the
three-OS checks. After reviewing CI and source, publish the exact ZIPs and
checksums with the matching version tag through the authorized release process.
