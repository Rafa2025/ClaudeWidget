// Terminal key injection — Windows
// Primary: inject.py via SendInput (Unicode, reliable, no extra deps)
// Fallback: PowerShell SendKeys (no window focus, best-effort)
const { execFile, exec } = require('child_process')
const path = require('path')
const { app } = require('electron')

const INJECT_PY = app.isPackaged
  ? path.join(process.resourcesPath, 'inject.py')
  : path.join(__dirname, 'inject.py')

const PYTHON_CMDS = ['python', 'python3']

function typeText(text) {
  if (!text) return
  const tryPython = (i) => {
    if (i >= PYTHON_CMDS.length) { fallbackSendKeys(text); return }
    execFile(PYTHON_CMDS[i], [INJECT_PY, text], { timeout: 12000 }, (err) => {
      if (err) tryPython(i + 1)
    })
  }
  tryPython(0)
}

function fallbackSendKeys(text) {
  const escaped = text.replace(/[+^%~()\[\]{}]/g, (c) => `{${c}}`)
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '`"')}~")`,
  ].join('; ')
  exec(`powershell -NoProfile -Command "${ps}"`)
}

module.exports = { typeText }
