#!/usr/bin/env bash
# Claude Code Widget — macOS Installer
# Installs all dependencies, configures hooks, and starts the widget.
#
# Usage: bash install.sh [--no-autostart]
#   --no-autostart   don't install the launch-at-login LaunchAgent;
#                    the widget is started once in the background instead
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAC_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$MAC_DIR/electron"
APP_DIR="$REPO_ROOT/app"
HOOKS_SRC="$MAC_DIR/hooks"
CLAUDE_DIR="$HOME/.claude"
HOOKS_DST="$CLAUDE_DIR/hooks"

AUTOSTART=1
[[ "${1:-}" == "--no-autostart" ]] && AUTOSTART=0

step() { echo; echo ">> $1"; }
ok()   { echo "   OK  $1"; }
warn() { echo "   WARN $1"; }
err()  { echo "   ERR $1"; exit 1; }

echo
echo "===  Claude Code Widget — macOS Installer  ==="

# ── 1. System dependencies (auto-installed via Homebrew if missing) ───────────
step "Checking system dependencies"

ensure_brew() {
    if command -v brew &>/dev/null; then return 0; fi
    warn "Homebrew not found — installing it (you may be asked for your password)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
        || err "Homebrew install failed. Install it manually from https://brew.sh and re-run."
    # Make brew available in this shell (Apple Silicon vs Intel path)
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
    ok "Homebrew installed"
}

if ! command -v node &>/dev/null; then
    warn "Node.js not found — installing via Homebrew..."
    ensure_brew
    brew install node || err "Failed to install Node.js"
fi
ok "Node.js $(node --version)"
ok "npm $(npm --version)"

if ! python3 -c 'import ssl' &>/dev/null; then
    warn "python3 not functional — installing via Homebrew..."
    ensure_brew
    brew install python || err "Failed to install Python"
fi
ok "python3 $(python3 --version)"

command -v osascript &>/dev/null || err "osascript not found — this doesn't look like macOS."
ok "osascript found"

# ── 2. Python dependencies ─────────────────────────────────────────────────────
step "Installing Python dependencies (cryptography)"
python3 -m pip install cryptography --quiet --break-system-packages 2>/dev/null \
    || python3 -m pip install cryptography --quiet --user 2>/dev/null \
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

cp "$HOOKS_SRC/PreToolUse"   "$HOOKS_DST/widget-thinking"
cp "$HOOKS_SRC/Stop"         "$HOOKS_DST/widget-done"
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

def ensure(event, script):
    """Append our hook to the event's list unless it's already registered.
    Never replaces the list — the user's existing hooks must survive."""
    command = f'{hooks_dir}/{script}'
    entries = settings['hooks'].setdefault(event, [])
    for entry in entries:
        for h in entry.get('hooks', []):
            if h.get('command') == command:
                return
    entries.append({'matcher': '', 'hooks': [{'type': 'command', 'command': command}]})

ensure('PreToolUse',   'widget-thinking')
ensure('Stop',         'widget-done')
ensure('Notification', 'widget-notify')

os.makedirs(os.path.dirname(settings_file), exist_ok=True)
with open(settings_file, 'w', encoding='utf-8') as f:
    json.dump(settings, f, indent=2)
print(settings_file)
PYEOF

ok "Hooks registered in ~/.claude/settings.json"

# ── 6. Terminal focus capture in shell RC (idempotent) ────────────────────────
step "Configuring terminal focus capture"
case "$(basename "${SHELL:-/bin/zsh}")" in
    bash) RC_FILE="$HOME/.bashrc" ;;
    *)    RC_FILE="$HOME/.zshrc"  ;;
esac
RC_LINE="source \"$MAC_DIR/session-start.sh\" >/dev/null 2>&1"
if ! grep -qF "$RC_LINE" "$RC_FILE" 2>/dev/null; then
    {
        echo ''
        echo '# Claude Code Widget — capture terminal app for precise focus'
        echo "$RC_LINE"
    } >> "$RC_FILE"
    ok "Added session-start.sh to $RC_FILE"
else
    ok "session-start.sh already in $RC_FILE"
fi
# Capture the current terminal right away
bash "$MAC_DIR/session-start.sh" >/dev/null 2>&1 || true

# ── 7. Keychain permission (usage stats) ──────────────────────────────────────
step "Usage stats — Keychain access"
CHROME_COOKIES="$HOME/Library/Application Support/Google/Chrome/Default/Cookies"
if [ -f "$CHROME_COOKIES" ]; then
    echo "   Reading Chrome cookies once to trigger the Keychain dialog."
    echo "   If a dialog appears asking for 'Chrome Safe Storage', click \"Always Allow\"."
    python3 "$ELECTRON_DIR/get-auth.py" >/dev/null 2>&1 || true
    ok "Keychain access initialized"
else
    warn "Chrome profile not found — usage bars will stay at 0% (sign in to claude.ai in Chrome to enable them)"
fi

# ── 8. Start the widget ────────────────────────────────────────────────────────
NPM_BIN="$(command -v npm)"
if [ "$AUTOSTART" -eq 1 ]; then
    step "Installing LaunchAgent (starts now and at every login)"
    AGENTS_DIR="$HOME/Library/LaunchAgents"
    PLIST="$AGENTS_DIR/ai.anthropic.claude-code-widget.plist"
    mkdir -p "$AGENTS_DIR"
    cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.anthropic.claude-code-widget</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NPM_BIN</string>
        <string>start</string>
        <string>--prefix</string>
        <string>$ELECTRON_DIR</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "$NPM_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
PLISTEOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    ok "Widget started (LaunchAgent: $PLIST)"
    echo "   To remove autostart later: launchctl unload \"$PLIST\" && rm \"$PLIST\""
else
    step "Starting the widget (autostart skipped)"
    nohup "$NPM_BIN" start --prefix "$ELECTRON_DIR" >/dev/null 2>&1 &
    disown
    ok "Widget started in the background"
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo
echo "===  Installation complete — the widget is running!  ==="
echo
echo "  One last thing: macOS will now show an Accessibility prompt"
echo "  (needed so the widget can type replies into your terminal)."
echo "  Click \"Open System Settings\" and enable the toggle for the widget."
echo
echo "  Then open Claude Code — the widget updates automatically."
echo
