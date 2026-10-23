#!/usr/bin/env bash
cd /d/myapps/newsportal
_GSD_SHIM_NAME="gsd-tools.cjs"
_GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
GSD_TOOLS="${_GSD_RUNTIME_ROOT}/gsd-core/bin/${_GSD_SHIM_NAME}"
gsd_run() { node "$GSD_TOOLS" "$@"; }
echo "===STATE SNAP (try state.json)==="
gsd_run query state.json 2>/dev/null | head -c 1500
echo
echo "===progress (try progress)==="
gsd_run query progress 2>/dev/null | head -c 1500
echo
echo "===decisions from STATE.md==="
grep -A2 -i "decision" .planning/STATE.md 2>/dev/null | head -30