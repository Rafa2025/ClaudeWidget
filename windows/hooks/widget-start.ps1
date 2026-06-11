# Claude Code Widget hook — fires on SessionStart, launches widget if not running
$f = "$env:TEMP\claude-widget-port.txt"

# Check if widget is already reachable
if (Test-Path $f) {
    $port = (Get-Content $f -Raw -ErrorAction SilentlyContinue).Trim()
    if ($port) {
        try {
            Invoke-RestMethod `
                -Uri "http://127.0.0.1:$port/api/state" `
                -Method POST `
                -Body '{"state":"idle"}' `
                -ContentType 'application/json' `
                -TimeoutSec 1 | Out-Null
            exit 0
        } catch {}
    }
}

# Not running — find electron and launch
$dirFile = Join-Path $PSScriptRoot "electron-dir.txt"
if (-not (Test-Path $dirFile)) { exit 0 }
$electronDir = (Get-Content $dirFile -Raw).Trim()

$electronExe = Join-Path $electronDir "node_modules\electron\dist\electron.exe"
if (Test-Path $electronExe) {
    Start-Process -FilePath $electronExe -ArgumentList $electronDir -WindowStyle Normal
    exit 0
}

# Fallback: use npm with full path
$npm = "C:\Program Files\nodejs\npm.cmd"
if (Test-Path $npm) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"$npm`" start --prefix `"$electronDir`"" `
        -WindowStyle Hidden
}
