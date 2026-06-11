// Claude Code Widget — Electron main process
// Cross-platform replacement for widget-window.py
const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require('electron')
const http = require('http')
const https = require('https')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const { PNG } = require('pngjs')

const IS_WIN   = process.platform === 'win32'
const IS_MAC   = process.platform === 'darwin'
const IS_LINUX = process.platform === 'linux'

const WIN_W = 255, WIN_H = 285, MARGIN = 20

const DIST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '../app/dist')

const PORT_FILE = IS_WIN
  ? path.join(os.tmpdir(), 'claude-widget-port.txt')
  : '/tmp/claude-widget-port.txt'

// ── State ─────────────────────────────────────────────────────────────────────
let win          = null
let tray         = null
let httpPort     = 0
let dragOffset   = null
let trayFrames   = []
let trayFrameIdx = 0
let usageCache   = { session: { pct: 0 }, weekly: { pct: 0 } }

// ── Linux: ensure transparency compositing ────────────────────────────────────
if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-transparent-visuals')
}

// ── App ready ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  trayFrames = renderTrayFrames()
  httpPort   = await startServer()
  writePortFile(httpPort)
  startUsagePolling()
  createWindow()
  createTray()
  setInterval(tickTray, 120)   // ~8 fps animation
})

app.on('window-all-closed', (e) => e.preventDefault())  // keep alive in tray
app.on('before-quit', cleanup)

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  win = new BrowserWindow({
    width:       WIN_W,
    height:      WIN_H,
    x:           width  - WIN_W - MARGIN,
    y:           height - WIN_H - 60,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    focusable:   true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
    }
  })

  // Platform-specific always-on-top levels
  if (IS_MAC) {
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else if (IS_WIN) {
    win.setAlwaysOnTop(true, 'screen-saver')
  }

  win.loadURL(`http://127.0.0.1:${httpPort}/`)
}

function applyState(mode, msg = '', opts = []) {
  if (!win || win.isDestroyed()) return
  const safeMode = mode.replace(/['"\\]/g, '').slice(0, 20)
  const safeMsg  = JSON.stringify((msg  || '').slice(0, 200))
  const safeOpts = JSON.stringify(Array.isArray(opts) ? opts : [])
  win.webContents.executeJavaScript(
    `window.setStatus && window.setStatus('${safeMode}', ${safeMsg}, ${safeOpts})`
  ).catch(() => {})
}

// ── IPC — from preload webkit shim ────────────────────────────────────────────
ipcMain.on('drag', (_evt, msg) => {
  if (!win) return
  if (msg === 'quit')     { app.quit(); return }
  if (msg === 'minimize') { win.hide(); return }
  try {
    const [action, sx, sy] = msg.split(',')
    const fx = parseFloat(sx), fy = parseFloat(sy)
    if (action === 'start') {
      const [wx, wy] = win.getPosition()
      dragOffset = [wx - fx, wy - fy]
    } else if (action === 'move' && dragOffset) {
      win.setPosition(Math.round(fx + dragOffset[0]), Math.round(fy + dragOffset[1]))
    }
  } catch {}
})

ipcMain.on('answer', (_evt, text) => {
  if (!text) return
  fs.writeFileSync(path.join(os.tmpdir(), 'claude-ask-response.txt'), text, 'utf8')
  applyState('idle')
})

// ── HTTP server ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png',  '.svg': 'image/svg+xml',  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
}

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer(handleRequest)
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port))
  })
}

function readBody(req, cb) {
  let body = ''
  req.on('data', (d) => { body += d })
  req.on('end', () => cb(body.trim()))
}

function handleRequest(req, res) {
  const url = req.url.split('?')[0]

  // ── GET /api/usage ─────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/usage') {
    const body = Buffer.from(JSON.stringify(usageCache))
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length })
    return res.end(body)
  }

  // ── GET /api/usage/refresh ─────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/usage/refresh') {
    refreshUsage()
    res.writeHead(202, { 'Content-Length': '0' })
    return res.end()
  }

  // ── POST /api/input — type text to terminal ────────────────────────────────
  if (req.method === 'POST' && url === '/api/input') {
    return readBody(req, (text) => {
      if (text) require('./inject').typeText(text)
      res.writeHead(200, { 'Content-Length': '0' })
      res.end()
    })
  }

  // ── POST /api/state — receive state from hooks ─────────────────────────────
  if (req.method === 'POST' && url === '/api/state') {
    return readBody(req, (body) => {
      try {
        const parsed = JSON.parse(body)
        const mode = parsed.state || ''
        const msg  = parsed.msg   || ''
        const opts = parsed.options || []
        if (['idle','thinking','input','done','ask'].includes(mode) && win) {
          if (!win.isVisible()) win.show()
          win.focus()
          applyState(mode, msg, opts)
        } else if (mode === 'quit') {
          app.quit()
        }
      } catch {}
      res.writeHead(200, { 'Content-Length': '0' })
      res.end()
    })
  }

  // ── Static files ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    let filePath = url === '/' ? '/index.html' : url
    const fullPath = path.join(DIST_DIR, filePath)
    // Security guard
    if (!fullPath.startsWith(DIST_DIR)) { res.writeHead(403); return res.end() }

    fs.stat(fullPath, (err) => {
      if (err) {
        // SPA fallback
        const idx = path.join(DIST_DIR, 'index.html')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        fs.createReadStream(idx).pipe(res)
        return
      }
      const ext  = path.extname(fullPath)
      const mime = MIME[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' })
      fs.createReadStream(fullPath).pipe(res)
    })
    return
  }

  res.writeHead(405); res.end()
}

