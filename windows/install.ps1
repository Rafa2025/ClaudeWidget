# Claude Code Widget - Windows Installer
# Usage: powershell -ExecutionPolicy Bypass -File .\install.ps1
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$REPO_ROOT    = Split-Path -Parent $PSScriptRoot
$ELECTRON_DIR = Join-Path $PSScriptRoot "electron"
$APP_DIR      = Join-Path $REPO_ROOT    "app"
$HOOKS_SRC    = Join-Path $PSScriptRoot "hooks"
$CLAUDE_DIR   = Join-Path $env:USERPROFILE ".claude"
$HOOKS_DST    = Join-Path $CLAUDE_DIR   "hooks"

function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   WARN $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "   ERR $msg" -ForegroundColor Red; [System.Environment]::Exit(1) }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

function Find-Python {
    foreach ($cmd in @('python', 'python3', 'py')) {
        if (where.exe $cmd 2>$null) { return $cmd }
    }
    return $null
}

Write-Host "`n=== Claude Code Widget - Windows Installer ===" -ForegroundColor Magenta

# ── 1. Check / auto-install dependencies ──────────────────────────────────────
Write-Step "Checking dependencies"

$hasWinget = [bool](where.exe winget 2>$null)

if (-not (where.exe node 2>$null)) {
    if ($hasWinget) {
        Write-Host "   Node.js not found. Installing via winget..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
        if (-not (where.exe node 2>$null)) { Write-Err "Node.js installed but not found in PATH. Please restart this terminal and re-run." }
    } else {
        Write-Err "Node.js not found. Install from https://nodejs.org and re-run."
    }
}
Write-Ok "Node.js $(node --version)"
Write-Ok "npm $(npm --version)"

$PY = Find-Python
if (-not $PY) {
    if ($hasWinget) {
        Write-Host "   Python not found. Installing via winget..." -ForegroundColor Yellow
        winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
        $PY = Find-Python
        if (-not $PY) { Write-Err "Python installed but not found in PATH. Please restart this terminal and re-run." }
    } else {
        Write-Err "Python not found. Install from https://www.python.org and enable the Add to PATH option during setup."
    }
}
$pyVer = & $PY --version 2>&1
Write-Ok "Python: $pyVer"

# ── 2. Python dependencies ─────────────────────────────────────────────────────
Write-Step "Installing Python dependencies"
& $PY -m pip install cryptography --quiet --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { Write-Err "pip install failed. Run manually: $PY -m pip install cryptography" }
Write-Ok "cryptography installed"

# ── 3. Build React frontend ────────────────────────────────────────────────────
Write-Step "Building React frontend"
Push-Location $APP_DIR
npm install --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm install failed in app/" }
npm run build --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm run build failed in app/" }
Pop-Location
Write-Ok "Frontend built"

# ── 4. Install Electron ────────────────────────────────────────────────────────
Write-Step "Installing Electron"
Push-Location $ELECTRON_DIR
npm install --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm install failed in windows/electron/" }

# npm postinstall sometimes silently skips the binary download - detect and fix
$electronExe  = Join-Path $ELECTRON_DIR "node_modules\electron\dist\electron.exe"
$electronPath = Join-Path $ELECTRON_DIR "node_modules\electron\path.txt"
if (-not (Test-Path $electronExe)) {
    Write-Host "   Electron binary missing. Downloading now..." -ForegroundColor Yellow
    $electronVer = (Get-Content (Join-Path $ELECTRON_DIR "node_modules\electron\package.json") | ConvertFrom-Json).version
    $zipPath = node -e "const {downloadArtifact}=require('@electron/get');downloadArtifact({version:'$electronVer',artifactName:'electron'}).then(p=>process.stdout.write(p)).catch(e=>{process.stderr.write(e.message);process.exit(1);})"
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "Failed to download Electron binary. Check your internet connection and try again." }
    Expand-Archive -Path $zipPath -DestinationPath (Join-Path $ELECTRON_DIR "node_modules\electron\dist") -Force
    [System.IO.File]::WriteAllText($electronPath, "electron.exe", [System.Text.Encoding]::ASCII)
    Write-Ok "Electron binary downloaded"
}
Pop-Location
Write-Ok "Electron ready"

# ── 5. Configure Claude Code hooks ────────────────────────────────────────────
Write-Step "Configuring Claude Code hooks"
if (-not (Test-Path $HOOKS_DST)) {
    New-Item -ItemType Directory -Force $HOOKS_DST | Out-Null
}
Copy-Item "$HOOKS_SRC\*.ps1" $HOOKS_DST -Force
# Write the electron path so the hook can auto-start the widget
[System.IO.File]::WriteAllText((Join-Path $HOOKS_DST "electron-dir.txt"), $ELECTRON_DIR, [System.Text.Encoding]::UTF8)
Write-Ok "Hook scripts copied"

$updateScript = @"
import json, os, sys

settings_file = os.path.join(os.path.expanduser('~'), '.claude', 'settings.json')
hooks_dir = sys.argv[1]

try:
    with open(settings_file, encoding='utf-8') as f:
        settings = json.load(f)
except Exception:
    settings = {}

if 'hooks' not in settings:
    settings['hooks'] = {}

def cmd(script):
    return 'powershell -NoProfile -NonInteractive -File "' + hooks_dir + '\\' + script + '"'

settings['hooks']['SessionStart'] = [{'hooks': [{'type': 'command', 'command': cmd('widget-start.ps1')}]}]
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
    Write-Warn "Could not auto-update settings.json. Add hooks manually (see INSTALL.md)."
} else {
    Write-Ok "Hooks registered in $written"
}

# ── 6. Add to Windows startup ──────────────────────────────────────────────────
Write-Step "Adding to Windows startup"
$startupDir = [System.Environment]::GetFolderPath('Startup')
$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut("$startupDir\ClaudeCodeWidget.lnk")
$lnk.TargetPath       = "cmd.exe"
$lnk.Arguments        = "/c `"npm start --prefix `"$ELECTRON_DIR`"`""
$lnk.WorkingDirectory = $ELECTRON_DIR
$lnk.WindowStyle      = 7
$lnk.Save()
Write-Ok "Startup shortcut created"

# ── 7. Launch widget ───────────────────────────────────────────────────────────
Write-Step "Launching widget"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start --prefix `"$ELECTRON_DIR`""
Write-Ok "Widget launched"

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host "`n=== Installation complete! ===" -ForegroundColor Magenta
Write-Host ""
Write-Host "  The widget is now running and will start automatically with Windows." -ForegroundColor White
Write-Host "  To start it manually:  npm start  (from $ELECTRON_DIR)" -ForegroundColor Gray
Write-Host ""
