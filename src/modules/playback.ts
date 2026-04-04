import * as Tone from 'tone'
import type { NoteEvent } from '../types'

// Sample notes from FluidR3_GM trombone set
// Filenames use 's' for sharps (e.g. Ds2 = D#2), map to Tone.js note names
const SAMPLE_MAP: Record<string, string> = {
  'A1': 'A1.mp3',  'C2': 'C2.mp3',  'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  'A2': 'A2.mp3',  'C3': 'C3.mp3',  'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  'A3': 'A3.mp3',  'C4': 'C4.mp3',  'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  'A4': 'A4.mp3',  'C5': 'C5.mp3',  'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
}

export type VoiceMode = 'all' | 'lowest' | 'middle' | 'highest'

let sampler: Tone.Sampler | null = null
let timeline: NoteEvent[] = []
let cursorCallbacks: Array<(idx: number) => void> = []
let writtenBpm = 120
let tempoRatio = 1.0
let timelineOffset = 0   // fractionStart of first event; events are scheduled relative to this
let loopEnabled = false
let loopRestEnabled = true   // insert one bar of silence before each repeat
let beatsPerBar = 4
let voiceMode: VoiceMode = 'all'

export function setVoiceMode(mode: VoiceMode): void { voiceMode = mode }

function selectVoiceNotes(midiNotes: number[]): number[] {
  if (midiNotes.length === 0 || voiceMode === 'all') return midiNotes
  const asc = [...midiNotes].sort((a, b) => a - b)
  if (voiceMode === 'lowest')  return [asc[0]]
  if (voiceMode === 'highest') return [asc[asc.length - 1]]
  // middle: true centre for odd, lower-centre for even
  return [asc[Math.floor((asc.length - 1) / 2)]]
}

export function initSampler(baseUrl: string, onLoad: () => void): void {
  const urls: Record<string, string> = {}
  for (const [note, file] of Object.entries(SAMPLE_MAP)) { urls[note] = file }

  sampler = new Tone.Sampler({
    urls,
    baseUrl,
    release: 0.5,
    onload: () => { console.log('Sampler loaded from', baseUrl); onLoad() },
    onerror: (e) => console.error('Sampler load error', e),
  }).toDestination()
}


// Build event timeline from OSMD cursor walk
export function buildTimeline(osmd: import('opensheetmusicdisplay').OpenSheetMusicDisplay): void {
  timeline = []
  const sheet = (osmd as any).Sheet
  writtenBpm = sheet?.SheetPlaybackSetting?.BeatsPerMinute ?? 120

  osmd.cursor.reset()
  let idx = 0
  let prevFraction = -1
  while (!osmd.cursor.iterator.EndReached) {
    const ts: any = osmd.cursor.iterator.CurrentSourceTimestamp
    // If timestamp is null the RealValue will be 0; treat those entries as
    // belonging to the previous timestamp so they don't pile up at t=0.
    const fractionStart: number = ts != null ? (ts.RealValue ?? 0) : prevFraction
    const notes = osmd.cursor.NotesUnderCursor()

    const midiNotes: number[] = []
    let durationFraction = 0

    for (const note of notes ?? []) {
      const n = note as any
      // Skip rests and tie continuations (held notes should not re-trigger).
      if (n.isRest?.()) continue
      const tie = n.NoteTie
      if (tie && tie.StartNote !== n) continue  // this note is the end of a tie
      midiNotes.push(n.halfTone + 12)
      if (durationFraction === 0) {
        durationFraction = n.Length?.RealValue ?? 0.25
      }
    }

    // Merge entries at the same timestamp into a single event to avoid
    // multiple cursor advances firing simultaneously.
    if (fractionStart === prevFraction && timeline.length > 0) {
      const last = timeline[timeline.length - 1]
      // Absorb any new notes into the existing event at this timestamp.
      for (const m of midiNotes) {
        if (!last.midiNotes.includes(m)) last.midiNotes.push(m)
      }
      if (last.durationFraction === 0 && durationFraction > 0) {
        last.durationFraction = durationFraction
      }
      // Update cursorIndex to the latest step at this timestamp so the cursor
      // ends up at the right position after all voices at this beat are processed.
      last.cursorIndex = idx
    } else {
      timeline.push({
        fractionStart,
        durationFraction,
        midiNotes,
        cursorIndex: idx,
        measureIndex: osmd.cursor.iterator.CurrentMeasureIndex,
      })
      prevFraction = fractionStart
    }

    osmd.cursor.next()
    idx++
  }
  osmd.cursor.reset()
  timelineOffset = timeline.length > 0 ? timeline[0].fractionStart : 0
  beatsPerBar = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature?.Numerator ?? 4
}

