import type { FingeringEntry, InstrumentDef } from '../types'
import type { HintsMode } from '../ui/controls'
import type { VoiceMode } from './playback'
import { getRenderedRange } from './scoreDisplay'

// Per cursor step: all pitched MIDI notes sorted DESCENDING (highest first).
// Rests / all-rest steps → [0] (sentinel).
function extractMidiChords(
  osmd: import('opensheetmusicdisplay').OpenSheetMusicDisplay
): number[][] {
  const chords: number[][] = []
  osmd.cursor.reset()
  while (!osmd.cursor.iterator.EndReached) {
    const notes = osmd.cursor.NotesUnderCursor()
    const midis: number[] = []
    for (const n of notes ?? []) {
      if (!(n as any).isRest?.()) midis.push((n as any).halfTone + 12)
    }
    chords.push(midis.length > 0
      ? midis.sort((a, b) => b - a)   // highest first
      : [0])
    osmd.cursor.next()
  }
  osmd.cursor.reset()
  return chords
}

function validFingerings(midi: number, instrument: InstrumentDef): FingeringEntry[] {
  if (midi === 0) return instrument.restFingering
  return instrument.fingerings[midi] ?? []
}

// Best individual fingering for a note not in the DP sequence (chord upper notes).
// Returns the preferred entry with the lowest position number, or the first entry.
function bestSingleFingering(midi: number, instrument: InstrumentDef): FingeringEntry | null {
  const entries = validFingerings(midi, instrument)
  if (entries.length === 0 || entries[0].pos === 0) return null
  const preferred = entries.filter(e => e.preferred)
  const pool = preferred.length > 0 ? preferred : entries
  return pool.reduce((a, b) => a.pos <= b.pos ? a : b)
}

// DP on the LOWEST note of each chord (last element after descending sort).
export function runDP(chords: number[][], instrument: InstrumentDef): number[] {
  const lowest = chords.map(c => c[c.length - 1])
  const n = lowest.length
  if (n === 0) return []

  // Compute array size from max pos in instrument fingerings.
  let maxPos = 0
  for (const entries of Object.values(instrument.fingerings)) {
    for (const e of entries) { if (e.pos > maxPos) maxPos = e.pos }
  }
  const sz = maxPos + 1

  const INF = 1e9
  const prevFrom: number[][] = Array.from({ length: n }, () => new Array(sz).fill(-1))
  const prevCost = new Array(sz).fill(INF)

  for (const e of validFingerings(lowest[0], instrument)) {
    prevCost[e.pos] = instrument.penalty(lowest[0], e)
  }
  const costTable: number[][] = [prevCost.slice()]

  for (let i = 1; i < n; i++) {
    const curCost = new Array(sz).fill(INF)
    for (const e of validFingerings(lowest[i], instrument)) {
      const p = e.pos
      for (const pe of validFingerings(lowest[i - 1], instrument)) {
        const pp = pe.pos
        const c = costTable[i - 1][pp] + instrument.distance(pe, e) + instrument.penalty(lowest[i], e)
        if (c < curCost[p] || (c === curCost[p] && pp < prevFrom[i][p])) {
          curCost[p] = c
          prevFrom[i][p] = pp
        }
      }
    }
    costTable.push(curCost)
  }

  const lastValid = validFingerings(lowest[n - 1], instrument).map(e => e.pos)
  if (lastValid.length === 0) return new Array(n).fill(0)
  let bestP = lastValid.reduce((a, b) =>
    costTable[n - 1][a] <= costTable[n - 1][b] ? a : b)

  const result: number[] = new Array(n)
  result[n - 1] = bestP
  for (let i = n - 1; i > 0; i--) {
    bestP = prevFrom[i][bestP]
    result[i - 1] = bestP
  }
  return result
}


let hintDivs: HTMLDivElement[] = []

