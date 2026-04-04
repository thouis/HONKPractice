import * as Tone from 'tone'

const DEBUG = false

let clickSynth: Tone.Synth | null = null
let beatIndicator: HTMLElement | null = null
let enabled = false

export function initMetronome(indicator: HTMLElement): void {
  beatIndicator = indicator
  clickSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 },
    volume: -6,
  }).toDestination()
}

export function setMetronomeEnabled(on: boolean): void {
  enabled = on
  if (!on) beatIndicator?.classList.remove('beat-flash')
}

export function isEnabled(): boolean { return enabled }

export function scheduleClick(time: number, isAccent: boolean): void {
  if (DEBUG) console.log('[click] scheduleClick called, clickSynth:', !!clickSynth, 'isAccent:', isAccent, 'time:', time)
  if (!clickSynth) return
  const freq = isAccent ? 1200 : 800
  try {
    clickSynth.triggerAttackRelease(freq, '32n', time)
    if (DEBUG) console.log('[click] triggerAttackRelease succeeded, freq:', freq)
  } catch (e) {
    if (DEBUG) console.error('[click] triggerAttackRelease FAILED:', e)
  }
  Tone.getDraw().schedule(() => {
    beatIndicator?.classList.add('beat-flash')
    setTimeout(() => beatIndicator?.classList.remove('beat-flash'), 80)
  }, time)
}

export function setMetronomeVolume(v: number): void {
  if (!clickSynth) return
  clickSynth.volume.value = v === 0 ? -Infinity : 20 * Math.log10(v / 100)
}
