// First-run self-setup for packaged builds (Windows).
//
// When the widget is shipped as a standalone .exe, the recipient never runs
// install.ps1 — so the app registers its own Claude Code hooks on launch.
// It writes PowerShell hook scripts to %USERPROFILE%\.claude\hooks\ and merges
// them into settings.json without disturbing any hooks the user already has.
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const HOOKS = {
  'widget-thinking.ps1': `# Claude Code Widget hook — PreToolUse -> "thinking"
$f = "$env:TEMP\\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$lines = @(Get-Content $f -ErrorAction SilentlyContinue)
$port  = if ($lines.Count -ge 1) { ([string]$lines[0]).Trim() } else { $null }
$token = if ($lines.Count -ge 2) { ([string]$lines[1]).Trim() } else { '' }
if (-not $port) { exit 0 }
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Method POST \`
        -Headers @{ 'X-Widget-Token' = $token } \`
        -Body '{"state":"thinking"}' -ContentType 'application/json' -TimeoutSec 1 | Out-Null
} catch {}
`,
  'widget-done.ps1': `# Claude Code Widget hook — Stop -> "done"
$f = "$env:TEMP\\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$lines = @(Get-Content $f -ErrorAction SilentlyContinue)
$port  = if ($lines.Count -ge 1) { ([string]$lines[0]).Trim() } else { $null }
$token = if ($lines.Count -ge 2) { ([string]$lines[1]).Trim() } else { '' }
if (-not $port) { exit 0 }
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Method POST \`
        -Headers @{ 'X-Widget-Token' = $token } \`
        -Body '{"state":"done"}' -ContentType 'application/json' -TimeoutSec 1 | Out-Null
} catch {}
`,
  'widget-notify.ps1': `# Claude Code Widget hook — Notification -> "input" with message
$f = "$env:TEMP\\claude-widget-port.txt"
if (-not (Test-Path $f)) { exit 0 }
$lines = @(Get-Content $f -ErrorAction SilentlyContinue)
$port  = if ($lines.Count -ge 1) { ([string]$lines[0]).Trim() } else { $null }
$token = if ($lines.Count -ge 2) { ([string]$lines[1]).Trim() } else { '' }
if (-not $port) { exit 0 }
$rawStdin = [System.Console]::In.ReadToEnd()
$data = $null
try { $data = $rawStdin | ConvertFrom-Json } catch {}
$msg = ''
if ($data -and $data.message) { $msg = [string]$data.message }
$payload = @{ state = 'input'; msg = $msg } | ConvertTo-Json -Compress
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Method POST \`
        -Headers @{ 'X-Widget-Token' = $token } \`
        -Body $payload -ContentType 'application/json' -TimeoutSec 1 | Out-Null
} catch {}
`,
}

const EVENT_FOR = {
  PreToolUse:   'widget-thinking.ps1',
  Stop:         'widget-done.ps1',
  Notification: 'widget-notify.ps1',
}

function ensureHooks() {
  const claudeDir = path.join(os.homedir(), '.claude')
  const hooksDir  = path.join(claudeDir, 'hooks')
  fs.mkdirSync(hooksDir, { recursive: true })

  for (const [name, body] of Object.entries(HOOKS)) {
    fs.writeFileSync(path.join(hooksDir, name), body, 'utf8')
  }

  const settingsFile = path.join(claudeDir, 'settings.json')
  let settings = {}
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) } catch {}
  if (typeof settings !== 'object' || settings === null) settings = {}
  if (!settings.hooks) settings.hooks = {}

  const cmd = (script) =>
    'powershell -NoProfile -NonInteractive -File ' +
    path.join(hooksDir, script).replace(/\\/g, '/')

  let changed = false
  for (const [event, script] of Object.entries(EVENT_FOR)) {
    const command = cmd(script)
    const list = settings.hooks[event] || (settings.hooks[event] = [])
    const present = list.some((e) =>
      (e.hooks || []).some((h) => h.command === command))
    if (!present) {
      list.push({ matcher: '', hooks: [{ type: 'command', command }] })
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8')
  }
}

function runFirstRunSetup() {
  try { ensureHooks() } catch (e) { /* non-fatal */ }
}

module.exports = { runFirstRunSetup }
