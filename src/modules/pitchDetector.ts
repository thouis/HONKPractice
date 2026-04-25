import { PitchDetector } from 'pitchy'

// Vertical pitch-deviation meter rendered near the OSMD cursor.
//
// Layout (canvas coords, y=0 at top):
//   METER_PAD px padding top and bottom
//   Usable height = METER_HEIGHT - 2*METER_PAD = 100px = ±DISPLAY_CENTS range
//   1px ≡ 1¢  (when DISPLAY_CENTS = 50)
//   Centre y = METER_PAD + DISPLAY_CENTS  (= in-tune position)

const METER_WIDTH = 32
const DISPLAY_CENTS = 50          // ± range shown
const METER_PAD = 15              // px above/below usable area
const METER_HEIGHT = METER_PAD * 2 + DISPLAY_CENTS * 2   // 130px

export const CLARITY_THRESHOLD = 0.9

let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let detector: PitchDetector<Float32Array> | null = null
let animId: number | null = null
let meterCanvas: HTMLCanvasElement | null = null
let meterCtx: CanvasRenderingContext2D | null = null
let inputBuffer: Float32Array<ArrayBuffer> | null = null
let micStream: MediaStream | null = null
let expectedHz = 0
let thresholdCents = 20

// Subscribers that receive (pitchHz, clarity) each frame.
type PitchCallback = (hz: number, clarity: number) => void
const pitchListeners: PitchCallback[] = []

export function onPitchDetected(cb: PitchCallback): () => void {
  pitchListeners.push(cb)
  return () => { const i = pitchListeners.indexOf(cb); if (i >= 0) pitchListeners.splice(i, 1) }
}

export function setExpectedPitch(hz: number): void {
  expectedHz = hz
}

export function setPitchMeterThreshold(cents: number): void {
  thresholdCents = cents
}

export function setPitchSensitivity(minDb: number): void {
  if (detector) detector.minVolumeDecibels = minDb
}

// Position the meter to the right of the cursor.
// anchorX/anchorY are container-relative px; cursorH is cursor element height.
export function setPitchMeterAnchor(anchorX: number, anchorY: number, cursorH: number): void {
  if (!meterCanvas) return
  const top = anchorY + cursorH / 2 - METER_HEIGHT / 2
  meterCanvas.style.left = anchorX + 'px'
  meterCanvas.style.top  = top + 'px'
}

export async function startPitchDetection(el: HTMLElement): Promise<void> {
  if (!meterCanvas) {
    meterCanvas = document.createElement('canvas')
    meterCanvas.width  = METER_WIDTH
    meterCanvas.height = METER_HEIGHT
    meterCanvas.style.cssText =
      `position:absolute;left:0;top:0;width:${METER_WIDTH}px;height:${METER_HEIGHT}px;` +
      'pointer-events:none;z-index:20;border-radius:4px;display:none;'
    el.appendChild(meterCanvas)
    meterCtx = meterCanvas.getContext('2d')!
  }
  if (!el.contains(meterCanvas)) el.appendChild(meterCanvas)
  meterCanvas.style.display = ''

  micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  audioCtx = new AudioContext()
  // iOS Safari creates AudioContext in suspended state even from a user gesture.
  if (audioCtx.state === 'suspended') await audioCtx.resume()
  const source = audioCtx.createMediaStreamSource(micStream)
  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 8192   // larger buffer → better low-frequency resolution
  source.connect(analyser)

  inputBuffer = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>
  detector = PitchDetector.forFloat32Array(analyser.fftSize)
  detector.minVolumeDecibels = -30  // ignore noise below -30 dBFS

  animId = requestAnimationFrame(tick)
}

export function stopPitchDetection(): void {
  if (animId !== null) { cancelAnimationFrame(animId); animId = null }
  if (audioCtx) { audioCtx.close(); audioCtx = null }
  micStream?.getTracks().forEach(t => t.stop())
  micStream = null
  analyser = null; detector = null; inputBuffer = null
  if (meterCanvas) { meterCanvas.style.display = 'none' }
}

