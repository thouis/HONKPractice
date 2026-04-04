import { createToolbar, setScoreTitle } from './ui/toolbar'
import { createControls, updateBpmDisplay, setPlayPauseIcon, type HintsMode } from './ui/controls'
import { createScorePanel, getOsmdContainer, getBeatIndicator } from './ui/scorePanel'
import { openFilePicker } from './modules/scoreLoader'
import { initDisplay, loadAndRender, getOsmd, resetCursor, advanceCursor } from './modules/scoreDisplay'
import { initSampler, buildTimeline, play, pause, stop, setTempoRatio,
         getWrittenBpm, getTempoRatio, getTransportState, onCursorAdvance } from './modules/playback'
import { initMetronome, setMetronomeEnabled, startMetronome, stopMetronome } from './modules/metronome'
import { computeAndRenderHints } from './modules/positionAdvisor'
import { saveScore, loadScore, saveSettings, loadSettings } from './modules/storage'
import { DEFAULT_SCORE_XML } from './data/defaultScore'

let hintsMode: HintsMode = 0
let metronomeOn = false
let scoreLoaded = false

// Module-level so handleStop can reset it without closure issues.
let cursorIdx = 0

export async function initApp(root: HTMLElement): Promise<void> {
  const settings = loadSettings()
  const savedTempoRatio: number = (settings.tempoRatio as number) ?? 1.0
  hintsMode = ((settings.hintsMode as HintsMode) ?? 0)
  metronomeOn = (settings.metronomeOn as boolean) ?? false

  // --- Build DOM ---
  const toolbar = createToolbar(handleLoadScore)
  const scorePanel = createScorePanel()
  const controls = createControls({
    onPlayPause: handlePlayPause,
    onStop: handleStop,
    onTempoChange: handleTempoChange,
    onMetronomeToggle: handleMetronomeToggle,
    onHintsChange: handleHintsChange,
  })

  root.append(toolbar, controls, scorePanel)

  // --- Init subsystems ---
  await initDisplay(getOsmdContainer())
  initMetronome(getBeatIndicator())

  const baseUrl = import.meta.env.BASE_URL + 'samples/trombone/'
  initSampler(baseUrl, () => { console.log('Sampler loaded from', baseUrl) })

  // Advance the OSMD cursor to match the transport position.
  onCursorAdvance((idx) => {
    const osmd = getOsmd()
    if (!osmd) return
    while (cursorIdx < idx) {
      advanceCursor()
      cursorIdx++
    }
  })

  // Load saved score, or fall back to the built-in default.
  const savedXml = loadScore()
  await renderScore(savedXml ?? DEFAULT_SCORE_XML, savedXml ? 'Restored score' : 'C Major Scale')

  handleTempoChange(savedTempoRatio)
}

async function handleLoadScore(): Promise<void> {
  try {
    const xml = await openFilePicker()
    // Try to extract title from the file picker (file input doesn't expose the name easily here,
    // so we read it from the MusicXML work-title element).
    const titleMatch = xml.match(/<work-title>([^<]+)<\/work-title>/)
      ?? xml.match(/<movement-title>([^<]+)<\/movement-title>/)
    const title = titleMatch?.[1] ?? 'Loaded score'
    await renderScore(xml, title)
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
  cursorIdx = 0  // reset cursor tracking index for new score
  buildTimeline(osmd)
  updateBpmDisplay(getWrittenBpm() * getTempoRatio())

  const container = getOsmdContainer()
  computeAndRenderHints(osmd, container, hintsMode)

  const sheet = (osmd as any).Sheet
  const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
  if (metronomeOn) {
    startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
  }
}

async function handlePlayPause(): Promise<void> {
  if (!scoreLoaded) return
  if (getTransportState() === 'started') {
    pause()
    stopMetronome()
    setPlayPauseIcon(false)
  } else {
    await play()
    setPlayPauseIcon(true)
    const osmd = getOsmd()
    const sheet = (osmd as any)?.Sheet
    const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
    if (metronomeOn) {
      startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
    }
  }
}

function handleStop(): void {
  stop()
  stopMetronome()
  resetCursor()
  cursorIdx = 0
  setPlayPauseIcon(false)
}

function handleTempoChange(ratio: number): void {
  setTempoRatio(ratio)
  const bpm = getWrittenBpm() * ratio
  updateBpmDisplay(bpm)
  saveSettings({ tempoRatio: ratio, hintsMode, metronomeOn })
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
  saveSettings({ tempoRatio: getTempoRatio(), hintsMode, metronomeOn })
}

function handleHintsChange(mode: HintsMode): void {
  hintsMode = mode
  const osmd = getOsmd()
  if (osmd) computeAndRenderHints(osmd, getOsmdContainer(), mode)
  saveSettings({ tempoRatio: getTempoRatio(), hintsMode: mode, metronomeOn })
}
