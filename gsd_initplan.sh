#!/usr/bin/env bash
cd /d/myapps/newsportal
GSD_TOOLS="/c/Users/Nafis/.codex/gsd-core/bin/gsd-tools.cjs"
gsd_run() { node "$GSD_TOOLS" "$@"; }
INIT=$(gsd_run query init.plan-phase 01)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
echo "$INIT" > /d/myapps/newsportal/init_plan.json
echo "DONE"