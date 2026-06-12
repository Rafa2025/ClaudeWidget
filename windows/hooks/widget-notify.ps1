# Claude Code Widget hook — fires on Notification, sets widget to "input" with message
$f = "$env:TEMP\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$lines = @(Get-Content $f -ErrorAction SilentlyContinue)
$port  = if ($lines.Count -ge 1) { ([string]$lines[0]).Trim() } else { $null }
$token = if ($lines.Count -ge 2) { ([string]$lines[1]).Trim() } else { '' }
if (-not $port) { exit 0 }

# Read notification JSON from stdin
$rawStdin = [System.Console]::In.ReadToEnd()
$data = $null
try { $data = $rawStdin | ConvertFrom-Json } catch {}

$msg = ''
if ($data -and $data.message) { $msg = [string]$data.message }

$payload = @{ state = 'input'; msg = $msg } | ConvertTo-Json -Compress

try {
    Invoke-RestMethod `
        -Uri "http://127.0.0.1:$port/api/state" `
        -Method POST `
        -Headers @{ 'X-Widget-Token' = $token } `
        -Body $payload `
        -ContentType 'application/json' `
        -TimeoutSec 1 | Out-Null
} catch {}
