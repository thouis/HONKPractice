import { createToolbar, setScoreTitle } from './ui/toolbar'
import { createControls, updateBpmDisplay, setPlayPauseIcon, type HintsMode } from './ui/controls'
import { createScorePanel, getOsmdContainer, getBeatIndicator } from './ui/scorePanel'
import { openFilePicker } from './modules/scoreLoader'
import { initDisplay, loadAndRender, getOsmd, resetCursor, advanceCursor } from './modules/scoreDisplay'
import { initSampler, buildTimeline, play, pause, stop, setTempoRatio,
         getWrittenBpm, getTempoRatio, getTransportState, onCursorAdvance } from './modules/playback'
import { initMetronome, setMetronomeEnabled, startMetronome, stopMetronome } from './modules/metronome'
import { computeAndRenderHints } from './modules/positionAdvisor'
import { startPitchDetection, stopPitchDetection, setExpectedPitch,
         setPitchMeterAnchor, setPitchMeterThreshold } from './modules/pitchDetector'
import { startPracticeMode, stopPracticeMode, setPracticeExpectedPitch, setPracticeThreshold } from './modules/practiceMode'
import { saveScore, loadScore, saveSettings, loadSettings } from './modules/storage'
import { DEFAULT_SCORE_XML } from './data/defaultScore'

let hintsMode: HintsMode = 0
let metronomeOn = false
let scoreLoaded = false
let micOn = false
let practiceOn = false

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
    onMicToggle: handleMicToggle,
    onPracticeToggle: handlePracticeToggle,
    onPracticeThresholdChange: handlePracticeThresholdChange,
  })

  root.append(toolbar, controls, scorePanel)

  // --- Init subsystems ---
  await initDisplay(getOsmdContainer())
  initMetronome(getBeatIndicator())

  const baseUrl = import.meta.env.BASE_URL + 'samples/trombone/'
  initSampler(baseUrl, () => { console.log('Sampler loaded from', baseUrl) })

  // Advance the OSMD cursor to match the transport position.
  // In practice mode the cursor is owned by pitch detection; suppress here.
  onCursorAdvance((idx) => {
    if (practiceOn) return
    const osmd = getOsmd()
    if (!osmd) return
    while (cursorIdx < idx) {
      advanceCursor()
      cursorIdx++
    }
    updateExpectedPitch()
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

// Returns Hz of the LOWEST pitched note under cursor, or 0.
function currentNoteHz(): number {
  const osmd = getOsmd()
  if (!osmd) return 0
  const notes = osmd.cursor.NotesUnderCursor()
  const pitched = (notes ?? []).filter((n: any) => !n.isRest?.())
  if (pitched.length === 0) return 0
  const lowestMidi = Math.min(...pitched.map((n: any) => n.halfTone + 12))
  return 440 * Math.pow(2, (lowestMidi - 69) / 12)
}

// Reposition the pitch meter to the right of the current OSMD cursor element.
function updateMeterAnchor(): void {
  const osmd = getOsmd()
  if (!osmd) return
  const cursorEl = (osmd.cursor as any).cursorElement as Element | null
  if (!cursorEl) return
  const containerRect = getOsmdContainer().getBoundingClientRect()
  const r = cursorEl.getBoundingClientRect()
  setPitchMeterAnchor(
    r.right - containerRect.left + 6,
    r.top  - containerRect.top,
    r.height
  )
}

// Returns hold time in ms for the current note.
// Uses ~50% of the written note duration, clamped to 150–400ms so it feels
// responsive without being too easy on fast passages.
function currentNoteHoldMs(): number {
  const osmd = getOsmd()
  if (!osmd) return 250
  const notes = osmd.cursor.NotesUnderCursor()
  const first = (notes ?? []).find((n: any) => !n.isRest?.()) as any
  const durationFraction: number = first?.Length?.RealValue ?? 0.25
  const bpm = getWrittenBpm() * getTempoRatio()
  const fullMs = durationFraction * (60 / bpm) * 1000
  return Math.min(400, Math.max(150, fullMs * 0.5))
}

function updateExpectedPitch(): void {
  const hz = (micOn || practiceOn) ? currentNoteHz() : 0
  setExpectedPitch(hz)
  if (practiceOn) setPracticeExpectedPitch(hz, currentNoteHoldMs())
  updateMeterAnchor()
}

async function handleMicToggle(on: boolean): Promise<void> {
  micOn = on
  if (on) {
    try {
      await startPitchDetection(getOsmdContainer())
      updateExpectedPitch()
    } catch (e) {
      alert('Microphone access denied: ' + (e as Error).message)
      micOn = false
    }
  } else if (!practiceOn) {
    stopPitchDetection()
    setExpectedPitch(0)
  }
}

function handlePracticeThresholdChange(cents: number): void {
  setPracticeThreshold(cents)
  setPitchMeterThreshold(cents)
}

async function handlePracticeToggle(on: boolean): Promise<void> {
  practiceOn = on
  if (on) {
    if (!micOn) {
      try {
        await startPitchDetection(getOsmdContainer())
      } catch (e) {
        alert('Microphone access denied: ' + (e as Error).message)
        practiceOn = false
        return
      }
    }
    const initialThreshold = 20
    setPitchMeterThreshold(initialThreshold)
    const hz = currentNoteHz()
    setExpectedPitch(hz)
    setPracticeExpectedPitch(hz, currentNoteHoldMs())
    updateMeterAnchor()
    startPracticeMode(practiceAdvance, initialThreshold)
  } else {
    stopPracticeMode()
    if (!micOn) {
      stopPitchDetection()
      setExpectedPitch(0)
    }
  }
}

function practiceAdvance(): void {
  const osmd = getOsmd()
  if (!osmd || osmd.cursor.iterator.EndReached) return
  advanceCursor()
  cursorIdx++
  // Skip rests automatically (they don't require pitch input).
  while (!osmd.cursor.iterator.EndReached) {
    const notes = osmd.cursor.NotesUnderCursor()
    const hasRealNote = (notes ?? []).some((n: any) => !n.isRest?.())
    if (hasRealNote) break
    advanceCursor()
    cursorIdx++
  }
  updateExpectedPitch()
}
