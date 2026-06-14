# Claude Code Widget — macOS Installation Guide

A floating desktop widget that shows your Claude Code agent's status in real time.

## Requirements

None to install manually — the installer takes care of everything. For reference:

| Tool | Purpose | If missing |
|------|---------|------------|
| Node.js 18+ | Run Electron | Auto-installed via Homebrew |
| Python 3.10+ | Cookie auth & hooks | Auto-installed via Homebrew |
| Homebrew | Package manager | Auto-installed (asks for your password) |
| osascript, curl | Key injection, hooks | Built into macOS |

> Unlike Linux, macOS needs no compositor setup, no `wmctrl`, and no `xdotool` —
> transparency and key injection are handled natively.

---

## Automated Install (recommended)

```bash
cd path/to/ClaudeWidget/mac
bash install.sh
```

The script is fully hands-off. It will:
1. Install Node.js / Python via Homebrew if missing (installing Homebrew itself if needed)
2. **Remove the old tkinter widget** if present (see note below)
3. Install the `cryptography` Python package
4. Build the React frontend (`app/dist/`)
5. Install Electron npm packages
6. Copy hook scripts to `~/.claude/hooks/` and register them in `~/.claude/settings.json`
7. Add terminal-focus capture to your shell RC (`~/.zshrc` / `~/.bashrc`)
8. Trigger the Keychain dialog for usage stats (click **Always Allow**)
9. Install a LaunchAgent and **start the widget immediately** (also starts at every login)

> **Upgrading from the old version?** Earlier macOS builds were a Python/tkinter
> tray daemon that crashes on Apple Silicon + recent macOS (`Tcl_Panic` in
> `TkpInit` → abort, the moment a Claude session starts). The installer now runs
> `uninstall-old.sh` automatically to delete those leftover hooks before setting
> up the new Electron widget, so the upgrade is hands-off. You can also run it on
> its own at any time: `bash mac/uninstall-old.sh`.

When the widget first starts it asks for **Accessibility** permission — click
"Open System Settings" and enable the toggle. That's the only manual step.

Don't want launch-at-login? Use:

```bash
bash install.sh --no-autostart
```

This starts the widget once in the background instead of installing the LaunchAgent.

---

## Manual Install (step by step)

### 1. Install prerequisites

```bash
brew install node python
```

### 2. Install Python dependency

```bash
python3 -m pip install cryptography
# or, with Homebrew Python (PEP 668):
python3 -m pip install cryptography --break-system-packages
```

### 3. Build the frontend

```bash
cd path/to/ClaudeWidget/app
npm install
npm run build
```

### 4. Install Electron dependencies

```bash
cd path/to/ClaudeWidget/mac/electron
npm install
```

### 5. Set up Claude Code hooks

```bash
HOOKS_DST="$HOME/.claude/hooks"
mkdir -p "$HOOKS_DST"
cp path/to/ClaudeWidget/mac/hooks/PreToolUse   "$HOOKS_DST/widget-thinking"
cp path/to/ClaudeWidget/mac/hooks/Stop         "$HOOKS_DST/widget-done"
cp path/to/ClaudeWidget/mac/hooks/Notification "$HOOKS_DST/widget-notify"
chmod +x "$HOOKS_DST/widget-thinking" "$HOOKS_DST/widget-done" "$HOOKS_DST/widget-notify"
```

