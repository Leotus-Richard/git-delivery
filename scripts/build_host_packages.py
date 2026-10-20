#!/usr/bin/env python3
"""Export skill-only packages for Cursor, Gemini CLI, and Antigravity."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys
from validate_package import payload_files, validate

ROOT = Path(__file__).resolve().parents[1]
HOSTS = ("cursor", "gemini", "antigravity")
NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def files_at(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Not a regular package directory: {root}")
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Linked or escaping package path: {path}")
        if path.is_file():
            files[path.relative_to(root).as_posix()] = path.read_bytes()
    return files


def write_new_package(target, files):
    """Idempotent for identical contents; never replace an existing package."""
    if target.exists() or target.is_symlink():
        if files_at(target) != files:
            raise ValueError(f"Existing package differs; refusing to overwrite: {target}")
        return target
    target.mkdir(parents=True)
    for relative, content in sorted(files.items()):
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return target


def build_package(source, host, output):
    if host not in HOSTS:
        raise ValueError(f"Unsupported host: {host}")
    source = Path(source)
    if source.is_symlink() or not source.is_dir():
        raise ValueError(f"Not a regular source directory: {source}")
    validate(source)
    # Include root references and every shipped notice so relative skill links
    # and third-party attribution survive native host adaptation.
    source_files = payload_files(source)
    manifest = json.loads(source_files["plugin.json"])
    name, version = manifest["name"], manifest["version"]
    if not NAME.fullmatch(name) or not VERSION.fullmatch(version):
        raise ValueError("Invalid package name or version")
    if not isinstance(manifest.get("description"), str) or not manifest["description"]:
        raise ValueError("Missing package description")
    unsupported = ("mcp.json", ".mcp.json", ".app.json", "hooks", "rules", "agents", "commands")
    if any((source / item).exists() or (source / item).is_symlink() for item in unsupported):
        raise ValueError("Exporter supports skills only; executable host capabilities need an explicit adapter")
    openai = manifest.get("extensions", {}).get("com.openai", {})
    if set(openai) - {"interface"}:
        raise ValueError("Host-specific runtime settings need an explicit adapter")
    files = {path: data for path, data in source_files.items() if path.startswith(("skills/", "references/", "assets/", "docs/"))}
    if not any(path.startswith("skills/") and path.endswith("/SKILL.md") for path in files):
        raise ValueError("No skills to export")
    for path in ("README.md", "LICENSE", "CHANGELOG.md", "NOTICE", "THIRD_PARTY_NOTICES.md"):
        if path in source_files:
            files[path] = source_files[path]
    identity = {key: manifest[key] for key in ("name", "version", "description")}
    if host == "cursor":
        files["plugin.json"] = source_files["plugin.json"]
    elif host == "gemini":
        files["gemini-extension.json"] = encoded(identity)
    else:
        # Antigravity's manifest schema differs from the portable root schema.
        files["plugin.json"] = encoded({key: identity[key] for key in ("name", "description")})
    files[".library-provenance.json"] = encoded({
        "formatVersion": 1, "host": host, **identity,
        "sourceFilesSha256": {path: hashlib.sha256(data).hexdigest() for path, data in sorted(source_files.items())},
    })
    return write_new_package(Path(output) / host / name / version, files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=(*HOSTS, "all"), default="all")
    parser.add_argument("--source", type=Path, default=ROOT, help="One standalone plugin repository root")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/hosts")
    args = parser.parse_args()
    for host in HOSTS if args.host == "all" else [args.host]:
        print(build_package(args.source, host, args.output))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, TypeError) as exc:
        print(f"Export failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
