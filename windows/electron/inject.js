// Terminal key injection — Windows via PowerShell SendKeys
const { exec } = require('child_process')

function typeText(text) {
  if (!text) return
  // Escape special SendKeys control characters
  const escaped = text.replace(/[+^%~()\[\]{}]/g, (c) => `{${c}}`)
  const ps = [
    '[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null',
    `[System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '`"')}~")`,
  ].join('; ')
  exec(`powershell -NoProfile -Command "${ps}"`)
}

module.exports = { typeText }
