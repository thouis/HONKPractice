export type HintsMode = 0 | 1 | 2  // 0=off, 1=position, 2=position+partial

export interface ControlCallbacks {
  onPlayPause: () => void
  onStop: () => void
  onTempoChange: (ratio: number) => void
  onMetronomeToggle: (on: boolean) => void
  onHintsChange: (mode: HintsMode) => void
  onMicToggle: (on: boolean) => void
  onPracticeToggle: (on: boolean) => void
  onPracticeThresholdChange: (cents: number) => void
}

let bpmDisplay: HTMLSpanElement
let tempoSlider: HTMLInputElement
let playPauseBtn: HTMLButtonElement
let metBtn: HTMLButtonElement
let hintsBtn: HTMLButtonElement
let micBtn: HTMLButtonElement
let practiceBtn: HTMLButtonElement

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

  // --- Mic / pitch detection ---
  micBtn = document.createElement('button')
  micBtn.textContent = 'Mic: OFF'
  micBtn.className = 'btn'
  let micOn = false
  micBtn.onclick = () => {
    micOn = !micOn
    micBtn.textContent = `Mic: ${micOn ? 'ON' : 'OFF'}`
    micBtn.classList.toggle('btn-active', micOn)
    cbs.onMicToggle(micOn)
  }

  // --- Practice mode ---
  practiceBtn = document.createElement('button')
  practiceBtn.textContent = 'Practice: OFF'
  practiceBtn.className = 'btn'
  let practiceOn = false

  const thresholdLabel = document.createElement('label')
  thresholdLabel.textContent = '±'
  thresholdLabel.style.display = 'none'
  const thresholdInput = document.createElement('input')
  thresholdInput.type = 'number'
  thresholdInput.min = '5'
  thresholdInput.max = '50'
  thresholdInput.value = '20'
  thresholdInput.style.cssText = 'width:40px;display:none;'
  const thresholdUnit = document.createElement('span')
  thresholdUnit.textContent = '¢'
  thresholdUnit.style.display = 'none'

  practiceBtn.onclick = () => {
    practiceOn = !practiceOn
    practiceBtn.textContent = `Practice: ${practiceOn ? 'ON' : 'OFF'}`
    practiceBtn.classList.toggle('btn-active', practiceOn)
    thresholdLabel.style.display = practiceOn ? '' : 'none'
    thresholdInput.style.display = practiceOn ? '' : 'none'
    thresholdUnit.style.display = practiceOn ? '' : 'none'
    cbs.onPracticeToggle(practiceOn)
  }
  thresholdInput.oninput = () => {
    cbs.onPracticeThresholdChange(parseInt(thresholdInput.value) || 20)
  }

  bar.append(rewindBtn, playPauseBtn, stopBtn, tempoLabel, tempoSlider, bpmDisplay,
    metBtn, hintsBtn, micBtn, practiceBtn, thresholdLabel, thresholdInput, thresholdUnit)
  return bar
}

export function updateBpmDisplay(bpm: number): void {
  if (bpmDisplay) bpmDisplay.textContent = `${Math.round(bpm)} BPM`
}

export function setPlayPauseIcon(playing: boolean): void {
  if (playPauseBtn) playPauseBtn.textContent = playing ? '⏸' : '▶'
}
