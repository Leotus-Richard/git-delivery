#!/usr/bin/env python3
"""Validate one standalone skill package without third-party dependencies."""
import argparse
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
ROOT_FILES = ("plugin.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json",
              "README.md", "LICENSE", "CHANGELOG.md", "NOTICE", "THIRD_PARTY_NOTICES.md")
PAYLOAD_DIRS = ("skills", "references", "assets", "docs")
IGNORED = {".git", "dist", ".local", "__pycache__", ".pytest_cache", ".venv", "node_modules"}


def read_json(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return data


def checked_path(path, root):
    if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
        raise ValueError(f"Linked package path: {path}")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Path escapes package: {path}")
    return path


def walk_files(root):
    """Do not traverse linked folders, Git metadata, caches, or generated output."""
    def visit(folder):
        for child in sorted(folder.iterdir()):
            if child.name in IGNORED:
                continue
            checked_path(child, root)
            if child.is_dir():
                yield from visit(child)
            elif child.is_file():
                yield child
    yield from visit(root)


def payload_files(source):
    source = Path(source)
    checked_path(source, source)
    if not source.is_dir():
        raise ValueError(f"Missing package directory: {source}")
    files = {}
    for relative in ROOT_FILES:
        path = checked_path(source / relative, source)
        if path.is_file():
            files[relative] = path.read_bytes()
    for folder in PAYLOAD_DIRS:
        path = checked_path(source / folder, source)
        if path.is_dir():
            files.update({p.relative_to(source).as_posix(): p.read_bytes() for p in walk_files(path)})
    return files


def scalar(header, key):
    """Read only required string fields, not arbitrary YAML or executable tags."""
    match = re.search(rf"^{key}:[ \t]*(.*)$", header, re.M)
    if not match:
        raise ValueError(f"Missing frontmatter field: {key}")
    value = match[1].strip()
    if value.startswith('"'):
        return json.loads(value)
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    if value in {">", ">-", "|", "|-"}:
        lines = []
        for line in header[match.end():].splitlines():
            if line.strip() and not line.startswith((" ", "\t")):
                break
            if line.strip():
                lines.append(line.strip())
        return ("\n" if value.startswith("|") else " ").join(lines)
    return value


def validate_skill(path, source):
    text = path.read_text(encoding="utf-8")
    header = re.match(r"\A---\n(.*?)\n---(?:\n|$)", text, re.S)
    if not header:
        raise ValueError(f"Missing skill frontmatter: {path}")
    name, description = scalar(header[1], "name"), scalar(header[1], "description")
    if not isinstance(name, str) or not NAME.fullmatch(name) or len(name) > 64 or name != path.parent.name:
        raise ValueError(f"Invalid skill identity: {path}")
    if name == "swe" or name.startswith("swe-"):
        raise ValueError(f"Excluded SWE skill: {name}")
    if not isinstance(description, str) or not description.strip() or len(description) > 1024:
        raise ValueError(f"Invalid skill description: {path}")
    # Check author-linked local resources in the active entrypoint. Historical
    # upstream reference documents are preserved evidence, not active routers.
    body = re.sub(r"```.*?```|~~~.*?~~~", "", text[header.end():], flags=re.S)
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", body):
        target = target.strip().split(' "', 1)[0].strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or target.startswith(("#", "//")):
            continue
        local = checked_path(path.parent / unquote(parsed.path), source)
        if not local.exists():
            raise ValueError(f"Missing skill resource: {path}: {target}")
    return name


def validate(source=ROOT):
    source = Path(source)
    checked_path(source, source)
    if not source.is_dir():
        raise ValueError(f"Missing package directory: {source}")
    list(walk_files(source))
    portable, codex, claude = [read_json(source / relative) for relative in ROOT_FILES[:3]]
    for field in ("name", "version", "description"):
        values = [manifest.get(field) for manifest in (portable, codex, claude)]
        if any(not isinstance(v, str) or not v.strip() for v in values) or len(set(values)) != 1:
            raise ValueError(f"Manifest identity mismatch: {field}")
    if not NAME.fullmatch(portable["name"]) or len(portable["name"]) > 64 or not VERSION.fullmatch(portable["version"]):
        raise ValueError("Invalid package name or version")
    if portable.get("$schema") != SCHEMA:
        raise ValueError("Unsupported portable schema")
    if not (source / "LICENSE").is_file() or not (source / "LICENSE").read_text(encoding="utf-8").strip():
        raise ValueError("A nonempty LICENSE is required")
    if not isinstance(portable.get("license"), str) or not portable["license"].strip():
        raise ValueError("Portable manifest requires an SPDX license expression")
    openai = portable.get("extensions", {}).get("com.openai", {})
    if codex.get("interface") != openai.get("interface"):
        raise ValueError("Codex interface metadata differs from portable metadata")
    if codex.get("skills") != "./skills/":
        raise ValueError("Codex skills path must be ./skills/")
    skills = sorted((source / "skills").glob("*/SKILL.md"))
    if not skills:
        raise ValueError("Package contains no active skills")
    names = [validate_skill(path, source) for path in skills]
    for path in (source / "skills").rglob("SKILL.md"):
        if path not in skills:
            raise ValueError(f"Unexpected nested active SKILL.md: {path}")
    if len(names) != len(set(names)):
        raise ValueError("Duplicate skill identity")
    return {"name": portable["name"], "version": portable["version"], "skills": names}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT)
    args = parser.parse_args()
    print(json.dumps(validate(args.source), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, TypeError) as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
