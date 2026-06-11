# Claude Code Widget

A lightweight, always-on-top desktop widget that shows your Claude Code agent's live status: idle, thinking, waiting for input, or done — with a pixel-art critter and animated space background.

```
DRIFTING       TRAVELING      AWAITING YOU   ARRIVED
  idle           thinking        input          done
```

The widget listens for Claude Code lifecycle hooks and updates in real time. You can type replies directly into the widget and they are injected back into your terminal. It also displays session and weekly token-usage bars read from your Chrome cookies.

---

## Features

- **Live agent status** — reacts instantly to Claude Code's `PreToolUse`, `Stop`, and `Notification` hooks
- **Reply from the widget** — type an answer in the widget and it's keystroked into your terminal
- **Token usage bars** — session (`S`) and weekly (`W`) utilization pulled from claude.ai
- **Always on top** — floats above other windows (above full-screen apps on Windows and macOS)
- **System tray / menu bar** — animated critter icon with show/hide and quit
- **Frameless & transparent** — drag to reposition; quit / hide / peek-mode buttons
- **One-command install** — per-platform installer sets up everything, including Claude Code hooks

---

## Platform Versions

This repository contains three fully independent platform builds:

| Platform | Directory | Guide |
|----------|-----------|-------|
| Windows 10/11 | [`windows/`](./windows/) | [INSTALL.md](./windows/INSTALL.md) |
| Linux (X11) | [`linux/`](./linux/) | [INSTALL.md](./linux/INSTALL.md) |
| macOS | [`mac/`](./mac/) | [INSTALL.md](./mac/INSTALL.md) |

The React frontend (`app/`) is shared between all platforms. Each platform has its own:
- `electron/main.js` — window creation, always-on-top level, port-file path
- `electron/inject.js` — terminal key injection (PowerShell SendKeys vs xdotool/XTest vs osascript)
- `electron/get-auth.py` — Chrome cookie decryption (DPAPI+AES-GCM vs GNOME Keyring+AES-CBC vs macOS Keychain+AES-CBC)
- `electron/usage.js` — Python command resolution
- `hooks/` — Claude Code lifecycle hook scripts (PowerShell vs bash/Python)
- `install.*` — one-command installer

---

## Quick Start

### Windows

```powershell
git clone git@github.com:Rafa2025/ClaudeWidget.git
cd ClaudeWidget\windows
.\install.ps1
```

Full guide: [windows/INSTALL.md](./windows/INSTALL.md)

### Linux

```bash
git clone git@github.com:Rafa2025/ClaudeWidget.git
cd ClaudeWidget/linux
bash install.sh
```

Full guide: [linux/INSTALL.md](./linux/INSTALL.md)

### macOS

```bash
git clone git@github.com:Rafa2025/ClaudeWidget.git
cd ClaudeWidget/mac
bash install.sh
```

The macOS installer is fully hands-off: it auto-installs missing dependencies (via Homebrew), registers the hooks, sets up launch-at-login, and starts the widget. The only manual steps are approving two one-time permission dialogs (Accessibility + Keychain) that macOS requires a human to click.

Full guide: [mac/INSTALL.md](./mac/INSTALL.md)

---

## How It Works

```
Claude Code  ──hooks──▶  HTTP POST /api/state  ──▶  Electron  ──▶  Widget UI
(terminal)                 (localhost:random)       (main.js)      (React/Vite)
```

1. **Claude Code hooks** (`PreToolUse`, `Stop`, `Notification`) POST a JSON state change to the widget's local HTTP server. The server's random port is published in a well-known port file.
2. **Electron** (`main.js`) receives the request and calls `window.setStatus()` in the renderer via `executeJavaScript`.
3. **The React app** (`App.jsx`) updates the critter animation, status text, and optionally shows an input field or multiple-choice buttons.
4. **Text replies** typed in the widget are injected back to the terminal via platform-specific keystroke emulation.

### HTTP API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/state` | POST | Set widget state: `{"state": "idle\|thinking\|input\|done\|ask\|quit", "msg": "...", "options": [...]}` |
| `/api/input` | POST | Inject raw text into the terminal |
| `/api/usage` | GET | Read cached token-usage stats |
| `/api/usage/refresh` | GET | Force a usage refresh |

---

## Key Platform Differences

### Always-on-top

| Platform | Level |
|----------|-------|
| Windows | `screen-saver` (stays above all apps including full-screen) |
| Linux | Default (`alwaysOnTop: true` in BrowserWindow constructor) |
| macOS | `screen-saver` + visible on all Spaces and over full-screen apps |

### Port file location

| Platform | Path |
|----------|------|
| Windows | `%TEMP%\claude-widget-port.txt` |
| Linux | `/tmp/claude-widget-port.txt` |
| macOS | `/tmp/claude-widget-port.txt` |

### Terminal key injection

| Platform | Method |
|----------|--------|
| Windows | PowerShell `[System.Windows.Forms.SendKeys]::SendWait()` |
| Linux | `xdotool type` → Python XTest (fallback) |
| macOS | `osascript` System Events `keystroke` (needs Accessibility permission) |

### Terminal focus (before injection)

| Platform | Method |
|----------|--------|
| Windows | Win32 window activation by title |
| Linux | `wmctrl` by XID captured by `session-start.sh`, falling back to title match |
| macOS | Frontmost-app name captured by `session-start.sh`, falling back to a known-terminals list |

### Chrome cookie decryption (usage stats)

