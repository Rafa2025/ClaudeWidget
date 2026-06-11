# Claude Code Widget hook — fires on PreToolUse, sets widget to "thinking"
$f    = "$env:TEMP\claude-widget-port.txt"
$port = $null

# Try to reach the widget
if (Test-Path $f) {
    $port = (Get-Content $f -Raw -ErrorAction SilentlyContinue).Trim()
    try {
        Invoke-RestMethod `
            -Uri "http://127.0.0.1:$port/api/state" `
            -Method POST `
            -Body '{"state":"thinking"}' `
            -ContentType 'application/json' `
            -TimeoutSec 1 | Out-Null
        exit 0
    } catch {
        $port = $null
    }
}

# Widget not running — auto-start it
$dirFile = Join-Path $PSScriptRoot "electron-dir.txt"
if (Test-Path $dirFile) {
    $electronDir = (Get-Content $dirFile -Raw).Trim()
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm start --prefix `"$electronDir`"" `
        -WindowStyle Hidden
}