// OSMD's render() replaces its container's DOM, ejecting the meter canvas.
// Call this after every render when pitch detection may be active.
export function reattachMeterCanvas(el: HTMLElement): void {
  if (!meterCanvas || meterCanvas.style.display === 'none') return
  if (!el.contains(meterCanvas)) el.appendChild(meterCanvas)
}

function centsToY(cents: number): number {
  const clamped = Math.max(-DISPLAY_CENTS, Math.min(DISPLAY_CENTS, cents))
  return METER_PAD + DISPLAY_CENTS - clamped   // sharp → low y, flat → high y
}

function tick(): void {
  animId = requestAnimationFrame(tick)

  if (!analyser || !detector || !inputBuffer || !meterCtx) return

  analyser.getFloatTimeDomainData(inputBuffer)
  const [pitch, clarity] = detector.findPitch(inputBuffer, audioCtx!.sampleRate)
  pitchListeners.forEach(cb => cb(pitch, clarity))

  drawMeter(pitch, clarity)
}

function drawMeter(pitch: number, clarity: number): void {
  const c = meterCtx!
  const W = METER_WIDTH
  const H = METER_HEIGHT
  const centreY = centsToY(0)   // = METER_PAD + DISPLAY_CENTS

  // Background
  c.clearRect(0, 0, W, H)
  c.fillStyle = 'rgba(15,15,25,0.88)'
  c.beginPath()
  c.roundRect(0, 0, W, H, 4)
  c.fill()

  // Target zone
  const zoneH = thresholdCents * 2
  const zoneTop = centreY - thresholdCents
  c.fillStyle = 'rgba(34,197,94,0.25)'
  c.fillRect(2, zoneTop, W - 4, zoneH)
  // zone border lines
  c.strokeStyle = 'rgba(34,197,94,0.6)'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(2, zoneTop);       c.lineTo(W - 2, zoneTop)
  c.moveTo(2, zoneTop + zoneH); c.lineTo(W - 2, zoneTop + zoneH)
  c.stroke()

  // Centre line (in-tune target)
  c.strokeStyle = 'rgba(255,255,255,0.7)'
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(2, centreY)
  c.lineTo(W - 2, centreY)
  c.stroke()

  // Tick marks at ±25¢
  c.strokeStyle = 'rgba(255,255,255,0.25)'
  c.lineWidth = 1
  for (const d of [-25, 25]) {
    const ty = centsToY(d)
    c.beginPath()
    c.moveTo(W * 0.3, ty)
    c.lineTo(W * 0.7, ty)
    c.stroke()
  }

  // Pitch indicator
  if (clarity >= CLARITY_THRESHOLD && expectedHz > 0 && pitch > 0) {
    const cents = 1200 * Math.log2(pitch / expectedHz)
    const absCents = Math.abs(cents)
    const color = absCents <= thresholdCents ? '#22c55e'
                : absCents <= 25            ? '#eab308'
                :                             '#ef4444'

    const iy = centsToY(cents)
    // Glow
    c.shadowColor = color
    c.shadowBlur = 6
    c.fillStyle = color
    c.fillRect(3, iy - 3, W - 6, 6)
    c.shadowBlur = 0

    // Small triangle pointer on the left side
    c.fillStyle = color
    c.beginPath()
    c.moveTo(0, iy - 5)
    c.lineTo(5, iy)
    c.lineTo(0, iy + 5)
    c.closePath()
    c.fill()
  }

  // Sharp/flat labels
  c.fillStyle = 'rgba(255,255,255,0.35)'
  c.font = '8px sans-serif'
  c.textAlign = 'center'
  c.fillText('+', W / 2, METER_PAD - 3)
  c.fillText('−', W / 2, H - 3)
}
