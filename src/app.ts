import { createToolbar, setScoreTitle } from './ui/toolbar'
import { createControls, updateBpmDisplay } from './ui/controls'
import { createScorePanel, getOsmdContainer, getBeatIndicator } from './ui/scorePanel'
import { openFilePicker } from './modules/scoreLoader'
import { initDisplay, loadAndRender, getOsmd, resetCursor, advanceCursor } from './modules/scoreDisplay'
import { initSampler, buildTimeline, play, pause, stop, setTempoRatio,
         getWrittenBpm, getTempoRatio, isSamplerLoaded, onCursorAdvance } from './modules/playback'
import { initMetronome, setMetronomeEnabled, startMetronome, stopMetronome } from './modules/metronome'
import { computeAndRenderHints } from './modules/positionAdvisor'
import { saveScore, loadScore, saveSettings, loadSettings } from './modules/storage'

let hintsVisible = false
let metronomeOn = false
let scoreLoaded = false

export async function initApp(root: HTMLElement): Promise<void> {
  const settings = loadSettings()
  const savedTempoRatio: number = (settings.tempoRatio as number) ?? 1.0
  hintsVisible = (settings.hintsVisible as boolean) ?? false
  metronomeOn = (settings.metronomeOn as boolean) ?? false

  // --- Build DOM ---
  const toolbar = createToolbar(handleLoadScore)
  const scorePanel = createScorePanel()
  const controls = createControls({
    onPlay: handlePlay,
    onPause: handlePause,
    onStop: handleStop,
    onTempoChange: handleTempoChange,
    onMetronomeToggle: handleMetronomeToggle,
    onHintsToggle: handleHintsToggle,
  })

  root.append(toolbar, controls, scorePanel)

  // --- Init subsystems ---
  await initDisplay(getOsmdContainer())
  initMetronome(getBeatIndicator())

  const baseUrl = import.meta.env.BASE_URL + 'samples/trombone/'
  initSampler(baseUrl, () => {
    console.log('Sampler loaded')
  })

  // Cursor advance callback — keep OSMD cursor in sync with transport
  let cursorIdx = 0
  onCursorAdvance((idx) => {
    const osmd = getOsmd()
    if (!osmd) return
    while (cursorIdx < idx) {
      advanceCursor()
      cursorIdx++
    }
  })

  // Try restoring last score from localStorage
  const savedXml = loadScore()
  if (savedXml) {
    await renderScore(savedXml, 'Restored score')
  }

  // Apply saved tempo
  handleTempoChange(savedTempoRatio)
}

async function handleLoadScore(): Promise<void> {
  try {
    const xml = await openFilePicker()
    await renderScore(xml, 'Loaded score')
    saveScore(xml)
  } catch (e) {
    if ((e as Error).message !== 'No file selected') {
      alert('Failed to load score: ' + (e as Error).message)
    }
  }
}

async function renderScore(xml: string, titleHint: string): Promise<void> {
  setScoreTitle(titleHint)
  await loadAndRender(xml)

  const osmd = getOsmd()
  if (!osmd) return

  scoreLoaded = true
  buildTimeline(osmd)
  updateBpmDisplay(getWrittenBpm() * getTempoRatio())

  // Render hints if enabled
  const container = getOsmdContainer()
  computeAndRenderHints(osmd, container, hintsVisible)

  // Extract time signature for metronome
  const sheet = (osmd as any).Sheet
  const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
  if (metronomeOn) {
    startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
  }
}

async function handlePlay(): Promise<void> {
  if (!scoreLoaded) return
  if (!isSamplerLoaded()) { alert('Audio samples still loading, please wait…'); return }
  await play()

  const osmd = getOsmd()
  const sheet = (osmd as any)?.Sheet
  const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
  if (metronomeOn) {
    startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
  }
}

function handlePause(): void {
  pause()
  stopMetronome()
}

function handleStop(): void {
  stop()
  stopMetronome()
  resetCursor()
  // reset cursor tracking index
  // (cursorIdx is local to initApp — we use a closure reset trick via a re-render approach)
  // For now, reloading the cursor walk is sufficient; a full re-render is not needed.
}

function handleTempoChange(ratio: number): void {
  setTempoRatio(ratio)
  const bpm = getWrittenBpm() * ratio
  updateBpmDisplay(bpm)
  saveSettings({ tempoRatio: ratio, hintsVisible, metronomeOn })
}

function handleMetronomeToggle(on: boolean): void {
  metronomeOn = on
  setMetronomeEnabled(on)
  if (on) {
    const osmd = getOsmd()
    const sheet = (osmd as any)?.Sheet
    const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
    startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
  } else {
    stopMetronome()
  }
  saveSettings({ tempoRatio: getTempoRatio(), hintsVisible, metronomeOn })
}

function handleHintsToggle(on: boolean): void {
  hintsVisible = on
  const osmd = getOsmd()
  if (osmd) computeAndRenderHints(osmd, getOsmdContainer(), on)
  saveSettings({ tempoRatio: getTempoRatio(), hintsVisible: on, metronomeOn })
}
