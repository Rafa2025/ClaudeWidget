// Terminal key injection — macOS via osascript (System Events keystroke).
// Requires a one-time Accessibility permission grant for the widget process
// (System Settings → Privacy & Security → Accessibility).
const { execFile } = require('child_process')
const fs = require('fs')

const FALLBACK_APPS = ['iTerm2', 'Terminal', 'Warp', 'WezTerm', 'Alacritty', 'kitty', 'Ghostty']

function osascript(script, cb) {
  execFile('osascript', ['-e', script], (err) => { if (cb) cb(err) })
}

function focusTerminal(cb) {
  // Prefer the app name stored by session-start.sh
  let stored = ''
  try { stored = fs.readFileSync('/tmp/claude-terminal-app.txt', 'utf8').trim() } catch {}

  const candidates = stored
    ? [stored, ...FALLBACK_APPS.filter((a) => a !== stored)]
    : FALLBACK_APPS
  const list = candidates
    .map((a) => `"${a.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(', ')

  const script = `
tell application "System Events"
  repeat with appName in {${list}}
    if exists (process (contents of appName)) then
      tell process (contents of appName) to set frontmost to true
      exit repeat
    end if
  end repeat
end tell`
  osascript(script, () => setTimeout(cb, 450))
}

function typeText(text) {
  if (!text) return
  focusTerminal(() => {
    const safe = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
    const script = `
tell application "System Events"
  keystroke "${safe}"
  delay 0.1
  keystroke return
end tell`
    osascript(script)
  })
}

module.exports = { typeText }
