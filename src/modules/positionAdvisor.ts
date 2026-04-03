import { TROMBONE_POSITIONS, REST_POSITIONS } from '../data/trombonePositions'
import type { PositionEntry } from '../types'

// Walk OSMD cursor and extract ordered MIDI notes (rests get midi=0)
function extractMidiSequence(osmd: import('opensheetmusicdisplay').OpenSheetMusicDisplay): number[] {
  const midi: number[] = []
  osmd.cursor.reset()
  while (!osmd.cursor.iterator.EndReached) {
    const notes = osmd.cursor.NotesUnderCursor()
    if (!notes || notes.length === 0 || notes.every((n: any) => n.isRest())) {
      midi.push(0) // rest
    } else {
      const pitched = notes.find((n: any) => !n.isRest())
      // OSMD halfTone + 12 = standard MIDI. Verify empirically: C4 should be 60.
      midi.push(pitched ? (pitched.halfTone + 12) : 0)
    }
    osmd.cursor.next()
  }
  osmd.cursor.reset()
  return midi
}

function validPositions(midi: number): PositionEntry[] {
  if (midi === 0) return REST_POSITIONS
  return TROMBONE_POSITIONS[midi] ?? []
}

// Dynamic programming: minimise total slide travel
function runDP(midiNotes: number[]): number[] {
  const n = midiNotes.length
  if (n === 0) return []

  const INF = 1e9
  // cost[p] for previous note
  const prevCost = new Array(8).fill(INF)
  const prevFrom: number[][] = Array.from({ length: n }, () => new Array(8).fill(-1))

  for (const e of validPositions(midiNotes[0])) {
    prevCost[e.pos] = 0
  }
  const costTable: number[][] = [prevCost.slice()]

  for (let i = 1; i < n; i++) {
    const curCost = new Array(8).fill(INF)
    for (const e of validPositions(midiNotes[i])) {
      const p = e.pos
      for (const pe of validPositions(midiNotes[i - 1])) {
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

  // Traceback: lowest cost at last note, ties → lower position
  const lastValid = validPositions(midiNotes[n - 1]).map(e => e.pos)
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
  visible: boolean
): void {
  clearHints()
  if (!visible) return

  const midiNotes = extractMidiSequence(osmd)
  const positions = runDP(midiNotes)

  // Walk cursor again to get graphical positions
  osmd.cursor.reset()
  let idx = 0

  // Get the OSMD SVG element and its bounding rect for coordinate mapping
  const svgEl = container.querySelector('svg')
  if (!svgEl) return
  const svgRect = svgEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  // OSMD sheet dimensions in sheet units
  const pageWidth = (osmd as any).Sheet?.pageWidth ?? 1
  const scaleX = svgRect.width / pageWidth

  while (!osmd.cursor.iterator.EndReached) {
    const gnotes: any[] = (osmd.cursor as any).GNotesUnderCursor?.() ?? []
    const pos = positions[idx]

    if (pos > 0 && gnotes.length > 0) {
      const gn = gnotes.find((g: any) => !g.sourceNote?.isRest?.()) ?? gnotes[0]
      const absPos = gn?.PositionAndShape?.AbsolutePosition
      if (absPos) {
        const midi = midiNotes[idx]
        const allPos = validPositions(midi)
        const preferred = allPos.find(e => e.pos === pos)
        const partial = preferred?.partial ?? 0
        const alts = allPos.filter(e => e.pos !== pos)

        const x = absPos.x * scaleX + svgRect.left - containerRect.left
        const y = absPos.y * scaleX + svgRect.top - containerRect.top - 22

        const div = document.createElement('div')
        div.className = 'hint-label'
        div.style.cssText = `position:absolute;left:${x}px;top:${y}px;font-size:10px;color:#1a1a2e;font-weight:bold;pointer-events:none;white-space:nowrap;`
        div.textContent = `${pos}/${partial}`
        if (alts.length) {
          div.title = 'Alt: ' + alts.map(e => `${e.pos}/P${e.partial}`).join(', ')
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
