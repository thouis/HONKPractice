export interface SettingsCallbacks {
  onMusicVolume: (v: number) => void
  onMetronomeVolume: (v: number) => void
  onPitchSensitivity: (db: number) => void
  onDebugHud: (enabled: boolean) => void
}

let overlay: HTMLElement | null = null
let callbacks: SettingsCallbacks = {
  onMusicVolume: () => {},
  onMetronomeVolume: () => {},
  onPitchSensitivity: () => {},
  onDebugHud: () => {},
}

// ── Public API ───────────────────────────────────────────────────────────────

export function initSettingsPanel(cbs: SettingsCallbacks): void {
  callbacks = cbs
  buildPanel()
}

export function openSettingsPanel(): void {
  if (!overlay) buildPanel()
  overlay!.style.display = 'flex'
}

// ── Build DOM (once) ─────────────────────────────────────────────────────────

function buildPanel(): void {
  overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;' +
    'align-items:center;justify-content:center;z-index:100;'
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  const panel = document.createElement('div')
  panel.style.cssText =
    'background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:20px;' +
    'width:min(400px,92vw);box-shadow:0 8px 32px rgba(0,0,0,0.6);' +
    'display:flex;flex-direction:column;gap:4px;'

  // Header
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;'

  const heading = document.createElement('h2')
  heading.textContent = 'Settings'
  heading.style.cssText = 'margin:0;font-size:1.1rem;color:#89b4fa;'

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText =
    'background:none;border:none;color:#cdd6f4;font-size:1.2rem;cursor:pointer;'
  closeBtn.onclick = close
  header.append(heading, closeBtn)

  // Sliders
  const musicVolumeRow = buildSimpleSlider(
    'Music volume',
    0, 100, 80, 1,
    (v) => callbacks.onMusicVolume(v),
  )

  const metronomeVolumeRow = buildSimpleSlider(
    'Metronome volume',
    0, 100, 70, 1,
    (v) => callbacks.onMetronomeVolume(v),
  )

  const pitchSensitivityRow = buildSliderWithValue(
    'Pitch sensitivity (min dB)',
    -60, -10, -30, 1,
    (v) => callbacks.onPitchSensitivity(v),
  )

  const debugRow = buildCheckbox('Debug HUD (measure/note overlay)', false,
    (v) => callbacks.onDebugHud(v))

  panel.append(header, musicVolumeRow, metronomeVolumeRow, pitchSensitivityRow, debugRow)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)
}

// ── Slider builders ──────────────────────────────────────────────────────────

function buildSliderRow(labelText: string): {
  container: HTMLElement
  labelEl: HTMLElement
  slider: HTMLInputElement
} {
  const container = document.createElement('div')
  container.style.cssText = 'margin-bottom:16px;'

  const topRow = document.createElement('div')
  topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;'

  const labelEl = document.createElement('label')
  labelEl.textContent = labelText
  labelEl.style.cssText = 'font-size:0.88rem;color:#cdd6f4;'

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.style.cssText = 'width:100%;display:block;accent-color:#89b4fa;cursor:pointer;'

  topRow.appendChild(labelEl)
  container.append(topRow, slider)

  return { container, labelEl: topRow, slider }
}

function buildSimpleSlider(
  labelText: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const { container, slider } = buildSliderRow(labelText)

  slider.min = String(min)
  slider.max = String(max)
  slider.value = String(defaultValue)
  slider.step = String(step)

  slider.oninput = () => onChange(Number(slider.value))

  return container
}

function buildSliderWithValue(
  labelText: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'margin-bottom:16px;'

  const topRow = document.createElement('div')
  topRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;'

  const labelEl = document.createElement('label')
  labelEl.textContent = labelText
  labelEl.style.cssText = 'font-size:0.88rem;color:#cdd6f4;'

  const valueDisplay = document.createElement('span')
  valueDisplay.textContent = String(defaultValue)
  valueDisplay.style.cssText =
    'font-size:0.85rem;color:#89b4fa;font-variant-numeric:tabular-nums;min-width:3ch;text-align:right;'

  topRow.append(labelEl, valueDisplay)

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = String(min)
  slider.max = String(max)
  slider.value = String(defaultValue)
  slider.step = String(step)
  slider.style.cssText = 'width:100%;display:block;accent-color:#89b4fa;cursor:pointer;'

  slider.oninput = () => {
    valueDisplay.textContent = slider.value
    onChange(Number(slider.value))
  }

  container.append(topRow, slider)
  return container
}

function buildCheckbox(labelText: string, defaultChecked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px;'

  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = defaultChecked
  cb.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:#89b4fa;'
  cb.onchange = () => onChange(cb.checked)

  const label = document.createElement('label')
  label.textContent = labelText
  label.style.cssText = 'font-size:0.88rem;color:#cdd6f4;cursor:pointer;'
  label.onclick = () => { cb.checked = !cb.checked; onChange(cb.checked) }

  row.append(cb, label)
  return row
}

// ── Close ────────────────────────────────────────────────────────────────────

function close(): void {
  if (overlay) overlay.style.display = 'none'
}
