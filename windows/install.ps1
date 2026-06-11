# Claude Code Widget - Windows Installer
# Fully automated: installs dependencies, builds the app, registers Claude Code
# hooks, adds the widget to startup, and launches it.
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\install.ps1
#Requires -Version 5.1
# 'Continue' (not 'Stop') so native tools writing to stderr (where/npm/winget)
# do not abort the script. Critical cmdlets below use explicit -ErrorAction Stop.
$ErrorActionPreference = 'Continue'

$REPO_ROOT    = Split-Path -Parent $PSScriptRoot
$ELECTRON_DIR = Join-Path $PSScriptRoot "electron"
$APP_DIR      = Join-Path $REPO_ROOT    "app"
$HOOKS_SRC    = Join-Path $PSScriptRoot "hooks"
$CLAUDE_DIR   = Join-Path $env:USERPROFILE ".claude"
$HOOKS_DST    = Join-Path $CLAUDE_DIR   "hooks"
$ELECTRON_EXE = Join-Path $ELECTRON_DIR "node_modules\electron\dist\electron.exe"

function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   WARN $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "   ERR $msg" -ForegroundColor Red; [System.Environment]::Exit(1) }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Existence check via cmd's WHERE so native stderr stays inside cmd (never
# surfaces to PowerShell as a terminating NativeCommandError).
function Test-Exe {
    param([string]$name)
    $p = cmd /c "where $name 2>nul"
    return -not [string]::IsNullOrWhiteSpace($p)
}

function Find-Python {
    foreach ($cmd in @('python', 'python3', 'py')) {
        if (Test-Exe $cmd) { return $cmd }
    }
    return $null
}

Write-Host "`n=== Claude Code Widget - Windows Installer ===" -ForegroundColor Magenta

# -- 1. Check / auto-install dependencies --------------------------------------
Write-Step "Checking dependencies"

$hasWinget = Test-Exe 'winget'

if (-not (Test-Exe 'node')) {
    if ($hasWinget) {
        Write-Host "   Node.js not found. Installing via winget..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
        if (-not (Test-Exe 'node')) { Write-Err "Node.js installed but not found in PATH. Restart this terminal and re-run." }
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
        if (-not $PY) { Write-Err "Python installed but not found in PATH. Restart this terminal and re-run." }
    } else {
        Write-Err "Python not found. Install from https://www.python.org and enable Add to PATH during setup."
    }
}
$pyVer = & $PY --version 2>&1
Write-Ok "Python: $pyVer"

# -- 2. Python dependencies ----------------------------------------------------
Write-Step "Installing Python dependencies"
& $PY -m pip install cryptography --quiet --disable-pip-version-check
if ($LASTEXITCODE -ne 0) {
    Write-Warn "pip install failed - token usage stats may not work. Run manually: $PY -m pip install cryptography"
} else {
    Write-Ok "cryptography installed"
}

# -- 3. Build React frontend ---------------------------------------------------
Write-Step "Building React frontend"
Push-Location $APP_DIR
npm install --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm install failed in app/" }
npm run build --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm run build failed in app/" }
Pop-Location
Write-Ok "Frontend built -> app/dist"

# -- 4. Install Electron -------------------------------------------------------
Write-Step "Installing Electron"
Push-Location $ELECTRON_DIR
npm install --loglevel error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "npm install failed in windows/electron/" }

# npm postinstall sometimes silently skips the binary download - detect and fix
$electronPath = Join-Path $ELECTRON_DIR "node_modules\electron\path.txt"
if (-not (Test-Path $ELECTRON_EXE)) {
    Write-Host "   Electron binary missing. Downloading now..." -ForegroundColor Yellow
    $electronVer = (Get-Content (Join-Path $ELECTRON_DIR "node_modules\electron\package.json") | ConvertFrom-Json).version
    $zipPath = node -e "const {downloadArtifact}=require('@electron/get');downloadArtifact({version:'$electronVer',artifactName:'electron'}).then(p=>process.stdout.write(p)).catch(e=>{process.stderr.write(e.message);process.exit(1);})"
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err "Failed to download Electron binary. Check your internet connection and retry." }
    Expand-Archive -Path $zipPath -DestinationPath (Join-Path $ELECTRON_DIR "node_modules\electron\dist") -Force -ErrorAction Stop
    [System.IO.File]::WriteAllText($electronPath, "electron.exe", [System.Text.Encoding]::ASCII)
    Write-Ok "Electron binary downloaded"
}
Pop-Location
if (-not (Test-Path $ELECTRON_EXE)) { Write-Err "Electron binary still missing at $ELECTRON_EXE" }
Write-Ok "Electron ready"

