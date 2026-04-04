export type HintsMode = 0 | 1 | 2  // 0=off, 1=position, 2=position+partial

export type VoiceMode = 'all' | 'lowest' | 'middle' | 'highest'

export interface ControlCallbacks {
  onPlayPause: () => void
  onStop: () => void
  onTempoChange: (ratio: number) => void
  onMetronomeToggle: (on: boolean) => void
  onHintsChange: (mode: HintsMode) => void
  onMicToggle: (on: boolean) => void
  onPracticeToggle: (on: boolean) => void
  onPracticeThresholdChange: (cents: number) => void
  onLoopChange: (enabled: boolean, from: number, to: number) => void
  onLoopRestChange: (enabled: boolean) => void
  onVoiceChange: (mode: VoiceMode) => void
  onSelectClick: () => void
}

let bpmDisplay: HTMLSpanElement
let tempoSlider: HTMLInputElement
let playPauseBtn: HTMLButtonElement
let metBtn: HTMLButtonElement
let hintsBtn: HTMLButtonElement
let micBtn: HTMLButtonElement
let practiceBtn: HTMLButtonElement
let loopBtn: HTMLButtonElement
let loopFromInput: HTMLInputElement
let loopToInput: HTMLInputElement
let loopRangeEls: HTMLElement[]
let selectBtn: HTMLButtonElement
let loopBtnState = false  // mirrors closure loopOn; kept in sync for setLoopUI
void loopBtnState        // suppress unused-read warning — written by setLoopUI/resetLoopControl

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

  // --- Loop ---
  loopBtn = document.createElement('button')
  loopBtn.textContent = 'Loop: OFF'
  loopBtn.className = 'btn'
  let loopOn = false

  loopFromInput = document.createElement('input')
  loopFromInput.type = 'number'
  loopFromInput.min = '1'
  loopFromInput.max = '999'
  loopFromInput.value = '1'
  loopFromInput.style.cssText = 'width:44px;display:none;'
  loopFromInput.title = 'Loop from bar'

  const loopSep = document.createElement('span')
  loopSep.textContent = '–'
  loopSep.style.display = 'none'

  loopToInput = document.createElement('input')
  loopToInput.type = 'number'
  loopToInput.min = '1'
  loopToInput.max = '999'
  loopToInput.value = '999'
  loopToInput.style.cssText = 'width:44px;display:none;'
  loopToInput.title = 'Loop to bar'

  const loopRestBtn = document.createElement('button')
  loopRestBtn.textContent = 'Rest: ON'
  loopRestBtn.className = 'btn btn-active'
  loopRestBtn.style.cssText = 'display:none;font-size:0.8rem;'
  loopRestBtn.title = 'Insert one bar of silence between repeats'
  let loopRestOn = true
  loopRestBtn.onclick = () => {
    loopRestOn = !loopRestOn
    loopRestBtn.textContent = `Rest: ${loopRestOn ? 'ON' : 'OFF'}`
    loopRestBtn.classList.toggle('btn-active', loopRestOn)
    cbs.onLoopRestChange(loopRestOn)
  }

  loopRangeEls = [loopFromInput, loopSep, loopToInput, loopRestBtn]

  const fireLoop = () => {
    if (!loopOn) return
    const from = Math.max(1, parseInt(loopFromInput.value) || 1)
    const to   = Math.max(from, parseInt(loopToInput.value) || from)
    loopToInput.value = String(to)
    cbs.onLoopChange(true, from, to)
  }

  loopBtn.onclick = () => {
    loopOn = !loopOn
    loopBtnState = loopOn
    loopBtn.textContent = `Loop: ${loopOn ? 'ON' : 'OFF'}`
    loopBtn.classList.toggle('btn-active', loopOn)
    loopRangeEls.forEach(el => el.style.display = loopOn ? '' : 'none')
    const from = parseInt(loopFromInput.value) || 1
    const to   = parseInt(loopToInput.value) || 1
    cbs.onLoopChange(loopOn, from, to)
  }
  loopFromInput.onchange = fireLoop
  loopToInput.onchange   = fireLoop

  // --- Voice selector ---
  const VOICE_LABELS: Record<VoiceMode, string> = {
    all: 'Voice: All', lowest: 'Voice: Low', middle: 'Voice: Mid', highest: 'Voice: High',
  }
  const VOICE_CYCLE: VoiceMode[] = ['all', 'lowest', 'middle', 'highest']
  let voiceIdx = 0
  const voiceBtn = document.createElement('button')
  voiceBtn.textContent = VOICE_LABELS['all']
  voiceBtn.className = 'btn'
  voiceBtn.onclick = () => {
    voiceIdx = (voiceIdx + 1) % VOICE_CYCLE.length
    const mode = VOICE_CYCLE[voiceIdx]
    voiceBtn.textContent = VOICE_LABELS[mode]
    voiceBtn.classList.toggle('btn-active', mode !== 'all')
    cbs.onVoiceChange(mode)
  }

  // --- Select range ---
  selectBtn = document.createElement('button')
  selectBtn.textContent = 'Select'
  selectBtn.className = 'btn'
  selectBtn.onclick = cbs.onSelectClick

  bar.append(rewindBtn, playPauseBtn, stopBtn, tempoLabel, tempoSlider, bpmDisplay,
    metBtn, hintsBtn, voiceBtn, micBtn, practiceBtn, thresholdLabel, thresholdInput, thresholdUnit,
    loopBtn, loopFromInput, loopSep, loopToInput, loopRestBtn, selectBtn)
  return bar
}

export function updateBpmDisplay(bpm: number): void {
  if (bpmDisplay) bpmDisplay.textContent = `${Math.round(bpm)} BPM`
}

export function setPlayPauseIcon(playing: boolean): void {
  if (playPauseBtn) playPauseBtn.textContent = playing ? '⏸' : '▶'
}

export type SelectBtnState = 'idle' | 'selecting' | 'active'

export function setSelectBtnState(state: SelectBtnState): void {
  if (!selectBtn) return
  const labels: Record<SelectBtnState, string> = {
    idle:      'Select',
    selecting: 'Cancel',
    active:    'Unselect',
  }
  selectBtn.textContent = labels[state]
  selectBtn.classList.toggle('btn-active', state === 'active')
}

// Sync the loop button + inputs to reflect an externally-applied range.
export function setLoopUI(enabled: boolean, from: number, to: number): void {
  if (!loopBtn) return
  loopBtnState = enabled
  loopBtn.textContent = `Loop: ${enabled ? 'ON' : 'OFF'}`
  loopBtn.classList.toggle('btn-active', enabled)
  loopFromInput.value = String(from)
  loopToInput.value   = String(to)
  loopRangeEls.forEach(el => el.style.display = enabled ? '' : 'none')
}

// Call when a new score is loaded to reset loop range and max bar.
export function resetLoopControl(totalBars: number): void {
  if (!loopBtn) return
  loopBtnState = false
  loopBtn.textContent = 'Loop: OFF'
  loopBtn.classList.remove('btn-active')
  loopFromInput.value = '1'
  loopFromInput.max   = String(totalBars)
  loopToInput.value   = String(totalBars)
  loopToInput.max     = String(totalBars)
  loopRangeEls.forEach(el => el.style.display = 'none')
  // Reset rest button to ON (default)
  const restBtn = loopRangeEls[3] as HTMLButtonElement
  if (restBtn) {
    restBtn.textContent = 'Rest: ON'
    restBtn.classList.add('btn-active')
  }
}
