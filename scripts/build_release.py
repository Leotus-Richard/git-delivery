#!/usr/bin/env python3
"""Build deterministic portable, Cursor, Gemini, and Antigravity release ZIPs."""
import argparse
import hashlib
from pathlib import Path
import sys
import tempfile
import zipfile

from build_host_packages import HOSTS, build_package, files_at
from validate_package import ROOT, payload_files, validate, walk_files


def zip_bytes(files):
    import io
    output = io.BytesIO()
    # ZIP_STORED keeps bytes deterministic across zlib and operating systems.
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for relative, content in sorted(files.items()):
            item = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            item.create_system = 3
            item.external_attr = (0o100644 << 16)
            archive.writestr(item, content)
    return output.getvalue()


def source_files(source):
    files = payload_files(source)
    for folder in ("scripts", "tests", ".github"):
        directory = source / folder
        if directory.is_dir():
            files.update({path.relative_to(source).as_posix(): path.read_bytes() for path in walk_files(directory)})
    for relative in (".gitignore", ".gitattributes", "TOOLING.md"):
        path = source / relative
        if path.is_file():
            files[relative] = path.read_bytes()
    return files


def write_identical_or_new(path, content):
    if path.is_symlink() or (path.exists() and (not path.is_file() or path.read_bytes() != content)):
        raise ValueError(f"Refusing to replace changed artifact: {path}")
    if not path.exists():
        path.write_bytes(content)


def build_release(source, output):
    source, output = Path(source), Path(output)
    identity = validate(source)
    output.mkdir(parents=True, exist_ok=True)
    if output.is_symlink():
        raise ValueError("Release output cannot be a symlink")
    prefix = f"{identity['name']}-{identity['version']}"
    payloads = {f"{prefix}-portable.zip": zip_bytes(source_files(source))}
    with tempfile.TemporaryDirectory(prefix="plugin-release-") as temporary:
        for host in HOSTS:
            native = build_package(source, host, Path(temporary))
            payloads[f"{prefix}-{host}.zip"] = zip_bytes(files_at(native))
    hashes = []
    for filename, content in sorted(payloads.items()):
        write_identical_or_new(output / filename, content)
        hashes.append(f"{hashlib.sha256(content).hexdigest()}  {filename}\n")
    checksum = f"{prefix}-SHA256SUMS.txt"
    write_identical_or_new(output / checksum, "".join(hashes).encode("utf-8"))
    return [output / filename for filename in sorted(payloads)] + [output / checksum]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=ROOT / "dist/releases")
    args = parser.parse_args()
    for path in build_release(args.source, args.output):
        print(path)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, TypeError) as exc:
        print(f"Release build failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
