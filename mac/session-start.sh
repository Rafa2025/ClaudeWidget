#!/usr/bin/env bash
# Run this script at the start of your Claude Code session.
# It captures the frontmost app's name (your terminal) so the widget can
# focus it precisely when injecting text responses.
#
# Usage: source session-start.sh   (or add to your shell rc)

APP=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)

if [ -n "$APP" ]; then
    echo "$APP" > /tmp/claude-terminal-app.txt
    echo "session-start.sh: captured terminal app \"$APP\""
else
    echo "session-start.sh: could not detect frontmost app — widget will use the fallback terminal list" >&2
fi
