# Claude Code Widget hook — fires on PreToolUse, sets widget to "thinking"
$f     = "$env:TEMP\claude-widget-port.txt"
$port  = $null
$token = ''

# Try to reach the widget
if (Test-Path $f) {
    $lines = @(Get-Content $f -ErrorAction SilentlyContinue)
    if ($lines.Count -ge 1) { $port  = ([string]$lines[0]).Trim() }
    if ($lines.Count -ge 2) { $token = ([string]$lines[1]).Trim() }
    if ($port) {
        try {
            Invoke-RestMethod `
                -Uri "http://127.0.0.1:$port/api/state" `
                -Method POST `
                -Headers @{ 'X-Widget-Token' = $token } `
                -Body '{"state":"thinking"}' `
                -ContentType 'application/json' `
                -TimeoutSec 1 | Out-Null
            exit 0
        } catch {
            $port = $null
        }
    }
}

# Widget not running — launch via electron.exe directly
$dirFile = Join-Path $PSScriptRoot "electron-dir.txt"
if (-not (Test-Path $dirFile)) { exit 0 }
$electronDir = (Get-Content $dirFile -Raw).Trim()

$electronExe = Join-Path $electronDir "node_modules\electron\dist\electron.exe"
if (Test-Path $electronExe) {
    Start-Process -FilePath $electronExe -ArgumentList $electronDir -WindowStyle Normal
    exit 0
}

$npm = "C:\Program Files\nodejs\npm.cmd"
if (Test-Path $npm) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"$npm`" start --prefix `"$electronDir`"" `
        -WindowStyle Hidden
}