export function computeAndRenderHints(
  osmd: import('opensheetmusicdisplay').OpenSheetMusicDisplay,
  container: HTMLElement,
  mode: HintsMode,
  voiceMode: VoiceMode = 'lowest',
  instrument: InstrumentDef,
): void {
  clearHints()
  if (mode === 0) return

  const chords = extractMidiChords(osmd)
  const dpPositions = runDP(chords, instrument)   // one DP position per step, for the lowest note

  const pageWidth: number = (osmd as any).Sheet?.pageWidth ?? 180
  const svgEls = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[]
  if (svgEls.length === 0) return
  const containerRect = container.getBoundingClientRect()
  const svgRects = svgEls.map(s => s.getBoundingClientRect())
  const scaleX = svgRects[0].width / pageWidth

  const STAFF_HEIGHT = 4   // OSMD staff-space units, top line → bottom line
  const HINT_PADDING_PX = 4

  const { from: visFrom, to: visTo } = getRenderedRange()

  osmd.cursor.reset()
  let idx = 0

  while (!osmd.cursor.iterator.EndReached) {
    // CurrentMeasureIndex is 0-based; rendered range is 1-based.
    const measureNum = osmd.cursor.iterator.CurrentMeasureIndex + 1
    if (measureNum < visFrom || measureNum > visTo) {
      osmd.cursor.next(); idx++; continue
    }
    const gnotes: any[] = (osmd.cursor as any).GNotesUnderCursor?.() ?? []
    const chord = chords[idx]            // sorted descending (highest first)
    const dpPos = dpPositions[idx]       // DP-chosen position for the lowest note

    // Only render if there's at least one pitched note and DP produced a result.
    if (dpPos > 0 && chord[chord.length - 1] !== 0 && gnotes.length > 0) {
      // Use a graphical note with a valid AbsolutePosition for layout info.
      // GNotesUnderCursor() includes hidden-part notes whose AbsolutePosition is null.
      const refGn = gnotes.find((g: any) =>
        !g.sourceNote?.isRest?.() && g.PositionAndShape?.AbsolutePosition != null
      ) ?? gnotes.find((g: any) => g.PositionAndShape?.AbsolutePosition != null)
      const absPos = refGn?.PositionAndShape?.AbsolutePosition
      if (absPos) {
        const staffTopY: number =
          refGn?.parentVoiceEntry?.parentStaffEntry?.parentMeasure
            ?.PositionAndShape?.AbsolutePosition?.y ?? absPos.y
        const pageNum: number =
          refGn?.parentVoiceEntry?.parentStaffEntry?.parentMeasure
            ?.parentMusicSystem?.Parent?.pageNumber ?? 1
        const svgRect = svgRects[pageNum - 1] ?? svgRects[0]

        const baseX = absPos.x * scaleX + svgRect.left - containerRect.left
        const staffBottomY = (staffTopY + STAFF_HEIGHT) * scaleX
          + svgRect.top - containerRect.top + HINT_PADDING_PX

        // Select a single note to hint based on voice mode.
        // chord is sorted descending: chord[0]=highest, chord[last]=lowest.
        const asc = [...chord].reverse()  // ascending: asc[0]=lowest
        let targetMidi: number
        if (voiceMode === 'highest') {
          targetMidi = chord[0]
        } else if (voiceMode === 'middle') {
          targetMidi = asc[Math.floor((asc.length - 1) / 2)]
        } else {
          targetMidi = asc[0]  // 'all' and 'lowest' both show lowest
        }
        const isLowest = targetMidi === asc[0]

        let entry: FingeringEntry, alts: FingeringEntry[]
        if (isLowest) {
          const allPos = validFingerings(targetMidi, instrument)
          entry = allPos.find(e => e.pos === dpPos)
            ?? { pos: dpPos, label: String(dpPos), preferred: true }
          alts = allPos.filter(e => e.pos !== dpPos)
        } else {
          const best = bestSingleFingering(targetMidi, instrument)
          if (!best) { osmd.cursor.next(); idx++; continue }
          entry = best
          alts = validFingerings(targetMidi, instrument).filter(e => e.pos !== best.pos)
        }

        const div = document.createElement('div')
        div.className = 'hint-label'
        div.style.cssText = `position:absolute;left:${baseX}px;top:${staffBottomY}px;font-size:18px;color:#1a1a2e;font-weight:bold;pointer-events:none;white-space:nowrap;`
        if (instrument.showPartial && mode === 2 && entry.partial !== undefined) {
          div.innerHTML = `${entry.label}<sup style="font-size:11px;vertical-align:super;">${entry.partial}</sup>`
        } else {
          div.textContent = entry.label
        }
        if (alts.length) {
          div.title = 'Alt: ' + alts.map(e =>
            e.partial !== undefined ? `${e.label}/${e.partial}` : e.label
          ).join(', ')
        }
        container.appendChild(div)
        hintDivs.push(div)
      }
    }

    osmd.cursor.next()
    idx++
  }
  osmd.cursor.reset()
}

export function clearHints(): void {
  hintDivs.forEach(d => d.remove())
  hintDivs = []
}
