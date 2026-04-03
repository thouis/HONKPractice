import * as Tone from 'tone'

let clickSynth: Tone.Synth | null = null
let sequence: Tone.Sequence | null = null
let beatIndicator: HTMLElement | null = null
let enabled = false

export function initMetronome(indicator: HTMLElement): void {
  beatIndicator = indicator
  clickSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.01 },
    volume: -6,
  }).toDestination()
}

export function setMetronomeEnabled(on: boolean): void {
  enabled = on
  if (!on) {
    sequence?.stop()
    sequence?.dispose()
    sequence = null
    beatIndicator?.classList.remove('beat-flash')
  }
}

export function startMetronome(bpm: number, numerator: number): void {
  if (!enabled || !clickSynth) return
  stopMetronome()

  Tone.getTransport().bpm.value = bpm

  const beats = Array.from({ length: numerator }, (_, i) => i)
  sequence = new Tone.Sequence(
    (time, beat) => {
      const freq = beat === 0 ? 1200 : 800
      clickSynth!.triggerAttackRelease(freq, '32n', time)
      Tone.getDraw().schedule(() => {
        beatIndicator?.classList.add('beat-flash')
        setTimeout(() => beatIndicator?.classList.remove('beat-flash'), 80)
      }, time)
    },
    beats,
    '4n'
  )
  sequence.start(0)
}

export function stopMetronome(): void {
  sequence?.stop()
  sequence?.dispose()
  sequence = null
}

export function isEnabled(): boolean { return enabled }
