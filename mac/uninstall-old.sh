#!/usr/bin/env bash
# Claude Code Widget — remove the OLD tkinter-based macOS widget
#
# Before the Electron rewrite, the macOS widget was a Python/tkinter tray
# daemon. On Apple Silicon + recent macOS it links against the deprecated
# system Tk 8.5.9 and crashes on launch (Tcl_Panic in TkpInit → abort).
#
# This script removes every trace of that old version so it can no longer be
# launched by Claude Code hooks or a stale LaunchAgent. It is idempotent and
# safe to run even if the old version was never installed — it only touches
# files and settings entries it recognises as the old widget's, and leaves the
# new `widget-*` hooks (and any unrelated hooks) untouched.
#
# Usage: bash uninstall-old.sh
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
HOOKS_DST="$CLAUDE_DIR/hooks"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
AGENTS_DIR="$HOME/Library/LaunchAgents"

step() { echo; echo ">> $1"; }
ok()   { echo "   OK  $1"; }
warn() { echo "   WARN $1"; }

# Basenames of every file that belonged to the old tkinter widget. Any hook in
# settings.json whose command references one of these is removed, and the files
# themselves are deleted.
OLD_SCRIPTS=(
    tray-daemon-mac.py
    claude-usage-mac.py
    ask-widget.sh
    session-start.sh
    stop-hook.sh
    prompt-hook.sh
    notify-hook.sh
)

echo
echo "===  Removing the old tkinter macOS widget  ==="

# ── 1. Stop any running old daemon ────────────────────────────────────────────
step "Stopping any running old daemon"
if pkill -f tray-daemon-mac.py 2>/dev/null; then
    ok "Killed running tray-daemon-mac.py"
else
    ok "No old daemon running"
fi

# ── 2. Remove any stale LaunchAgent that launches the old widget ──────────────
step "Removing stale LaunchAgents for the old widget"
removed_agent=0
if [ -d "$AGENTS_DIR" ]; then
    for plist in "$AGENTS_DIR"/*.plist; do
        [ -e "$plist" ] || continue
        if grep -qE 'tray-daemon-mac\.py|claude-usage-mac\.py' "$plist" 2>/dev/null; then
            launchctl unload "$plist" 2>/dev/null || true
            rm -f "$plist"
            ok "Removed LaunchAgent $(basename "$plist")"
            removed_agent=1
        fi
    done
fi
[ "$removed_agent" -eq 0 ] && ok "No old LaunchAgent found"

# ── 3. Strip old hook entries from settings.json ──────────────────────────────
step "Cleaning old hooks from settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    OLD_LIST="$(printf '%s ' "${OLD_SCRIPTS[@]}")" python3 - "$SETTINGS_FILE" <<'PYEOF'
import json, os, sys

settings_file = sys.argv[1]
old_scripts = os.environ.get("OLD_LIST", "").split()

try:
    with open(settings_file, encoding="utf-8") as f:
        settings = json.load(f)
except Exception:
    sys.exit(0)

hooks = settings.get("hooks")
if not isinstance(hooks, dict):
    sys.exit(0)

def is_old(entry):
    """True if this hook entry only runs old-widget commands."""
    cmds = [h.get("command", "") for h in entry.get("hooks", [])]
    if not cmds:
        return False
    # Keep the entry if any command is NOT one of the old scripts.
    return all(any(name in cmd for name in old_scripts) for cmd in cmds)

changed = False
for event in list(hooks.keys()):
    entries = hooks.get(event, [])
    if not isinstance(entries, list):
        continue
    kept = [e for e in entries if not is_old(e)]
    if len(kept) != len(entries):
        changed = True
    if kept:
        hooks[event] = kept
    else:
        del hooks[event]
        changed = True

if changed:
    with open(settings_file, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
    print("   OK  Removed old hook entries from settings.json")
else:
    print("   OK  No old hook entries in settings.json")
PYEOF
else
    ok "No settings.json found"
fi

# ── 4. Delete the old hook files ──────────────────────────────────────────────
step "Deleting old widget files"
removed_file=0
for name in "${OLD_SCRIPTS[@]}"; do
    f="$HOOKS_DST/$name"
    if [ -e "$f" ]; then
        rm -f "$f"
        ok "Removed $f"
        removed_file=1
    fi
done
[ "$removed_file" -eq 0 ] && ok "No old widget files found"

echo
echo "===  Old widget removed  ==="
