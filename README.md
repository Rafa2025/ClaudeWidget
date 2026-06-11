# Claude Code Widget

A lightweight, always-on-top desktop widget that shows your Claude Code agent's live status: idle, thinking, waiting for input, or done — with a pixel-art critter and animated space background.

```
DRIFTING       TRAVELING      AWAITING YOU   ARRIVED
  idle           thinking        input          done
```

The widget listens for Claude Code lifecycle hooks and updates in real time. It also displays session and weekly token-usage bars read from your Chrome cookies.

---

## Platform Versions

This repository contains two fully independent platform builds:

| Platform | Directory | Guide |
|----------|-----------|-------|
| Windows 10/11 | [`windows/`](./windows/) | [INSTALL.md](./windows/INSTALL.md) |
| Linux (X11) | [`linux/`](./linux/) | [INSTALL.md](./linux/INSTALL.md) |

The React frontend (`app/`) is shared between both. Each platform has its own:
- `electron/main.js` — window creation, always-on-top level, port-file path
- `electron/inject.js` — terminal key injection (PowerShell SendKeys vs xdotool/XTest)
- `electron/get-auth.py` — Chrome cookie decryption (DPAPI+AES-GCM vs GNOME Keyring+AES-CBC)
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

---

## How It Works

```
Claude Code  ──hooks──▶  HTTP POST /api/state  ──▶  Electron  ──▶  Widget UI
(terminal)                 (localhost:random)       (main.js)      (React/Vite)
```

1. **Claude Code hooks** (`PreToolUse`, `Stop`, `Notification`) POST a JSON state change to the widget's local HTTP server.
2. **Electron** (`main.js`) receives the request and calls `window.setStatus()` in the renderer via `executeJavaScript`.
3. **The React app** (`App.jsx`) updates the critter animation, status text, and optionally shows an input field or multiple-choice buttons.
4. **Text replies** typed in the widget are injected back to the terminal via platform-specific keystroke emulation.

---

## Key Platform Differences

### Always-on-top

| Platform | Level |
|----------|-------|
| Windows | `screen-saver` (stays above all apps including full-screen) |
| Linux | Default (`alwaysOnTop: true` in BrowserWindow constructor) |

### Port file location

| Platform | Path |
|----------|------|
| Windows | `%TEMP%\claude-widget-port.txt` |
| Linux | `/tmp/claude-widget-port.txt` |

### Terminal key injection

| Platform | Method |
|----------|--------|
| Windows | PowerShell `[System.Windows.Forms.SendKeys]::SendWait()` |
| Linux | `xdotool type` → Python XTest (fallback) |

### Chrome cookie decryption

| Platform | Format | Key source |
|----------|--------|------------|
| Windows | AES-256-GCM (`v10` prefix) | DPAPI via `CryptUnprotectData` |
| Linux | AES-128-CBC (`v10`/`v11` prefix) | PBKDF2 from GNOME Keyring |

> **Chrome 127+ warning**: Google introduced App-Bound Encryption (`v20` cookies) in Chrome 127.
> Usage stats will not load on Chrome 127+ until a compatible decryption method is added.

### Transparency

Linux requires `app.commandLine.appendSwitch('enable-transparent-visuals')` and a compositing window manager. Windows supports transparency natively.

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
└── linux/                      # Linux-specific build
    ├── electron/
    │   ├── main.js             # Electron main (Linux)
    │   ├── inject.js           # xdotool / XTest injection
    │   ├── preload.js          # IPC bridge (shared)
    │   ├── usage.js            # Usage stats (python3)
    │   ├── get-auth.py         # GNOME Keyring + AES-CBC cookie decryption
    │   └── package.json
    ├── hooks/
    │   ├── PreToolUse          # Sets state → thinking (bash)
    │   ├── Stop                # Sets state → done (bash)
    │   └── Notification        # Sets state → input with message (Python)
    ├── session-start.sh        # Captures terminal XID for precise focus
    ├── install.sh              # One-command Linux installer
    └── INSTALL.md
```
