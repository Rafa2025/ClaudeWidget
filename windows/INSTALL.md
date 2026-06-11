# Claude Code Widget — Windows Installation Guide

A floating desktop widget that shows your Claude Code agent's status in real time.

## Requirements

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 18 LTS or later | https://nodejs.org |
| Python | 3.10 or later | https://www.python.org |
| Claude Code | any | `npm install -g @anthropic-ai/claude-code` |

> **Python PATH**: When installing Python, tick **"Add Python to PATH"** on the first installer screen.

---

## Automated Install (recommended)

Open PowerShell and run:

```powershell
cd path\to\ClaudeWidget\windows
.\install.ps1
```

If you see a script-execution error, first run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

The script will:
1. Verify Node.js and Python are available
2. Install the `cryptography` Python package (needed for usage stats)
3. Build the React frontend (`app/dist/`)
4. Install Electron npm packages
5. Copy hook scripts to `~\.claude\hooks\`
6. Register the hooks in `~\.claude\settings.json`
7. Optionally add the widget to Windows startup

---

## Manual Install (step by step)

### 1. Build the frontend

```powershell
cd path\to\ClaudeWidget\app
npm install
npm run build
```

### 2. Install Electron dependencies

```powershell
cd path\to\ClaudeWidget\windows\electron
npm install
```

### 3. Install Python dependency

```powershell
python -m pip install cryptography
```

### 4. Set up Claude Code hooks

Copy the three hook scripts to your Claude hooks directory:

```powershell
$dst = "$env:USERPROFILE\.claude\hooks"
New-Item -ItemType Directory -Force $dst
Copy-Item "path\to\ClaudeWidget\windows\hooks\*.ps1" $dst
```

Add the following to `~\.claude\settings.json` (create the file if it doesn't exist):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\widget-thinking.ps1\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\widget-done.ps1\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\widget-notify.ps1\""
          }
        ]
      }
    ]
  }
}
```

### 5. Start the widget

```powershell
cd path\to\ClaudeWidget\windows\electron
npm start
```

---

## Usage

- The widget appears in the **bottom-right corner** and in the **system tray**.
- **Click** the widget to open the text-input field (send a message to Claude).
- **Drag** the title bar to reposition.
- **Red button**: quit. **Yellow**: hide to tray. **Green**: peek mode (slim bar).
- Right-click the tray icon → **Show** to restore from tray.

---

## Usage Stats Bar

The small `S` and `W` bars show your session (5-hour) and weekly token usage.  
They are read from Chrome's `claude.ai` cookies automatically.

> **Chrome 127+ note**: Google introduced App-Bound Encryption in Chrome 127 (cookie prefix `v20`).  
> These cookies cannot be decrypted outside Chrome. Usage stats will show `0%` on Chrome 127+ until  
> a workaround is available. Use the claude.ai website to check your limits directly.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Widget doesn't appear | Check `npm start` output for errors; make sure `app/dist/` exists |
| Hook not triggering | Verify `~\.claude\settings.json` has the hooks section; restart Claude Code |
| Execution policy error | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `python` not found | Re-install Python and check "Add to PATH"; or use `python3` |
| Usage stats always 0% | Chrome 127+ limitation (see above); or Chrome isn't logged in to claude.ai |
| Widget stays behind windows | Expected on some desktop configs; the `screen-saver` level should keep it on top |

---

## Updating

```powershell
cd path\to\ClaudeWidget
git pull
cd windows
.\install.ps1
```