| Platform | Format | Key source |
|----------|--------|------------|
| Windows | AES-256-GCM (`v10` prefix) | DPAPI via `CryptUnprotectData` |
| Linux | AES-128-CBC (`v10`/`v11` prefix) | PBKDF2 from GNOME Keyring |
| macOS | AES-128-CBC (`v10` prefix, 1003 PBKDF2 iterations) | login Keychain (`Chrome Safe Storage`) |

> **Chrome 127+ warning (Windows only)**: Google introduced App-Bound Encryption (`v20` cookies) in Chrome 127.
> Usage stats will not load on Chrome 127+ until a compatible decryption method is added.
> Linux and macOS are unaffected.

### Transparency

Linux requires `app.commandLine.appendSwitch('enable-transparent-visuals')` and a compositing window manager. Windows and macOS support transparency natively.

### One-time permissions

| Platform | Required grants |
|----------|----------------|
| Windows | None |
| Linux | None (keyring unlocked with login) |
| macOS | Accessibility (key injection) + Keychain "Always Allow" (usage stats) — both prompted automatically |

---

## Usage

- The widget floats in the **bottom-right corner** and lives in the system tray / menu bar.
- **Click** the widget to open the text-input field; press Enter to send the reply to your terminal.
- **Drag** the title bar to reposition.
- **Red button**: quit. **Yellow**: hide. **Green**: peek mode (slim bar).
- Tray icon: left-click toggles show/hide (Windows/Linux); menu-bar menu → "Show / Hide" (macOS).

### Usage stats bar

The `S` (session) and `W` (weekly) bars show token usage from claude.ai. Requires Google Chrome signed in to claude.ai. Stats refresh every 90 seconds.

---

## Repository Structure

```
ClaudeWidget/
├── app/                        # Shared React frontend (Vite + React)
│   ├── src/
│   │   ├── App.jsx             # Main widget logic & state machine
│   │   ├── Critter.jsx         # Pixel-art character component
│   │   ├── Starfield.jsx       # Animated space background
│   │   ├── Planets.jsx         # Decorative planet elements
│   │   └── StatsBar.jsx        # Token usage bars
│   └── package.json
│
├── windows/                    # Windows-specific build
│   ├── electron/
│   │   ├── main.js             # Electron main (Windows)
│   │   ├── inject.js           # PowerShell SendKeys injection
│   │   ├── preload.js          # IPC bridge (shared)
│   │   ├── usage.js            # Usage stats (tries python then python3)
│   │   ├── get-auth.py         # DPAPI + AES-GCM cookie decryption
│   │   └── package.json
│   ├── hooks/
│   │   ├── widget-thinking.ps1 # PreToolUse hook
│   │   ├── widget-done.ps1     # Stop hook
│   │   └── widget-notify.ps1   # Notification hook
│   ├── install.ps1             # One-command Windows installer
│   └── INSTALL.md
│
├── linux/                      # Linux-specific build
│   ├── electron/
│   │   ├── main.js             # Electron main (Linux)
│   │   ├── inject.js           # xdotool / XTest injection
│   │   ├── preload.js          # IPC bridge (shared)
│   │   ├── usage.js            # Usage stats (python3)
│   │   ├── get-auth.py         # GNOME Keyring + AES-CBC cookie decryption
│   │   └── package.json
│   ├── hooks/
│   │   ├── PreToolUse          # Sets state → thinking (bash)
│   │   ├── Stop                # Sets state → done (bash)
│   │   └── Notification        # Sets state → input with message (Python)
│   ├── session-start.sh        # Captures terminal XID for precise focus
│   ├── install.sh              # One-command Linux installer
│   └── INSTALL.md
│
└── mac/                        # macOS-specific build
    ├── electron/
    │   ├── main.js             # Electron main (macOS)
    │   ├── inject.js           # osascript System Events keystroke injection
    │   ├── preload.js          # IPC bridge (shared)
    │   ├── usage.js            # Usage stats (python3)
    │   ├── get-auth.py         # macOS Keychain + AES-CBC cookie decryption
    │   └── package.json
    ├── hooks/
    │   ├── PreToolUse          # Sets state → thinking (bash, same as Linux)
    │   ├── Stop                # Sets state → done (bash, same as Linux)
    │   └── Notification        # Sets state → input with message (Python, same as Linux)
    ├── session-start.sh        # Captures frontmost terminal app for precise focus
    ├── install.sh              # One-command macOS installer (fully hands-off)
    └── INSTALL.md
```

---

## Updating

```bash
cd path/to/ClaudeWidget
git pull
# then re-run your platform's installer:
bash linux/install.sh      # Linux
bash mac/install.sh        # macOS
.\windows\install.ps1      # Windows (PowerShell)
```

---

## Troubleshooting

See the per-platform guides for full troubleshooting tables:
[windows/INSTALL.md](./windows/INSTALL.md) · [linux/INSTALL.md](./linux/INSTALL.md) · [mac/INSTALL.md](./mac/INSTALL.md)

Common quick checks:
- **Widget doesn't react to Claude Code** — verify hooks in `~/.claude/settings.json` and restart Claude Code; check the port file exists while the widget is running.
- **Widget doesn't appear** — make sure `app/dist/` exists (`npm run build` inside `app/`).
- **Usage bars stay at 0%** — Chrome must be installed and signed in to claude.ai (and on Windows, Chrome ≤126 due to App-Bound Encryption).
