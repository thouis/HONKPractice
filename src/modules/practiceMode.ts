import { onPitchDetected } from './pitchDetector'

// Practice mode: cursor advances only after the user sustains the correct
// pitch within `thresholdCents` for `holdMs` milliseconds.
//
// State machine (per note):
//   need_gap → ready → holding → [advance] → need_gap
//
// After each advance (or on first start) we require MIN_GAP_MS of silence
// (clarity below threshold) before we start accumulating the hold.  This
// ensures repeated notes each require a fresh onset.

const CLARITY_THRESHOLD = 0.9
const MIN_GAP_MS = 150   // ms of silence required between notes

type State = 'need_gap' | 'ready' | 'holding'

let active = false
let thresholdCents = 20
let expectedHz = 0
let holdMs = 300
let state: State = 'need_gap'
let gapStartMs = 0        // when silence window started
let holdStartMs = 0       // when in-range window started
let unsubscribe: (() => void) | null = null
let onAdvance: (() => void) | null = null

export function startPracticeMode(advanceCb: () => void, cents: number): void {
  active = true
  thresholdCents = cents
  onAdvance = advanceCb
  resetToGap()
  unsubscribe = onPitchDetected(handlePitch)
}

export function stopPracticeMode(): void {
  active = false
  unsubscribe?.()
  unsubscribe = null
  onAdvance = null
}

export function setPracticeExpectedPitch(hz: number, noteHoldMs: number): void {
  expectedHz = hz
  holdMs = Math.max(100, noteHoldMs)
  resetToGap()
}

export function setPracticeThreshold(cents: number): void {
  thresholdCents = cents
}

function resetToGap(): void {
  state = 'need_gap'
  gapStartMs = 0
  holdStartMs = 0
}

function handlePitch(hz: number, clarity: number): void {
  if (!active || expectedHz <= 0) return

  const silent = clarity < CLARITY_THRESHOLD || hz <= 0
  const now = performance.now()

  if (state === 'need_gap') {
    if (silent) {
      if (gapStartMs === 0) gapStartMs = now
      if (now - gapStartMs >= MIN_GAP_MS) state = 'ready'
    } else {
      gapStartMs = 0
    }
    return
  }

  if (state === 'ready') {
    if (!silent) {
      const cents = Math.abs(1200 * Math.log2(hz / expectedHz))
      if (cents <= thresholdCents) {
        state = 'holding'
        holdStartMs = now
      }
    }
    return
  }

  // state === 'holding'
  if (silent) {
    state = 'ready'   // wavered — back to ready (gap already satisfied)
    holdStartMs = 0
    return
  }

  const cents = Math.abs(1200 * Math.log2(hz / expectedHz))
  if (cents > thresholdCents) {
    state = 'ready'
    holdStartMs = 0
    return
  }

  if (now - holdStartMs >= holdMs) {
    resetToGap()                // immediately require gap before next note
    onAdvance?.()
  }
}
