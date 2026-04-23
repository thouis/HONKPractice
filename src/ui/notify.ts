type Severity = 'info' | 'warning' | 'error'

const AUTO_DISMISS_MS: Record<Severity, number> = {
  info:    4000,
  warning: 6000,
  error:   0,    // manual dismiss only
}

const STYLE: Record<Severity, { bg: string; border: string; text: string }> = {
  info:    { bg: '#1e3a5f', border: '#89b4fa', text: '#cdd6f4' },
  warning: { bg: '#3d2e00', border: '#f9e2af', text: '#f9e2af' },
  error:   { bg: '#3d0a16', border: '#f38ba8', text: '#f38ba8' },
}

let container: HTMLElement | null = null

function getContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div')
    container.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:9000;' +
      'display:flex;flex-direction:column;gap:8px;' +
      'max-width:min(360px,90vw);pointer-events:none;'
    document.body.appendChild(container)
  }
  return container
}

export function notify(message: string, severity: Severity = 'info'): void {
  const col = STYLE[severity]

  const toast = document.createElement('div')
  toast.style.cssText =
    `background:${col.bg};border:1px solid ${col.border};color:${col.text};` +
    'border-radius:6px;padding:10px 36px 10px 12px;font-size:0.85rem;line-height:1.4;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.5);pointer-events:auto;position:relative;' +
    'opacity:0;transition:opacity 0.15s ease;'

  const msg = document.createElement('span')
  msg.textContent = message
  toast.appendChild(msg)

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText =
    'position:absolute;top:6px;right:8px;background:none;border:none;' +
    `color:${col.text};opacity:0.6;cursor:pointer;font-size:0.8rem;padding:2px;line-height:1;`
  closeBtn.onclick = dismiss
  toast.appendChild(closeBtn)

  function dismiss() {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 150)
  }

  getContainer().appendChild(toast)
  requestAnimationFrame(() => { toast.style.opacity = '1' })

  const delay = AUTO_DISMISS_MS[severity]
  if (delay > 0) setTimeout(dismiss, delay)
}
