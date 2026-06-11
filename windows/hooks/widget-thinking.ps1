# Claude Code Widget hook — fires on PreToolUse, sets widget to "thinking"
$f = "$env:TEMP\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$port = (Get-Content $f -Raw -ErrorAction SilentlyContinue).Trim()
if (-not $port) { exit 0 }
try {
    Invoke-RestMethod `
        -Uri "http://127.0.0.1:$port/api/state" `
        -Method POST `
        -Body '{"state":"thinking"}' `
        -ContentType 'application/json' `
        -TimeoutSec 1 | Out-Null
} catch {}
