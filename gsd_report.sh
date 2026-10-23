#!/usr/bin/env bash
cd /d/myapps/newsportal
_GSD_SHIM_NAME="gsd-tools.cjs"
_GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
GSD_TOOLS="${_GSD_RUNTIME_ROOT}/gsd-core/bin/${_GSD_SHIM_NAME}"
gsd_run() { node "$GSD_TOOLS" "$@"; }
echo "===STATE==="
gsd_run query state-snapshot 2>/dev/null | head -c 2000
echo
echo "===PROGRESS_BAR==="
gsd_run query progress.bar --raw 2>/dev/null
echo
echo "===RECENT_SUMMARIES==="
find .planning/phases -name "*-SUMMARY.md" 2>/dev/null | sort -r | head -5