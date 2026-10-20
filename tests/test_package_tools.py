"""Package boundary and deterministic release checks using synthetic fixtures."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_host_packages import build_package
from build_release import build_release
from validate_package import SCHEMA, validate


class PackageToolsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "plugin"
        self.skill = self.source / "skills/example/SKILL.md"
        self.skill.parent.mkdir(parents=True)
        self.skill.write_text("---\nname: example\ndescription: Explain an example.\n---\nUse [reference](../../references/example.md).\n", encoding="utf-8")
        self.write("references/example.md", "A bundled reference.\n")
        self.write("LICENSE", "MIT License\nCopyright 2026 Example\n")
        self.write("NOTICE", "Preserved upstream notice.\n")
        self.write("THIRD_PARTY_NOTICES.md", "Third-party attribution.\n")
        self.identity = {"name": "example-plugin", "version": "0.1.0", "description": "An example package."}
        self.manifests = {
            "plugin.json": {"$schema": SCHEMA, **self.identity, "license": "MIT"},
            ".codex-plugin/plugin.json": {**self.identity, "skills": "./skills/"},
            ".claude-plugin/plugin.json": dict(self.identity),
        }
        self.write_manifests()

    def write(self, relative, content):
        target = self.source / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def write_manifests(self):
        for relative, document in self.manifests.items():
            self.write(relative, json.dumps(document))

    def test_identity_mismatch_is_rejected(self):
        self.manifests[".claude-plugin/plugin.json"]["version"] = "0.2.0"
        self.write_manifests()
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            validate(self.source)

    def test_license_and_skill_resources_are_required(self):
        (self.source / "LICENSE").unlink()
        with self.assertRaisesRegex(ValueError, "LICENSE"):
            validate(self.source)
        self.write("LICENSE", "MIT License\n")
        (self.source / "references/example.md").unlink()
        with self.assertRaisesRegex(ValueError, "Missing skill resource"):
            validate(self.source)

    def test_excluded_swe_id_is_rejected(self):
        denied = self.source / "skills/swe-audit"
        denied.mkdir()
        self.write("skills/swe-audit/SKILL.md", "---\nname: swe-audit\ndescription: Excluded.\n---\nDo nothing.\n")
        with self.assertRaisesRegex(ValueError, "Excluded SWE"):
            validate(self.source)

    def test_resource_escape_and_symlink_are_rejected(self):
        self.skill.write_text("---\nname: example\ndescription: Explain an example.\n---\n[Outside](../../../outside.txt)\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "escapes"):
            validate(self.source)
        self.skill.write_text("---\nname: example\ndescription: Explain an example.\n---\nSafe.\n", encoding="utf-8")
        target = self.source / "references/linked.md"
        try:
            target.symlink_to(self.skill)
        except OSError:
            self.skipTest("Creating symlinks requires host permission")
        with self.assertRaisesRegex(ValueError, "Linked package path"):
            validate(self.source)

    def test_each_host_preserves_references_notices_and_skill_bytes(self):
        for host in ("cursor", "gemini", "antigravity"):
            native = build_package(self.source, host, self.root / "hosts")
            for relative in ("NOTICE", "THIRD_PARTY_NOTICES.md", "references/example.md", "skills/example/SKILL.md"):
                self.assertEqual((native / relative).read_bytes(), (self.source / relative).read_bytes())
            receipt = json.loads((native / ".library-provenance.json").read_text(encoding="utf-8"))
            self.assertIn("NOTICE", receipt["sourceFilesSha256"])

    def test_zip_rebuilds_are_deterministic_and_exclude_generated_data(self):
        self.write(".git/HEAD", "private Git metadata")
        self.write("dist/old.zip", "old generated output")
        self.write("scripts/example.py", "print('source tooling')\n")
        first = build_release(self.source, self.root / "release-a")
        os.utime(self.skill, (1_000_000_000, 1_000_000_000))
        second = build_release(self.source, self.root / "release-b")
        self.assertEqual({p.name: p.read_bytes() for p in first}, {p.name: p.read_bytes() for p in second})
        for archive_path in (p for p in first if p.suffix == ".zip"):
            with zipfile.ZipFile(archive_path) as archive:
                self.assertIn("NOTICE", archive.namelist())
                self.assertIn("THIRD_PARTY_NOTICES.md", archive.namelist())
                self.assertIn("references/example.md", archive.namelist())
                self.assertFalse(any(p.startswith((".git/", "dist/")) for p in archive.namelist()))
                if "portable" in archive_path.name:
                    self.assertIn("scripts/example.py", archive.namelist())

    def test_changed_artifacts_are_not_overwritten(self):
        paths = build_release(self.source, self.root / "release")
        paths[0].write_bytes(b"User-modified archive")
        with self.assertRaisesRegex(ValueError, "Refusing to replace"):
            build_release(self.source, self.root / "release")
        self.assertEqual(paths[0].read_bytes(), b"User-modified archive")

    def test_unmapped_runtime_is_not_silently_dropped(self):
        self.write("mcp.json", "{}")
        with self.assertRaisesRegex(ValueError, "skills only"):
            build_package(self.source, "gemini", self.root / "hosts")


if __name__ == "__main__":
    unittest.main()