Add the following to `~/.claude/settings.json` (create if it doesn't exist):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "$HOME/.claude/hooks/widget-thinking"}]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "$HOME/.claude/hooks/widget-done"}]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [{"type": "command", "command": "$HOME/.claude/hooks/widget-notify"}]
      }
    ]
  }
}
```

Replace `$HOME` with your actual home directory path (e.g. `/Users/yourname`).

### 6. Start the widget

```bash
cd path/to/ClaudeWidget/mac/electron
npm start
```

---

## macOS Permissions (one-time)

Both prompts are triggered automatically — you only have to click through them.

### Accessibility — required for typing replies into your terminal

The widget calls `systemPreferences.isTrustedAccessibilityClient(true)` on
startup, so macOS shows the grant dialog as soon as it launches, with the app
already listed. Click "Open System Settings" and enable the toggle under
**Privacy & Security → Accessibility**. Until granted, replies typed in the
widget won't reach the terminal.

### Keychain — required for the usage bars

The installer reads the Chrome cookies once, which shows a dialog asking for
access to **"Chrome Safe Storage"**. Click **Always Allow** and it never asks
again.

---

## Terminal app capture (for precise focus)

The installer adds this to your shell RC automatically. Each new terminal
session records its app name so the widget focuses the right window when
injecting text:

```bash
# Added to ~/.zshrc (or ~/.bashrc) by install.sh
source /path/to/ClaudeWidget/mac/session-start.sh >/dev/null 2>&1
```

Without this the widget falls back to a list of known terminals
(iTerm2, Terminal, Warp, WezTerm, Alacritty, kitty, Ghostty), which usually
works but picks the first one running rather than the one with your session.

---

## Launch at login

Installed automatically (skip with `--no-autostart`). To remove it:

```bash
launchctl unload ~/Library/LaunchAgents/ai.anthropic.claude-code-widget.plist
rm ~/Library/LaunchAgents/ai.anthropic.claude-code-widget.plist
```

To set it up manually:

```bash
ELECTRON_DIR=/path/to/ClaudeWidget/mac/electron
cat > ~/Library/LaunchAgents/ai.anthropic.claude-code-widget.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.anthropic.claude-code-widget</string>
    <key>ProgramArguments</key>
    <array>
        <string>$ELECTRON_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron</string>
        <string>$ELECTRON_DIR</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$ELECTRON_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/claude-widget.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-widget.err.log</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/ai.anthropic.claude-code-widget.plist
```

> **Important:** launch the Electron binary directly (as above), **not**
> `npm start`. Under `launchd` the `npm` wrapper exits immediately without
> holding the Electron process, so the widget never stays open. `KeepAlive`
> relaunches it if it ever exits.

---

## Usage

- The widget floats in the **bottom-right corner** and lives in the menu bar.
- It stays visible above full-screen apps and follows you across Spaces.
- **Click** the widget to open the text-input field.
- **Drag** the title bar to reposition.
- **Red button**: quit. **Yellow**: hide. **Green**: peek mode (slim bar).
- **Menu bar icon → Show / Hide** toggles visibility.

---

## Usage Stats Bar

The `S` (session) and `W` (weekly) bars show your token usage from `claude.ai`.

Requires:
- Google Chrome installed and logged in to `claude.ai`
- One-time Keychain "Always Allow" for Chrome Safe Storage (see above)

Unlike Windows, Chrome's app-bound cookie encryption does not affect macOS —
usage stats work on current Chrome versions.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Widget doesn't appear | Check `/tmp/claude-widget.err.log`. Confirm it's running: `launchctl list \| grep claude` (a `-` in the first column means it exited). Test in the foreground: `cd mac/electron && npm start`. Ensure `app/dist/index.html` exists (`npm run build` in `app/`). |
| Widget runs with `npm start` but not at login | The LaunchAgent must launch the Electron binary directly, not `npm start`. Re-run `bash mac/install.sh` (the installer now generates the correct plist with `KeepAlive`). |
| Hook not triggering | Check `~/.claude/settings.json`; restart Claude Code; run `chmod +x ~/.claude/hooks/widget-*` |
| Typed replies never reach the terminal | Grant Accessibility permission (System Settings → Privacy & Security → Accessibility) to Electron / your terminal |
| Wrong terminal focused | Run `session-start.sh` in your Claude Code terminal before starting a session |
| Usage stats always 0% | Ensure Chrome is signed in to claude.ai; re-check the Keychain prompt (run `python3 mac/electron/get-auth.py` to test) |
| Widget hidden behind full-screen apps | Should not happen (`screen-saver` level is set); report your macOS version if it does |
| Python crash (`Tcl_Panic` / `TkpInit` / `abort`) when a session starts | Leftover **old tkinter widget**. Run `bash mac/uninstall-old.sh`, then restart Claude Code. (The installer now does this automatically.) |

---

## Updating

```bash
cd path/to/ClaudeWidget
git pull
bash mac/install.sh
```

The installer automatically removes any old tkinter-based widget as part of the
upgrade, so there's nothing extra to do.
