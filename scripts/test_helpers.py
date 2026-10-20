#!/usr/bin/env python3
"""Run bundled Node helper tests only when the plugin contains such tests."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
tests = sorted(str(path.relative_to(root)) for path in root.glob("skills/*/scripts/*.test.mjs"))
if tests:
    subprocess.run(["node", "--test", *tests], cwd=root, check=True)
else:
    print("No bundled Node helper tests in this package.")
