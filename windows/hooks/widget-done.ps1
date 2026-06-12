# Claude Code Widget hook — fires on Stop, sets widget to "done"
$f = "$env:TEMP\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$lines = @(Get-Content $f -ErrorAction SilentlyContinue)
$port  = if ($lines.Count -ge 1) { ([string]$lines[0]).Trim() } else { $null }
$token = if ($lines.Count -ge 2) { ([string]$lines[1]).Trim() } else { '' }
if (-not $port) { exit 0 }
try {
    Invoke-RestMethod `
        -Uri "http://127.0.0.1:$port/api/state" `
        -Method POST `
        -Headers @{ 'X-Widget-Token' = $token } `
        -Body '{"state":"done"}' `
        -ContentType 'application/json' `
        -TimeoutSec 1 | Out-Null
} catch {}
