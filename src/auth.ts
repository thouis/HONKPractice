// Auth is controlled entirely by two build-time env vars (set in .env.local, never committed):
//   VITE_AUTH_SALT  — per-deployment salt string
//   VITE_AUTH_HASH  — SHA-256(salt + password) as hex
//
// To generate a new hash:
//   node -e "const c=require('crypto'); console.log(c.createHash('sha256').update(SALT+PASSWORD).digest('hex'))"
//
// If either var is absent the gate is skipped in dev and throws in production.

const KEY = 'tp_auth'
const SALT: string = import.meta.env.VITE_AUTH_SALT ?? ''
const EXPECTED: string = import.meta.env.VITE_AUTH_HASH ?? ''

const MIN_HASH_LENGTH = 32  // require at least 32 hex chars (128-bit)

function authConfigured(): boolean {
  return SALT.length >= 8 && EXPECTED.length >= MIN_HASH_LENGTH
}

async function check(pw: string): Promise<boolean> {
  const data = new TextEncoder().encode(SALT + pw.trim().toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === EXPECTED
}

export function isAuthenticated(): boolean {
  if (!authConfigured()) return true  // skip gate if env vars not set (dev fallback)
  return localStorage.getItem(KEY) === EXPECTED.slice(0, 16)
}

export function showAuthGate(): Promise<void> {
  if (!authConfigured()) {
    if (import.meta.env.PROD) throw new Error('VITE_AUTH_SALT and VITE_AUTH_HASH must be set in production')
    console.warn('[auth] VITE_AUTH_SALT/VITE_AUTH_HASH not configured — gate skipped in dev')
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;background:#1e1e2e;display:flex;align-items:center;' +
      'justify-content:center;z-index:9999;font-family:sans-serif;'

    const box = document.createElement('div')
    box.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:16px;' +
      'color:#cdd6f4;text-align:center;'

    const title = document.createElement('div')
    title.textContent = '🎺'
    title.style.fontSize = '3rem'

    const label = document.createElement('label')
    label.textContent = 'Password'
    label.style.cssText = 'font-size:0.85rem;color:#6c7086;letter-spacing:0.05em;text-transform:uppercase;'

    const input = document.createElement('input')
    input.type = 'password'
    input.autocomplete = 'current-password'
    input.style.cssText =
      'background:#313244;border:1px solid #45475a;border-radius:6px;color:#cdd6f4;' +
      'padding:8px 14px;font-size:1rem;outline:none;width:200px;text-align:center;'

    const err = document.createElement('div')
    err.style.cssText = 'font-size:0.8rem;color:#f38ba8;min-height:1em;'

    async function attempt() {
      btn.disabled = true
      if (await check(input.value)) {
        localStorage.setItem(KEY, EXPECTED.slice(0, 16))
        overlay.remove()
        resolve()
      } else {
        err.textContent = 'Try again.'
        input.value = ''
        btn.disabled = false
        input.focus()
      }
    }

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt() })

    const btn = document.createElement('button')
    btn.textContent = 'Enter'
    btn.style.cssText =
      'background:#89b4fa;color:#1e1e2e;border:none;border-radius:6px;' +
      'padding:8px 24px;font-size:0.9rem;cursor:pointer;font-weight:600;'
    btn.onclick = attempt

    box.append(title, label, input, btn, err)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    input.focus()
  })
}
