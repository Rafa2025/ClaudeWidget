# Claude Code Widget — Windows Installer
# Run from an Administrator PowerShell or a regular PowerShell (no admin needed for user-local install).
# Usage: .\install.ps1

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REPO_ROOT    = Split-Path -Parent $PSScriptRoot
$ELECTRON_DIR = Join-Path $PSScriptRoot "electron"
$APP_DIR      = Join-Path $REPO_ROOT    "app"
$HOOKS_SRC    = Join-Path $PSScriptRoot "hooks"
$CLAUDE_DIR   = Join-Path $env:USERPROFILE ".claude"
$HOOKS_DST    = Join-Path $CLAUDE_DIR   "hooks"

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "   ERR $msg" -ForegroundColor Red; exit 1 }

Write-Host "`n===  Claude Code Widget — Windows Installer  ===" -ForegroundColor Magenta

# ── 1. Check dependencies ──────────────────────────────────────────────────────
Write-Step "Checking dependencies"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js not found. Install from https://nodejs.org and re-run."
}
Write-Ok "Node.js $(node --version)"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm not found. It should come with Node.js."
}
Write-Ok "npm $(npm --version)"

$PY = $null
foreach ($cmd in @('python', 'python3')) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) { $PY = $cmd; break }
}
if (-not $PY) {
    Write-Err "Python not found. Install from https://www.python.org (check 'Add to PATH')."
}
Write-Ok "Python found as '$PY' ($(&$PY --version 2>&1))"

# ── 2. Python dependencies ─────────────────────────────────────────────────────
Write-Step "Installing Python dependencies (cryptography)"
& $PY -m pip install cryptography --quiet --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { Write-Err "pip install failed. Try: $PY -m pip install cryptography" }
Write-Ok "cryptography installed"

# ── 3. Build React frontend ────────────────────────────────────────────────────
Write-Step "Building React frontend (app/)"
Push-Location $APP_DIR
npm install --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm install failed in app/" }
npm run build --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm run build failed in app/" }
Pop-Location
Write-Ok "Frontend built → app/dist/"

# ── 4. Install Electron dependencies ──────────────────────────────────────────
Write-Step "Installing Electron dependencies"
Push-Location $ELECTRON_DIR
npm install --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm install failed in windows/electron/" }
Pop-Location
Write-Ok "Electron dependencies installed"

# ── 5. Set up Claude Code hooks ────────────────────────────────────────────────
Write-Step "Configuring Claude Code hooks"
if (-not (Test-Path $HOOKS_DST)) {
    New-Item -ItemType Directory -Force $HOOKS_DST | Out-Null
}

# Copy hook scripts
Copy-Item "$HOOKS_SRC\*.ps1" $HOOKS_DST -Force
Write-Ok "Hook scripts copied to $HOOKS_DST"

# Update ~/.claude/settings.json using Python (avoids PS5.1 JSON limitations)
$updateScript = @"
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
    return f'powershell -NoProfile -NonInteractive -File "{hooks_dir}\\{script}"'

settings['hooks']['PreToolUse']  = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-thinking.ps1')}]}]
settings['hooks']['Stop']        = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-done.ps1')}]}]
settings['hooks']['Notification']= [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-notify.ps1')}]}]

os.makedirs(os.path.dirname(settings_file), exist_ok=True)
with open(settings_file, 'w', encoding='utf-8') as f:
    json.dump(settings, f, indent=2)
print(settings_file)
"@

$written = & $PY -c $updateScript $HOOKS_DST
if ($LASTEXITCODE -ne 0) {
    Write-Host "   WARN Could not auto-update settings.json. Add hooks manually (see INSTALL.md)." -ForegroundColor Yellow
} else {
    Write-Ok "Hooks registered in $written"
}

# ── 6. Optional: add to Windows startup ───────────────────────────────────────
Write-Step "Startup (optional)"
$ans = Read-Host "   Add widget to Windows startup? [y/N]"
if ($ans -match '^[Yy]') {
    $startupDir = [System.Environment]::GetFolderPath('Startup')
    $wsh        = New-Object -ComObject WScript.Shell
    $lnk        = $wsh.CreateShortcut("$startupDir\ClaudeCodeWidget.lnk")
    $lnk.TargetPath       = "cmd.exe"
    $lnk.Arguments        = "/c `"npm start --prefix `"$ELECTRON_DIR`"`""
    $lnk.WorkingDirectory = $ELECTRON_DIR
    $lnk.WindowStyle      = 7   # minimized
    $lnk.Save()
    Write-Ok "Startup shortcut created in $startupDir"
} else {
    Write-Host "   Skipped. Start manually: npm start  (from windows\electron\)" -ForegroundColor Gray
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host "`n===  Installation complete!  ===" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Start the widget:" -ForegroundColor White
Write-Host "    cd `"$ELECTRON_DIR`"" -ForegroundColor Gray
Write-Host "    npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "  Then open Claude Code and the widget will update automatically." -ForegroundColor White
Write-Host ""
