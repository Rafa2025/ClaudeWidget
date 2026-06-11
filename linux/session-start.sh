#!/usr/bin/env bash
# Run this script at the start of your Claude Code session.
# It captures the current terminal window's X11 ID so the widget can focus
# it precisely when injecting text responses.
#
# Usage: source session-start.sh   (or add to your shell rc / tmux config)

if [ -z "$DISPLAY" ]; then
    echo "session-start.sh: no DISPLAY set, skipping XID capture" >&2
    exit 0
fi

if ! command -v xdotool &>/dev/null; then
    echo "session-start.sh: xdotool not found — window focus will use title matching" >&2
    exit 0
fi

XID=$(xdotool getactivewindow 2>/dev/null)
if [ -n "$XID" ]; then
    echo "$XID" > /tmp/claude-terminal-win.txt
    echo "session-start.sh: captured terminal XID $XID"
fi
