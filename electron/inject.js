// Terminal key injection — platform-specific implementations
const { exec, execFile } = require('child_process')
const fs = require('fs')
const os = require('os')

const IS_WIN   = process.platform === 'win32'
const IS_MAC   = process.platform === 'darwin'
const IS_LINUX = process.platform === 'linux'

// ── Focus helpers ─────────────────────────────────────────────────────────────

function focusLinux(cb) {
  // Try stored XID (written by session-start.sh)
  try {
    const xid = fs.readFileSync('/tmp/claude-terminal-win.txt', 'utf8').trim()
    if (xid) {
      exec(`wmctrl -i -a ${xid}`, (err) => {
        if (!err) { setTimeout(cb, 450); return }
        focusByTitleLinux(cb)
      })
      return
    }
  } catch {}
  focusByTitleLinux(cb)
}

function focusByTitleLinux(cb) {
  const names = ['Claude Code', 'claude', 'Terminal', 'Konsole', 'Alacritty', 'kitty', 'gnome-terminal', 'xterm']
  let i = 0
  const tryNext = () => {
    if (i >= names.length) { setTimeout(cb, 450); return }
    exec(`wmctrl -a "${names[i++]}"`, (err) => { if (err) tryNext(); else setTimeout(cb, 450) })
  }
  tryNext()
}

// ── Type helpers ──────────────────────────────────────────────────────────────

function typeLinux(text) {
  focusLinux(() => {
    // Try xdotool first (cleanest)
    execFile('xdotool', ['type', '--clearmodifiers', '--delay', '15', '--', text], (err) => {
      if (!err) { execFile('xdotool', ['key', 'Return']); return }

      // Fallback: raw X11 via Python (reuses the proven XTest logic)
      const script = `
import ctypes, time, os
x11 = ctypes.CDLL('libX11.so.6')
xt  = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype   = ctypes.c_void_p
x11.XOpenDisplay.argtypes  = [ctypes.c_char_p]
x11.XKeysymToKeycode.restype  = ctypes.c_uint
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XFlush.argtypes        = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xt.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
dpy = x11.XOpenDisplay(os.environ.get('DISPLAY', ':0').encode())
if not dpy: exit(1)
def send(ks):
    kc = x11.XKeysymToKeycode(dpy, ks)
    if kc:
        xt.XTestFakeKeyEvent(dpy, kc, True,  0)
        xt.XTestFakeKeyEvent(dpy, kc, False, 0)
        x11.XFlush(dpy)
        time.sleep(0.015)
for ch in ${JSON.stringify(text)}:
    cp = ord(ch)
    send(cp if 0x20 <= cp <= 0x7e else (0x01000000 | cp))
send(0xff0d)
x11.XCloseDisplay(dpy)
`
      exec(`python3 -c ${JSON.stringify(script)}`)
    })
  })
}

function typeMac(text) {
  exec("osascript -e 'tell application \"Terminal\" to activate'", () => {
    setTimeout(() => {
      // Escape for AppleScript string
      const escaped = text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
      exec(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`, () => {
        // Return key = key code 36
        exec(`osascript -e 'tell application "System Events" to key code 36'`)
      })
    }, 450)
  })
}

function typeWin(text) {
  // PowerShell SendKeys — escapes special SendKeys chars
  const escaped = text
    .replace(/[+^%~()\[\]{}]/g, (c) => `{${c}}`)
  const ps = [
    '[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null',
    `[System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '`"')}~")`,
  ].join('; ')
  exec(`powershell -NoProfile -Command "${ps}"`)
}

// ── Public API ────────────────────────────────────────────────────────────────

function typeText(text) {
  if (!text) return
  if (IS_LINUX) typeLinux(text)
  else if (IS_MAC) typeMac(text)
  else if (IS_WIN) typeWin(text)
}

module.exports = { typeText }
