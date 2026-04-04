import { TROMBONE_POSITIONS, REST_POSITIONS } from '../data/trombonePositions'
import type { PositionEntry } from '../types'
import type { HintsMode } from '../ui/controls'

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

function validPositions(midi: number): PositionEntry[] {
  if (midi === 0) return REST_POSITIONS
  return TROMBONE_POSITIONS[midi] ?? []
}

// Best individual position for a note not in the DP sequence (chord upper notes).
// Returns the preferred entry with the lowest position number, or the first entry.
function bestSinglePosition(midi: number): PositionEntry | null {
  const entries = validPositions(midi)
  if (entries.length === 0 || entries[0].pos === 0) return null
  const preferred = entries.filter(e => e.preferred)
  const pool = preferred.length > 0 ? preferred : entries
  return pool.reduce((a, b) => a.pos <= b.pos ? a : b)
}

// DP on the LOWEST note of each chord (last element after descending sort).
function runDP(chords: number[][]): number[] {
  const lowest = chords.map(c => c[c.length - 1])
  const n = lowest.length
  if (n === 0) return []

  const INF = 1e9
  const prevFrom: number[][] = Array.from({ length: n }, () => new Array(8).fill(-1))
  const prevCost = new Array(8).fill(INF)

  for (const e of validPositions(lowest[0])) prevCost[e.pos] = 0
  const costTable: number[][] = [prevCost.slice()]

  for (let i = 1; i < n; i++) {
    const curCost = new Array(8).fill(INF)
    for (const e of validPositions(lowest[i])) {
      const p = e.pos
      for (const pe of validPositions(lowest[i - 1])) {
        const pp = pe.pos
        const c = costTable[i - 1][pp] + Math.abs(p - pp)
        if (c < curCost[p] || (c === curCost[p] && pp < prevFrom[i][p])) {
          curCost[p] = c
          prevFrom[i][p] = pp
        }
      }
    }
    costTable.push(curCost)
  }

  const lastValid = validPositions(lowest[n - 1]).map(e => e.pos)
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

const LINE_HEIGHT_PX = 14  // vertical spacing between stacked hints

let hintDivs: HTMLDivElement[] = []

export function computeAndRenderHints(
  osmd: import('opensheetmusicdisplay').OpenSheetMusicDisplay,
  container: HTMLElement,
  mode: HintsMode
): void {
  clearHints()
  if (mode === 0) return

  const chords = extractMidiChords(osmd)
  const dpPositions = runDP(chords)   // one DP position per step, for the lowest note

  const pageWidth: number = (osmd as any).Sheet?.pageWidth ?? 180
  const svgEls = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[]
  if (svgEls.length === 0) return
  const containerRect = container.getBoundingClientRect()
  const svgRects = svgEls.map(s => s.getBoundingClientRect())
  const scaleX = svgRects[0].width / pageWidth

  const STAFF_HEIGHT = 4   // OSMD staff-space units, top line → bottom line
  const HINT_PADDING_PX = 4

  osmd.cursor.reset()
  let idx = 0

  while (!osmd.cursor.iterator.EndReached) {
    const gnotes: any[] = (osmd.cursor as any).GNotesUnderCursor?.() ?? []
    const chord = chords[idx]            // sorted descending (highest first)
    const dpPos = dpPositions[idx]       // DP-chosen position for the lowest note

    // Only render if there's at least one pitched note and DP produced a result.
    if (dpPos > 0 && chord[chord.length - 1] !== 0 && gnotes.length > 0) {
      // Use any non-rest graphical note for position/page info.
      const refGn = gnotes.find((g: any) => !g.sourceNote?.isRest?.()) ?? gnotes[0]
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

        // Render one hint per note in the chord.
        // chord[0] = highest, chord[last] = lowest.
        // Row 0 is closest to the staff (highest note), row N-1 is furthest (lowest).
        chord.forEach((midi, row) => {
          let pos: number
          let partial: number
          let alts: PositionEntry[]

          if (row === chord.length - 1) {
            // Lowest note: use DP-chosen position.
            pos = dpPos
            const allPos = validPositions(midi)
            const preferred = allPos.find(e => e.pos === pos)
            partial = preferred?.partial ?? 0
            alts = allPos.filter(e => e.pos !== pos)
          } else {
            // Upper chord notes: individually best position.
            const best = bestSinglePosition(midi)
            if (!best) return
            pos = best.pos
            partial = best.partial
            alts = validPositions(midi).filter(e => e.pos !== pos)
          }

          const y = staffBottomY + row * LINE_HEIGHT_PX

          const div = document.createElement('div')
          div.className = 'hint-label'
          div.style.cssText = `position:absolute;left:${baseX}px;top:${y}px;font-size:11px;color:#1a1a2e;font-weight:bold;pointer-events:none;white-space:nowrap;`
          if (mode === 2) {
            div.innerHTML = `${pos}<sup style="font-size:7px;vertical-align:super;">${partial}</sup>`
          } else {
            div.textContent = `${pos}`
          }
          if (alts.length) {
            div.title = 'Alt: ' + alts.map(e => `${e.pos}/${e.partial}`).join(', ')
          }
          container.appendChild(div)
          hintDivs.push(div)
        })
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