// ── Port file ─────────────────────────────────────────────────────────────────
function writePortFile(port) {
  try { fs.writeFileSync(PORT_FILE, String(port), 'utf8') } catch {}
}

function cleanup() {
  try { fs.unlinkSync(PORT_FILE) } catch {}
}

// ── Usage polling ─────────────────────────────────────────────────────────────
async function refreshUsage() {
  const { computeUsage } = require('./usage')
  const result = await computeUsage()
  if (result) usageCache = result
}

function startUsagePolling() {
  // Retry quickly at startup until first success, then 90s interval
  const delays = [3000, 8000, 20000, 40000]
  let idx = 0
  const tryOnce = async () => {
    const { computeUsage } = require('./usage')
    const result = await computeUsage()
    if (result) {
      usageCache = result
      setInterval(refreshUsage, 90_000)
    } else if (idx < delays.length) {
      setTimeout(tryOnce, delays[idx++])
    } else {
      setInterval(refreshUsage, 90_000)
    }
  }
  setTimeout(tryOnce, delays[idx++])
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(trayFrames[0] || nativeImage.createEmpty())
  tray.setToolTip('Claude Code Widget')

  const menu = Menu.buildFromTemplate([
    { label: 'Show',  click: () => { win.show(); win.focus(); applyState('idle') } },
    { type: 'separator' },
    { label: 'Quit',  click: () => app.quit() },
  ])
  tray.setContextMenu(menu)

  // Linux: left-click to toggle
  if (IS_LINUX) {
    tray.on('click', () => {
      if (win.isVisible()) win.hide()
      else { win.show(); win.focus(); applyState('idle') }
    })
  }
}

function tickTray() {
  if (!tray || trayFrames.length === 0) return
  trayFrameIdx = (trayFrameIdx + 1) % trayFrames.length
  tray.setImage(trayFrames[trayFrameIdx])
}

// ── Pixel-art critter tray frames (pngjs — pure JS, no native deps) ───────────
const BITMAP = [
  '..XXXXXXXXXXX..',
  '..XXXXXXXXXXX..',
  '..XX.XXXXX.XX..',
  '..XX.XXXXX.XX..',
  'XXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXX',
  '..XXXXXXXXXXX..',
  '..XXXXXXXXXXX..',
  '...X.X...X.X...',
  '...X.X...X.X...',
]
const COLS = 15, ROWS = 10
const C_BODY = [217, 119,  87, 255]
const C_ARM  = [196,  97,  67, 255]
const C_LEG  = [196,  97,  67, 255]
const C_EYE  = [255, 240, 230, 255]
const LEG_COLS = new Set([3, 5, 9, 11])
const EYE_COLS = new Set([4, 10])

function renderFrame(dy, cell = 2, size = 32) {
  const png = new PNG({ width: size, height: size })
  png.data.fill(0)   // transparent background

  const ox = Math.floor((size - COLS * cell) / 2)
  const oy = Math.floor((size - ROWS * cell) / 2) + dy

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (BITMAP[r][c] !== 'X') continue

      const isArm = (r === 4 || r === 5) && (c <= 1 || c >= 13)
      const isLeg = r === 8 || r === 9
      const isEye = (r === 2 || r === 3) && EYE_COLS.has(c)

      let col
      if (isArm)                 col = C_ARM
      else if (isLeg && !LEG_COLS.has(c)) continue
      else if (isLeg)            col = C_LEG
      else if (isEye)            col = C_EYE
      else                       col = C_BODY

      for (let dy2 = 0; dy2 < cell; dy2++) {
        for (let dx = 0; dx < cell; dx++) {
          const px = ox + c * cell + dx
          const py = oy + r * cell + dy2
          if (px < 0 || py < 0 || px >= size || py >= size) continue
          const i = (py * size + px) * 4
          png.data[i]     = col[0]
          png.data[i + 1] = col[1]
          png.data[i + 2] = col[2]
          png.data[i + 3] = col[3]
        }
      }
    }
  }

  // Thruster glow (small semi-transparent rect)
  const tx = ox - cell, ty = oy + 3 * cell
  for (let dy2 = 0; dy2 < cell * 3; dy2++) {
    for (let dx = 0; dx < cell; dx++) {
      const px = tx + dx, py = ty + dy2
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      const i = (py * size + px) * 4
      png.data[i] = 217; png.data[i+1] = 119; png.data[i+2] = 87; png.data[i+3] = 140
    }
  }

  return nativeImage.createFromBuffer(PNG.sync.write(png))
}

function renderTrayFrames(n = 12) {
  const frames = []
  for (let i = 0; i < n; i++) {
    const dy = Math.round(Math.sin(2 * Math.PI * i / n) * 2)
    frames.push(renderFrame(dy))
  }
  return frames
}
