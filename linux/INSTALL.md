# Claude Code Widget — Linux Installation Guide

A floating desktop widget that shows your Claude Code agent's status in real time.

## Requirements

| Tool | Purpose | Install |
|------|---------|---------|
| Node.js 18+ | Run Electron | `nvm install 18` or distro package |
| npm | Package manager | Comes with Node.js |
| Python 3.10+ | Cookie auth & hooks | `apt install python3 python3-pip` |
| wmctrl | Window focus (for text injection) | `apt install wmctrl` |
| xdotool | Key injection (primary method) | `apt install xdotool` |
| curl | Hooks → widget HTTP API | Usually pre-installed |

> The widget requires a **compositing window manager** for the transparent background  
> (GNOME, KDE Plasma, XFCE with compositor, etc.). Pure X11 without compositing shows a solid background.

---

## Automated Install (recommended)

```bash
cd path/to/ClaudeWidget/linux
bash install.sh
```

The script will:
1. Check for and (on Debian/Fedora/Arch) install missing system packages
2. Install the `cryptography` Python package
3. Build the React frontend (`app/dist/`)
4. Install Electron npm packages
5. Copy hook scripts to `~/.claude/hooks/`
6. Register the hooks in `~/.claude/settings.json`
7. Optionally create an XDG autostart desktop entry

---

## Manual Install (step by step)

### 1. Install system packages

```bash
# Debian / Ubuntu
sudo apt install wmctrl xdotool python3-pip

# Fedora
sudo dnf install wmctrl xdotool python3-pip

# Arch
sudo pacman -S wmctrl xdotool python-pip
```

### 2. Install Python dependency

```bash
pip3 install cryptography
# or, on newer systems with PEP 668:
pip3 install cryptography --break-system-packages
```

### 3. Build the frontend

```bash
cd path/to/ClaudeWidget/app
npm install
npm run build
```

### 4. Install Electron dependencies

```bash
cd path/to/ClaudeWidget/linux/electron
npm install
```

### 5. Set up Claude Code hooks

```bash
HOOKS_DST="$HOME/.claude/hooks"
mkdir -p "$HOOKS_DST"
cp path/to/ClaudeWidget/linux/hooks/PreToolUse   "$HOOKS_DST/widget-thinking"
cp path/to/ClaudeWidget/linux/hooks/Stop         "$HOOKS_DST/widget-done"
cp path/to/ClaudeWidget/linux/hooks/Notification "$HOOKS_DST/widget-notify"
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

Replace `$HOME` with your actual home directory path (e.g. `/home/yourname`).

### 6. Start the widget

```bash
cd path/to/ClaudeWidget/linux/electron
npm start
```

---

## Terminal XID capture (for precise focus)

When the widget injects text back to your terminal (after you type a reply), it needs to focus the right window. Run this at the start of each Claude Code session:

```bash
source path/to/ClaudeWidget/linux/session-start.sh
```

Or add it to your shell RC file so it runs automatically in every terminal:

```bash
# Add to ~/.bashrc or ~/.zshrc
[ -n "$DISPLAY" ] && source /path/to/ClaudeWidget/linux/session-start.sh
```

Without this step the widget falls back to focusing by window title, which usually works but is less precise.

---

## Autostart

To launch the widget automatically when you log in, create a desktop entry:

```bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/claude-code-widget.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Claude Code Widget
Exec=npm start --prefix /path/to/ClaudeWidget/linux/electron
Hidden=false
X-GNOME-Autostart-enabled=true
EOF
```

---

## Usage

- The widget floats in the **bottom-right corner** and in the system tray.
- **Click** the widget to open the text-input field.
- **Drag** the title bar to reposition.
- **Red button**: quit. **Yellow**: hide. **Green**: peek mode (slim bar).
- **Left-click** tray icon to toggle show/hide.

---

## Usage Stats Bar

The `S` (session) and `W` (weekly) bars show your token usage from `claude.ai`.

Requires:
- Google Chrome installed and logged in to `claude.ai`
- Either `secret-tool` (`libsecret-tools` package) or `python3-gi` for keyring access

```bash
# Debian/Ubuntu
sudo apt install libsecret-tools python3-gi
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Transparent background doesn't work | Enable compositor: GNOME works out of the box; XFCE needs `xfwm4 --compositor=on` |
| Widget doesn't appear | Check `npm start` output; ensure `app/dist/` exists (`npm run build` in `app/`) |
| Hook not triggering | Check `~/.claude/settings.json`; restart Claude Code; run `chmod +x ~/.claude/hooks/widget-*` |
| xdotool type fails | The Python XTest fallback activates automatically; if both fail, check `$DISPLAY` |
| Wrong terminal focused | Run `session-start.sh` in your Claude Code terminal before starting a session |
| Usage stats always 0% | Install `libsecret-tools` and ensure Chrome is signed in to claude.ai |

---

## Updating

```bash
cd path/to/ClaudeWidget
git pull
bash linux/install.sh
```