export function setLoopEnabled(enabled: boolean): void {
  loopEnabled = enabled
}

export function setLoopRestEnabled(enabled: boolean): void {
  loopRestEnabled = enabled
}

export function onCursorAdvance(cb: (idx: number) => void): void {
  cursorCallbacks.push(cb)
}

function scheduleEvents(): void {
  Tone.getTransport().cancel()
  const bpm = writtenBpm * tempoRatio
  Tone.getTransport().bpm.value = bpm
  const secPerBeat = 60 / bpm

  for (const ev of timeline) {
    const offsetSec = (ev.fractionStart - timelineOffset) * secPerBeat
    Tone.getTransport().schedule((time) => {
      const notesToPlay = selectVoiceNotes(ev.midiNotes)
      if (notesToPlay.length > 0 && sampler) {
        const durSec = Math.max(0.05, ev.durationFraction * secPerBeat - 0.02)
        for (const midi of notesToPlay) {
          const freq = Tone.Frequency(midi, 'midi').toFrequency()
          try { sampler.triggerAttackRelease(freq, durSec, time) }
          catch (e) { console.warn('triggerAttackRelease failed for midi', midi, e) }
        }
      }
      Tone.getDraw().schedule(() => {
        cursorCallbacks.forEach(cb => cb(ev.cursorIndex))
      }, time)
    }, offsetSec)
  }

  const transport = Tone.getTransport()
  if (loopEnabled && timeline.length > 0) {
    const last = timeline[timeline.length - 1]
    const lastNoteEndSec = (last.fractionStart - timelineOffset + last.durationFraction) * secPerBeat
    const restSec = loopRestEnabled ? beatsPerBar * secPerBeat : 0
    transport.loop = true
    transport.loopStart = 0
    transport.loopEnd = Math.max(lastNoteEndSec + restSec, 0.1)
  } else {
    transport.loop = false
  }
}

export async function play(): Promise<void> {
  await Tone.start()
  await Tone.loaded()   // wait for all buffers regardless of onload callback
  scheduleEvents()
  Tone.getTransport().start()
}

export function pause(): void {
  Tone.getTransport().pause()
}

export function stop(): void {
  Tone.getTransport().stop()
  Tone.getTransport().cancel()
  Tone.getTransport().position = 0 as any
}

export function setTempoRatio(ratio: number): void {
  tempoRatio = ratio
  const wasRunning = Tone.getTransport().state === 'started'
  if (wasRunning) {
    const pos = Tone.getTransport().position
    stop()
    scheduleEvents()
    Tone.getTransport().start('+0', pos as any)
  } else {
    Tone.getTransport().bpm.value = writtenBpm * tempoRatio
  }
}

export function getWrittenBpm(): number { return writtenBpm }
export function getTempoRatio(): number { return tempoRatio }
export function getTransportState(): string { return Tone.getTransport().state }

// 0–100 linear → dB
export function setMusicVolume(v: number): void {
  if (!sampler) return
  sampler.volume.value = v === 0 ? -Infinity : 20 * Math.log10(v / 100)
}
