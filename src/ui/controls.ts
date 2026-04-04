export type HintsMode = 0 | 1 | 2  // 0=off, 1=position, 2=position+partial

export interface ControlCallbacks {
  onPlayPause: () => void
  onStop: () => void
  onTempoChange: (ratio: number) => void
  onMetronomeToggle: (on: boolean) => void
  onHintsChange: (mode: HintsMode) => void
}

let bpmDisplay: HTMLSpanElement
let tempoSlider: HTMLInputElement
let playPauseBtn: HTMLButtonElement
let metBtn: HTMLButtonElement
let hintsBtn: HTMLButtonElement

export function createControls(cbs: ControlCallbacks): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'controls-bar'

  // --- Transport ---
  const rewindBtn = document.createElement('button')
  rewindBtn.textContent = '⏮'
  rewindBtn.className = 'btn'
  rewindBtn.onclick = cbs.onStop

  playPauseBtn = document.createElement('button')
  playPauseBtn.textContent = '▶'
  playPauseBtn.className = 'btn'
  playPauseBtn.onclick = cbs.onPlayPause

  const stopBtn = document.createElement('button')
  stopBtn.textContent = '⏹'
  stopBtn.className = 'btn'
  stopBtn.onclick = cbs.onStop

  // --- Tempo ---
  const tempoLabel = document.createElement('label')
  tempoLabel.textContent = 'Tempo: '
  bpmDisplay = document.createElement('span')
  bpmDisplay.id = 'bpm-display'
  bpmDisplay.textContent = '120 BPM'
  tempoSlider = document.createElement('input')
  tempoSlider.type = 'range'
  tempoSlider.min = '30'
  tempoSlider.max = '150'
  tempoSlider.value = '100'
  tempoSlider.style.width = '120px'
  tempoSlider.oninput = () => {
    const ratio = parseInt(tempoSlider.value) / 100
    cbs.onTempoChange(ratio)
  }

  // --- Metronome ---
  metBtn = document.createElement('button')
  metBtn.textContent = 'Met: OFF'
  metBtn.className = 'btn'
  let metOn = false
  metBtn.onclick = () => {
    metOn = !metOn
    metBtn.textContent = `Met: ${metOn ? 'ON' : 'OFF'}`
    metBtn.classList.toggle('btn-active', metOn)
    cbs.onMetronomeToggle(metOn)
  }

  // --- Hints (3-state cycle: off → pos → pos+partial → off) ---
  hintsBtn = document.createElement('button')
  hintsBtn.className = 'btn'
  let hintsMode: HintsMode = 0
  const HINTS_LABELS = ['Hints: OFF', 'Hints: pos', 'Hints: pos+∂']
  hintsBtn.textContent = HINTS_LABELS[0]
  hintsBtn.onclick = () => {
    hintsMode = ((hintsMode + 1) % 3) as HintsMode
    hintsBtn.textContent = HINTS_LABELS[hintsMode]
    hintsBtn.classList.toggle('btn-active', hintsMode > 0)
    cbs.onHintsChange(hintsMode)
  }

  bar.append(rewindBtn, playPauseBtn, stopBtn, tempoLabel, tempoSlider, bpmDisplay, metBtn, hintsBtn)
  return bar
}

export function updateBpmDisplay(bpm: number): void {
  if (bpmDisplay) bpmDisplay.textContent = `${Math.round(bpm)} BPM`
}

export function setPlayPauseIcon(playing: boolean): void {
  if (playPauseBtn) playPauseBtn.textContent = playing ? '⏸' : '▶'
}
