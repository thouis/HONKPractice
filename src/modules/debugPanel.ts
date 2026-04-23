// Floating debug log panel — only renders when visible.
// Call debugLog() to append a line; toggleDebugPanel() to show/hide.

const MAX_LINES = 120

let panel: HTMLDivElement | null = null
let logEl: HTMLDivElement | null = null
let lines: string[] = []
let visible = false

function ensurePanel(): void {
  if (panel) return
  panel = document.createElement('div')
  panel.style.cssText =
    'position:fixed;bottom:8px;right:8px;width:420px;max-height:260px;' +
    'background:rgba(10,10,20,0.92);color:#a6e3a1;font:11px/1.4 monospace;' +
    'border-radius:6px;z-index:9999;display:flex;flex-direction:column;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.5);'

  const header = document.createElement('div')
  header.style.cssText =
    'padding:4px 8px;background:rgba(255,255,255,0.07);border-radius:6px 6px 0 0;' +
    'display:flex;justify-content:space-between;align-items:center;cursor:default;'
  header.innerHTML = '<span style="font-weight:bold;color:#cdd6f4">Debug log</span>'

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText =
    'background:none;border:none;color:#cdd6f4;cursor:pointer;font-size:12px;padding:0 2px;'
  closeBtn.onclick = () => toggleDebugPanel()
  header.appendChild(closeBtn)

  logEl = document.createElement('div')
  logEl.style.cssText = 'overflow-y:auto;padding:6px 8px;flex:1;'

  panel.append(header, logEl)
  document.body.appendChild(panel)
}

export function debugLog(msg: string): void {
  const ts = performance.now().toFixed(0)
  lines.push(`[${ts}] ${msg}`)
  if (lines.length > MAX_LINES) lines.shift()
  if (!visible || !logEl) return
  const div = document.createElement('div')
  div.textContent = lines[lines.length - 1]
  logEl.appendChild(div)
  logEl.scrollTop = logEl.scrollHeight
}

export function toggleDebugPanel(): void {
  ensurePanel()
  visible = !visible
  panel!.style.display = visible ? 'flex' : 'none'
  if (visible && logEl) {
    logEl.innerHTML = ''
    for (const line of lines) {
      const div = document.createElement('div')
      div.textContent = line
      logEl.appendChild(div)
    }
    logEl.scrollTop = logEl.scrollHeight
  }
}

export function isDebugVisible(): boolean { return visible }