# -- 5. Configure Claude Code hooks --------------------------------------------
Write-Step "Configuring Claude Code hooks"
if (-not (Test-Path $HOOKS_DST)) { New-Item -ItemType Directory -Force $HOOKS_DST -ErrorAction Stop | Out-Null }
Copy-Item "$HOOKS_SRC\*.ps1" $HOOKS_DST -Force -ErrorAction Stop
# Write the electron dir so the hooks can auto-start the widget
[System.IO.File]::WriteAllText((Join-Path $HOOKS_DST "electron-dir.txt"), $ELECTRON_DIR, [System.Text.Encoding]::UTF8)
Write-Ok "Hook scripts copied to $HOOKS_DST"

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
    # Forward slashes avoid backslash escape issues in Claude Code hook commands
    fwd = hooks_dir.replace('\\', '/')
    return 'powershell -NoProfile -NonInteractive -File ' + fwd + '/' + script

settings['hooks']['SessionStart'] = [{'hooks': [{'type': 'command', 'command': cmd('widget-start.ps1')}]}]
settings['hooks']['PreToolUse']   = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-thinking.ps1')}]}]
settings['hooks']['Stop']         = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-done.ps1')}]}]
settings['hooks']['Notification'] = [{'matcher': '', 'hooks': [{'type': 'command', 'command': cmd('widget-notify.ps1')}]}]

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

# -- 6. Add to Windows startup -------------------------------------------------
# Launch electron.exe directly (a GUI app, so no console window flashes).
Write-Step "Adding to Windows startup"
try {
    $startupDir = [System.Environment]::GetFolderPath('Startup')
    $wsh = New-Object -ComObject WScript.Shell
    $lnk = $wsh.CreateShortcut("$startupDir\ClaudeCodeWidget.lnk")
    $lnk.TargetPath       = $ELECTRON_EXE
    $lnk.Arguments        = "`"$ELECTRON_DIR`""
    $lnk.WorkingDirectory = $ELECTRON_DIR
    $lnk.WindowStyle      = 1
    $lnk.Save()
    Write-Ok "Startup shortcut created"
} catch {
    Write-Warn "Could not create startup shortcut: $($_.Exception.Message)"
}

# -- 7. Launch widget ----------------------------------------------------------
Write-Step "Launching widget"
$portFile = Join-Path $env:TEMP "claude-widget-port.txt"
$alreadyRunning = $false
if (Test-Path $portFile) {
    $port = (Get-Content $portFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($port) {
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Method POST `
                -Body '{"state":"idle"}' -ContentType 'application/json' -TimeoutSec 1 | Out-Null
            $alreadyRunning = $true
        } catch {}
    }
}
if ($alreadyRunning) {
    Write-Ok "Widget already running - signalled it"
} else {
    Start-Process -FilePath $ELECTRON_EXE -ArgumentList "`"$ELECTRON_DIR`"" -WorkingDirectory $ELECTRON_DIR
    Write-Ok "Widget launched"
}

# -- Done ----------------------------------------------------------------------
Write-Host "`n=== Installation complete! ===" -ForegroundColor Magenta
Write-Host ""
Write-Host "  The widget is running and will start automatically with Windows." -ForegroundColor White
Write-Host "  It also auto-starts and updates whenever you open a Claude Code session." -ForegroundColor White
Write-Host ""
Write-Host "  Features:" -ForegroundColor White
Write-Host "    - Live status (thinking / done / needs input) via Claude Code hooks" -ForegroundColor Gray
Write-Host "    - Token usage from claude.ai (log in with Chrome, Edge, or Brave)" -ForegroundColor Gray
Write-Host "    - Type into the widget to send text straight to your Claude session" -ForegroundColor Gray
Write-Host "    - System tray icon: left-click to toggle, right-click to quit" -ForegroundColor Gray
Write-Host ""
Write-Host "  Manual start:  `"$ELECTRON_EXE`" `"$ELECTRON_DIR`"" -ForegroundColor Gray
Write-Host ""
