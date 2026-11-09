#!/usr/bin/env sh
# Required Notice: Copyright (c) 2026 Gennady Artamonov
# Removes dsh-plugin-figma from a DeepSeek Harness profile.
# Run ./uninstall.sh --help for the full option list.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v node >/dev/null 2>&1; then
    echo "node was not found in PATH. DeepSeek Harness runs on Node.js; install Node 22.3 or newer." >&2
    exit 1
fi

exec node "$root/scripts/install.mjs" --uninstall "$@"
