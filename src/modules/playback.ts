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

let sampler: Tone.Sampler | null = null
let timeline: NoteEvent[] = []
let cursorCallbacks: Array<(idx: number) => void> = []
let writtenBpm = 120
let tempoRatio = 1.0
let loaded = false

export function isSamplerLoaded(): boolean { return loaded }

export function initSampler(baseUrl: string, onLoad: () => void): void {
  const urls: Record<string, string> = {}
  for (const [note, file] of Object.entries(SAMPLE_MAP)) { urls[note] = file }

  sampler = new Tone.Sampler({
    urls,
    baseUrl,
    release: 0.5,
    onload: () => { loaded = true; onLoad() },
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
  while (!osmd.cursor.iterator.EndReached) {
    const ts: any = osmd.cursor.iterator.CurrentSourceTimestamp
    const fractionStart: number = ts?.RealValue ?? 0
    const notes = osmd.cursor.NotesUnderCursor()

    const midiNotes: number[] = []
    let durationFraction = 0

    for (const note of notes ?? []) {
      if (!(note as any).isRest?.()) {
        midiNotes.push((note as any).halfTone + 12)
        if (durationFraction === 0) {
          durationFraction = (note as any).Length?.RealValue ?? 0.25
        }
      }
    }

    timeline.push({
      fractionStart,
      durationFraction,
      midiNotes,
      cursorIndex: idx,
      measureIndex: osmd.cursor.iterator.CurrentMeasureIndex,
    })

    osmd.cursor.next()
    idx++
  }
  osmd.cursor.reset()
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
    const offsetSec = ev.fractionStart * secPerBeat
    Tone.getTransport().schedule((time) => {
      if (ev.midiNotes.length > 0 && sampler && loaded) {
        const durSec = Math.max(0.05, ev.durationFraction * secPerBeat - 0.02)
        for (const midi of ev.midiNotes) {
          const freq = Tone.Frequency(midi, 'midi').toFrequency()
          sampler.triggerAttackRelease(freq, durSec, time)
        }
      }
      cursorCallbacks.forEach(cb => cb(ev.cursorIndex))
    }, offsetSec)
  }
}

export async function play(): Promise<void> {
  await Tone.start()
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
