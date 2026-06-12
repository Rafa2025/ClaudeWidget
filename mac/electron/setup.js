// First-run self-setup for packaged builds (macOS / Linux).
//
// When the widget is shipped as a standalone app, the recipient never runs
// install.sh — so the app registers its own Claude Code hooks on launch.
// It writes three hook scripts to ~/.claude/hooks/ and merges them into
// ~/.claude/settings.json without disturbing any hooks the user already has.
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const HOOKS = {
  'widget-thinking': `#!/usr/bin/env bash
# Claude Code Widget hook — PreToolUse → "thinking"
PORT_FILE=/tmp/claude-widget-port.txt
PORT=$(sed -n 1p "$PORT_FILE" 2>/dev/null)
TOKEN=$(sed -n 2p "$PORT_FILE" 2>/dev/null)
[ -z "$PORT" ] && exit 0
curl -sf --max-time 1 -X POST "http://127.0.0.1:$PORT/api/state" \\
     -H 'Content-Type: application/json' \\
     -H "X-Widget-Token: $TOKEN" \\
     -d '{"state":"thinking"}' >/dev/null 2>&1 &
`,
  'widget-done': `#!/usr/bin/env bash
# Claude Code Widget hook — Stop → "done"
PORT_FILE=/tmp/claude-widget-port.txt
PORT=$(sed -n 1p "$PORT_FILE" 2>/dev/null)
TOKEN=$(sed -n 2p "$PORT_FILE" 2>/dev/null)
[ -z "$PORT" ] && exit 0
curl -sf --max-time 2 -X POST "http://127.0.0.1:$PORT/api/state" \\
     -H 'Content-Type: application/json' \\
     -H "X-Widget-Token: $TOKEN" \\
     -d '{"state":"done"}' >/dev/null 2>&1
`,
  'widget-notify': `#!/usr/bin/env python3
# Claude Code Widget hook — Notification → "input" with message
import sys, json, urllib.request

PORT_FILE = '/tmp/claude-widget-port.txt'
try:
    with open(PORT_FILE) as f:
        lines = f.read().splitlines()
    port  = lines[0].strip() if lines else ''
    token = lines[1].strip() if len(lines) > 1 else ''
except OSError:
    sys.exit(0)
if not port:
    sys.exit(0)
try:
    data = json.load(sys.stdin)
except Exception:
    data = {}
payload = json.dumps({'state': 'input', 'msg': data.get('message', '')}).encode()
req = urllib.request.Request(
    f'http://127.0.0.1:{port}/api/state', data=payload,
    headers={'Content-Type': 'application/json', 'X-Widget-Token': token},
    method='POST')
try:
    urllib.request.urlopen(req, timeout=2)
except Exception:
    pass
`,
}

const EVENT_FOR = {
  PreToolUse:   'widget-thinking',
  Stop:         'widget-done',
  Notification: 'widget-notify',
}

function ensureHooks() {
  const claudeDir = path.join(os.homedir(), '.claude')
  const hooksDir  = path.join(claudeDir, 'hooks')
  fs.mkdirSync(hooksDir, { recursive: true })

  // Write/refresh the hook scripts (always overwrite our own so updates land)
  for (const [name, body] of Object.entries(HOOKS)) {
    const dest = path.join(hooksDir, name)
    fs.writeFileSync(dest, body, { encoding: 'utf8', mode: 0o755 })
  }

  // Merge into settings.json without clobbering existing hooks
  const settingsFile = path.join(claudeDir, 'settings.json')
  let settings = {}
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) } catch {}
  if (typeof settings !== 'object' || settings === null) settings = {}
  if (!settings.hooks) settings.hooks = {}

  let changed = false
  for (const [event, script] of Object.entries(EVENT_FOR)) {
    const command = path.join(hooksDir, script)
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

// Run once per launch; never let a setup failure stop the widget from opening.
function runFirstRunSetup() {
  try { ensureHooks() } catch (e) { /* non-fatal */ }
}

module.exports = { runFirstRunSetup }
