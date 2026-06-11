# Claude Code Widget hook — fires on Stop, sets widget to "done"
$f = "$env:TEMP\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$port = (Get-Content $f -Raw -ErrorAction SilentlyContinue).Trim()
if (-not $port) { exit 0 }
try {
    Invoke-RestMethod `
        -Uri "http://127.0.0.1:$port/api/state" `
        -Method POST `
        -Body '{"state":"done"}' `
        -ContentType 'application/json' `
        -TimeoutSec 1 | Out-Null
} catch {}
