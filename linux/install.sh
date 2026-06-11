#!/usr/bin/env bash
# Claude Code Widget — Linux Installer
# Usage: bash install.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINUX_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$LINUX_DIR/electron"
APP_DIR="$REPO_ROOT/app"
HOOKS_SRC="$LINUX_DIR/hooks"
CLAUDE_DIR="$HOME/.claude"
HOOKS_DST="$CLAUDE_DIR/hooks"

step() { echo; echo ">> $1"; }
ok()   { echo "   OK  $1"; }
warn() { echo "   WARN $1"; }
err()  { echo "   ERR $1"; exit 1; }

echo
echo "===  Claude Code Widget — Linux Installer  ==="

# ── 1. Check / install system dependencies ────────────────────────────────────
step "Checking system dependencies"

install_pkg() {
    local pkg="$1"
    if command -v apt-get &>/dev/null; then
        sudo apt-get install -y "$pkg"
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y "$pkg"
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm "$pkg"
    else
        warn "Cannot auto-install $pkg — please install it manually."
    fi
}

command -v node  &>/dev/null || err "Node.js not found. Install from https://nodejs.org"
ok "Node.js $(node --version)"

command -v npm   &>/dev/null || err "npm not found. Install with: apt install npm"
ok "npm $(npm --version)"

command -v python3 &>/dev/null || err "python3 not found. Install with: apt install python3"
ok "python3 $(python3 --version)"

if ! command -v wmctrl &>/dev/null; then
    warn "wmctrl not found — installing..."
    install_pkg wmctrl
fi
ok "wmctrl found"

if ! command -v xdotool &>/dev/null; then
    warn "xdotool not found — installing (used for terminal key injection)..."
    install_pkg xdotool
fi
ok "xdotool found"

if ! command -v curl &>/dev/null; then
    warn "curl not found — installing..."
    install_pkg curl
fi
ok "curl found"

# ── 2. Python dependencies ─────────────────────────────────────────────────────
step "Installing Python dependencies (cryptography)"
python3 -m pip install cryptography --quiet --break-system-packages 2>/dev/null \
    || python3 -m pip install cryptography --quiet \
    || warn "pip install failed — usage stats may not work"
ok "cryptography installed"

# ── 3. Build React frontend ────────────────────────────────────────────────────
step "Building React frontend (app/)"
cd "$APP_DIR"
npm install --loglevel error
npm run build --loglevel error
ok "Frontend built → app/dist/"

# ── 4. Install Electron dependencies ──────────────────────────────────────────
step "Installing Electron dependencies"
cd "$ELECTRON_DIR"
npm install --loglevel error
ok "Electron dependencies installed"

# ── 5. Set up Claude Code hooks ────────────────────────────────────────────────
step "Configuring Claude Code hooks"
mkdir -p "$HOOKS_DST"

cp "$HOOKS_SRC/PreToolUse"  "$HOOKS_DST/widget-thinking"
cp "$HOOKS_SRC/Stop"        "$HOOKS_DST/widget-done"
cp "$HOOKS_SRC/Notification" "$HOOKS_DST/widget-notify"
chmod +x "$HOOKS_DST/widget-thinking" "$HOOKS_DST/widget-done" "$HOOKS_DST/widget-notify"
ok "Hook scripts copied to $HOOKS_DST"

# Update ~/.claude/settings.json
python3 - "$HOOKS_DST" <<'PYEOF'
import json, os, sys

settings_file = os.path.join(os.path.expanduser('~'), '.claude', 'settings.json')
hooks_dir     = sys.argv[1]

try:
    with open(settings_file, encoding='utf-8') as f:
        settings = json.load(f)
except Exception:
    settings = {}

if 'hooks' not in settings:
    settings['hooks'] = {}

def cmd(script):
    return f'{hooks_dir}/{script}'

settings['hooks']['PreToolUse']   = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-thinking')}]}]
settings['hooks']['Stop']         = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-done')}]}]
settings['hooks']['Notification'] = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-notify')}]}]

os.makedirs(os.path.dirname(settings_file), exist_ok=True)
with open(settings_file, 'w', encoding='utf-8') as f:
    json.dump(settings, f, indent=2)
print(settings_file)
PYEOF

ok "Hooks registered in ~/.claude/settings.json"

# ── 6. Optional: autostart desktop entry ──────────────────────────────────────
step "Autostart (optional)"
read -rp "   Add widget to XDG autostart? [y/N] " ans
if [[ "$ans" =~ ^[Yy] ]]; then
    AUTOSTART_DIR="$HOME/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    cat > "$AUTOSTART_DIR/claude-code-widget.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Claude Code Widget
Exec=npm start --prefix "$ELECTRON_DIR"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
DESKTOP
    ok "Autostart entry created: $AUTOSTART_DIR/claude-code-widget.desktop"
else
    echo "   Skipped. Start manually: npm start  (from linux/electron/)"
fi

# ── 7. session-start.sh reminder ──────────────────────────────────────────────
step "Terminal XID capture"
echo "   For precise terminal focus when the widget injects text, run:"
echo "   source \"$LINUX_DIR/session-start.sh\""
echo "   at the start of each Claude Code session, or add it to your shell RC."

# ── Done ───────────────────────────────────────────────────────────────────────
echo
echo "===  Installation complete!  ==="
echo
echo "  Start the widget:"
echo "    cd \"$ELECTRON_DIR\""
echo "    npm start"
echo
echo "  Then open Claude Code — the widget updates automatically."
echo
