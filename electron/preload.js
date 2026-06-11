// Preload — bridges Electron IPC to the React app.
// Exposes a webkit-compatible API so App.jsx needs zero changes.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('webkit', {
  messageHandlers: {
    drag:   { postMessage: (msg) => ipcRenderer.send('drag',   msg) },
    answer: { postMessage: (msg) => ipcRenderer.send('answer', msg) },
  }
})
