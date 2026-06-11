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

The script is fully automated — you do not need to touch anything. It will:
1. Auto-install Node.js and Python via `winget` if they are missing
2. Install the `cryptography` Python package (needed for usage stats)
3. Build the React frontend (`app/dist/`)
4. Install Electron and repair the Electron binary if npm skipped it
5. Copy hook scripts to `~\.claude\hooks\` and register them in `~\.claude\settings.json`
   (SessionStart, PreToolUse, Stop, Notification)
6. Add the widget to Windows startup (launches `electron.exe` directly — no console window)
7. Launch the widget immediately (skips re-launch if one is already running)

After install the widget also **auto-starts whenever you open a Claude Code session**
(via the SessionStart hook), so it is always running when you need it.

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

Add the following to `~\.claude\settings.json` (create the file if it doesn't exist).
Use **forward slashes** in the paths — Claude Code strips backslashes from hook commands:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File C:/Users/YOU/.claude/hooks/widget-start.ps1"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -NonInteractive -File C:/Users/YOU/.claude/hooks/widget-thinking.ps1"
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
            "command": "powershell -NoProfile -NonInteractive -File C:/Users/YOU/.claude/hooks/widget-done.ps1"
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
            "command": "powershell -NoProfile -NonInteractive -File C:/Users/YOU/.claude/hooks/widget-notify.ps1"
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
- **Click** the widget to open the text-input field, then type and press Enter to
  **send text straight into your active Claude Code session** (it is typed into the
  terminal via `WriteConsoleInput`, so no window focus is stolen).
- **Drag** the title bar to reposition.
- **Red button**: quit. **Yellow**: hide to tray. **Green**: peek mode (slim bar).
- **Tray icon**: left-click to toggle show/hide, right-click → **Show** / **Quit**.

---

## Usage Stats Bar

The small `S` and `W` bars show your session (5-hour) and weekly token usage.
They are read automatically from your browser's `claude.ai` cookies. The widget
tries **Chrome → Edge → Brave** in order, and caches the last working credentials
to `%TEMP%\claude-auth-cache.json` so stats survive even when the cookie file is
later locked.

> **App-Bound Encryption (important)**
> Chrome **and** Edge 127+ encrypt cookies with App-Bound Encryption (cookie prefix
> `v20`). The decryption key is tied to the browser binary through a Windows COM
> service, so **no outside program can decrypt these cookies** — this is Google's
> anti-cookie-theft design, and it is why the stats may show `0%` on an up-to-date
> Chrome or Edge. (Linux is unaffected because it uses keyring-based AES-CBC.)
>
> **To get usage stats working on Windows, use one of:**
> - **Brave** — App-Bound Encryption is disabled by default; log into claude.ai in Brave.
> - **A browser session read while it is closed** — the widget auto-reads cookies at
>   Windows login (before you open the browser) and caches them. So if you let the
>   widget start at login and only open Chrome/Edge afterward, the cached `sessionKey`
>   keeps stats working.
>
> Either way, the widget never shows wrong data — it shows `0%` when it cannot read,
> and the website (claude.ai/settings/limits) always has your exact limits.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Widget doesn't appear | Check `npm start` output for errors; make sure `app/dist/` exists |
| Hook not triggering | Verify `~\.claude\settings.json` has the hooks section; restart Claude Code |
| Execution policy error | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `python` not found | Re-install Python and check "Add to PATH"; or use `python3` |
| Usage stats always 0% | App-Bound Encryption on Chrome/Edge (see above) — use Brave, or let the widget read cookies at login before opening the browser |
| Text from widget doesn't reach terminal | Make sure the SessionStart hook ran (it saves Claude Code's PID to `%TEMP%\claude-console-pid.txt`); start a fresh Claude Code session |
| Widget stays behind windows | Expected on some desktop configs; the `screen-saver` level should keep it on top |

---

## Updating

```powershell
cd path\to\ClaudeWidget
git pull
cd windows
.\install.ps1
```
