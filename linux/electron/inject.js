// Terminal key injection — Linux via xdotool (with X11/XTest fallback)
const { exec, execFile } = require('child_process')
const fs = require('fs')

function focusTerminal(cb) {
  // Try XID stored by session-start.sh first
  try {
    const xid = fs.readFileSync('/tmp/claude-terminal-win.txt', 'utf8').trim()
    if (xid) {
      exec(`wmctrl -i -a ${xid}`, (err) => {
        if (!err) { setTimeout(cb, 450); return }
        focusByTitle(cb)
      })
      return
    }
  } catch {}
  focusByTitle(cb)
}

function focusByTitle(cb) {
  const names = ['Claude Code', 'claude', 'Terminal', 'Konsole', 'Alacritty', 'kitty', 'gnome-terminal', 'xterm']
  let i = 0
  const tryNext = () => {
    if (i >= names.length) { setTimeout(cb, 450); return }
    exec(`wmctrl -a "${names[i++]}"`, (err) => { if (err) tryNext(); else setTimeout(cb, 450) })
  }
  tryNext()
}

function typeText(text) {
  if (!text) return
  focusTerminal(() => {
    // Try xdotool first (cleanest approach)
    execFile('xdotool', ['type', '--clearmodifiers', '--delay', '15', '--', text], (err) => {
      if (!err) { execFile('xdotool', ['key', 'Return']); return }

      // Fallback: raw X11 via Python XTest
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

module.exports = { typeText }
