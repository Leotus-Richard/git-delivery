# Source and licensing notes

Source: user-supplied `Engineering Toolkit v1.3 (93 skills + plugin).zip`, toolkit version 1.3.0. Archive SHA-256: `03bfd3c788e224247fa1fd14f5d614961499e0ccf740df2d4f3ec2cfa75bd6ad`.

The owner explicitly selected MIT for supplied files missing a bundled license on 2026-10-20. Existing license and notice files are preserved in place. This is the owner's distribution choice, not a representation of an upstream author's licensing decision or endorsement. See [component records](source-components.json) for every included source skill and supplied notices.

Adaptations remove the monolithic dependency closure and global toolkit policy; local task entrypoints take precedence over historical source examples. Original skill-owned references, scripts and assets are retained. Nested source entrypoints are renamed ORIGINAL-SKILL.md to avoid accidental discovery. Optional principles are references rather than additional active skills. No excluded source family is included or reused.

Host-specific source examples are documentation, not installed integrations or verified runtime support. Helpers are optional and require task-specific configuration. This package does not implement the desktop runner, background scheduler or cross-host execution service.

## Windows receipt containment fix

The synthetic commit-gate suite revealed that Node default realpath preserved a Windows 8.3 temporary-directory alias while Git reported the long directory name. Receipt containment checks could therefore miss a file inside the worktree. The adapted helper uses native realpath consistently for repository, metadata and receipt-parent canonicalization; the existing worktree-receipt rejection test exercises this regression on Windows.
