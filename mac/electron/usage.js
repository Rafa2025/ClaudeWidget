// Token usage — spawns get-auth.py to read Chrome cookies, then calls claude.ai API
const { execFile } = require('child_process')
const https = require('https')
const path = require('path')
const { app } = require('electron')

const AUTH_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, 'get-auth.py')
  : path.join(__dirname, 'get-auth.py')

function getAuth() {
  return new Promise((resolve) => {
    execFile('python3', [AUTH_SCRIPT], { timeout: 15000 }, (err, stdout) => {
      if (err) { resolve([null, null]); return }
      try {
        const { sk, org } = JSON.parse(stdout.trim())
        resolve(sk && org ? [sk, org] : [null, null])
      } catch { resolve([null, null]) }
    })
  })
}

async function computeUsage() {
  try {
    const [sk, org] = await getAuth()
    if (!sk || !org) return false

    return new Promise((resolve) => {
      const req = https.get({
        hostname: 'claude.ai',
        path: `/api/organizations/${org}/usage`,
        headers: {
          Cookie: `sessionKey=${sk}`,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Origin: 'https://claude.ai',
          Referer: 'https://claude.ai/settings/limits',
          'anthropic-client-platform': 'web_claude_ai',
        }
      }, (res) => {
        let data = ''
        res.on('data', (d) => { data += d })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const sessPct = parseFloat(json.five_hour?.utilization ?? 0)
            const weekPct = parseFloat(json.seven_day?.utilization  ?? 0)
            resolve({ session: { pct: sessPct }, weekly: { pct: weekPct }, ok: true })
          } catch { resolve(false) }
        })
      })
      req.on('error', () => resolve(false))
      req.setTimeout(12000, () => { req.destroy(); resolve(false) })
    })
  } catch { return false }
}

module.exports = { computeUsage }
