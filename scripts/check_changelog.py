#!/usr/bin/env python3
from __future__ import annotations

import subprocess
from typing import List


def _changed_files_in_head() -> List[str]:
    output = subprocess.check_output(
        ["git", "show", "--name-only", "--pretty=format:", "HEAD"],
        text=True,
    )
    return [line.strip() for line in output.splitlines() if line.strip()]


def main() -> int:
    changed = _changed_files_in_head()
    if not changed:
        print("No changed files detected in HEAD")
        return 0

    if "CHANGELOG.md" in changed:
        print("CHANGELOG.md present in HEAD commit")
        return 0

    # If only meta files changed, keep pass. Otherwise enforce changelog.
    meta_only_prefixes = (".github/",)
    meta_only_files = {"README.md", "LICENSE", ".gitignore"}

    non_meta = [
        f
        for f in changed
        if f not in meta_only_files and not any(f.startswith(prefix) for prefix in meta_only_prefixes)
    ]

    if non_meta:
        print("ERROR: CHANGELOG.md is missing from HEAD commit while non-meta files changed.")
        print("Changed files:")
        for file in changed:
            print(f"- {file}")
        return 1

    print("Only meta files changed; changelog check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
