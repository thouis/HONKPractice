import type { FingeringEntry, InstrumentDef } from '../types'
import type { HintsMode } from '../ui/controls'
import type { VoiceMode } from './playback'
import { getRenderedRange } from './scoreDisplay'
import { tromboneDef } from '../data/instruments/trombone'
import { trumpetDef } from '../data/instruments/trumpet'

type OSMD = import('opensheetmusicdisplay').OpenSheetMusicDisplay

function noteToMidi(n: any): number {
  const pt: number = n.ParentStaff?.ParentInstrument?.PlaybackTranspose ?? 0
  return n.halfTone + 12 + pt
}

// Per cursor step: all pitched MIDI notes (concert pitch) sorted DESCENDING.
// Rests / all-rest steps → [0] (sentinel).
function extractMidiChords(osmd: OSMD): number[][] {
  return extractMidiChordsForPart(osmd, null)
}

function extractMidiChordsForPart(osmd: OSMD, partNamePattern: RegExp | null): number[][] {
  const chords: number[][] = []
  osmd.cursor.reset()
  while (!osmd.cursor.iterator.EndReached) {
    const notes = osmd.cursor.NotesUnderCursor()
    const midis: number[] = []
    for (const n of notes ?? []) {
      if ((n as any).isRest?.()) continue
      if (partNamePattern !== null) {
        const instName: string = (n as any).ParentStaff?.ParentInstrument?.Name ?? ''
        if (!partNamePattern.test(instName)) continue
      }
      midis.push(noteToMidi(n as any))
    }
    chords.push(midis.length > 0 ? midis.sort((a, b) => b - a) : [0])
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

function isTieContinuation(srcNote: any): boolean {
  const tie = srcNote?.NoteTie
  return !!(tie && tie.StartNote && tie.StartNote !== srcNote &&
            tie.StartNote.halfTone === srcNote.halfTone)
}

// Measures the true visual height of a glyph using canvas metrics.
const _glyphHeightCache = new Map<number, number>()
function glyphHeight(fontSize: number): number {
  if (_glyphHeightCache.has(fontSize)) return _glyphHeightCache.get(fontSize)!
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `bold ${fontSize}px monospace`
  const m = ctx.measureText('●')
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  _glyphHeightCache.set(fontSize, h)
  return h
}

// Fills a hint div with label + optional partial.
// Trumpet: stacks each character vertically with zero gap, partial in upper-right corner.
// Others: inline label with superscript partial.
function fillHintContent(div: HTMLDivElement, entry: FingeringEntry, instrDef: InstrumentDef, mode: HintsMode): void {
  const showPartial = instrDef.showPartial && mode === 2 && entry.partial !== undefined
  if (instrDef.id === 'trumpet') {
    const fontSize = 9
    const gh = glyphHeight(fontSize)
    const chars = [...entry.label]
    const wrapper = document.createElement('div')
    wrapper.style.cssText = `position:relative;display:inline-block;height:${gh * chars.length}px;`
    if (showPartial) {
      const sup = document.createElement('span')
      const supRight = 8 + Math.round(fontSize * 0.3)  // extra half char-width
      sup.style.cssText = `position:absolute;right:-${supRight}px;top:0;font-size:11px;line-height:1;`
      sup.textContent = String(entry.partial)
      wrapper.appendChild(sup)
    }
    chars.forEach((ch, i) => {
      const span = document.createElement('span')
      span.style.cssText = `position:absolute;left:0;right:0;top:${i * gh}px;text-align:center;line-height:1;font-size:${fontSize}px;`
      span.textContent = ch
      wrapper.appendChild(span)
    })
    div.appendChild(wrapper)
  } else {
    if (showPartial) {
      div.innerHTML = `${entry.label}<sup style="font-size:11px;vertical-align:super;">${entry.partial}</sup>`
    } else {
      div.textContent = entry.label
    }
  }
}

function buildHintDiv(
  gn: any,
  dpPos: number,
  instrDef: InstrumentDef,
  mode: HintsMode,
  container: HTMLElement,
  scaleX: number,
  svgRects: DOMRect[],
  containerRect: DOMRect,
  STAFF_HEIGHT: number,
  HINT_PADDING_PX: number,
  topOffset = 0,
): HTMLDivElement | null {
  const absPos = gn?.PositionAndShape?.AbsolutePosition
  if (!absPos) return null

  const staffTopY: number =
    gn?.parentVoiceEntry?.parentStaffEntry?.parentMeasure
      ?.PositionAndShape?.AbsolutePosition?.y ?? absPos.y
  const pageNum: number =
    gn?.parentVoiceEntry?.parentStaffEntry?.parentMeasure
      ?.parentMusicSystem?.Parent?.pageNumber ?? 1
  const svgRect = svgRects[pageNum - 1] ?? svgRects[0]

  const baseX = absPos.x * scaleX + svgRect.left - containerRect.left
  const staffBottomY = (staffTopY + STAFF_HEIGHT) * scaleX
    + svgRect.top - containerRect.top + HINT_PADDING_PX + topOffset

  const noteMidi = noteToMidi(gn.sourceNote)
  const allPos = validFingerings(noteMidi, instrDef)
  if (allPos.length === 0 || allPos[0].pos === 0) return null
  const entry = allPos.find(e => e.pos === dpPos)
    ?? { pos: dpPos, label: String(dpPos), preferred: true }
  const alts = allPos.filter(e => e.pos !== dpPos)

  const div = document.createElement('div')
  div.className = 'hint-label'
  div.style.cssText = `position:absolute;left:${baseX}px;top:${staffBottomY}px;`
  fillHintContent(div, entry, instrDef, mode)
  if (alts.length) {
    div.title = 'Alt: ' + alts.map(e =>
      e.partial !== undefined ? `${e.label}/${e.partial}` : e.label
    ).join(', ')
  }
  container.appendChild(div)
  div.style.left = `${baseX - div.offsetWidth / 2}px`
  return div
}

let hintDivs: HTMLDivElement[] = []

// 'all' voiceMode: show hints for trombone and trumpet parts independently.
function renderAllPartsHints(
  osmd: OSMD,
  container: HTMLElement,
  mode: HintsMode,
): void {
  const parts = [
    { nameRegex: /trombone/i, instrDef: tromboneDef, topOffset:  0 },
    { nameRegex: /trumpet/i,  instrDef: trumpetDef,  topOffset: -6 },
  ] as const

  const positionsByPart = parts.map(({ nameRegex, instrDef }) =>
    runDP(extractMidiChordsForPart(osmd, nameRegex), instrDef)
  )

  const pageWidth: number = (osmd as any).Sheet?.pageWidth ?? 180
  const svgEls = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[]
  if (svgEls.length === 0) return
  const containerRect = container.getBoundingClientRect()
  const svgRects = svgEls.map(s => s.getBoundingClientRect())
  const scaleX = svgRects[0].width / pageWidth
  const STAFF_HEIGHT = 4
  const HINT_PADDING_PX = 22

  const { from: visFrom, to: visTo } = getRenderedRange()

  osmd.cursor.reset()
  let idx = 0
  while (!osmd.cursor.iterator.EndReached) {
    const measureNum = osmd.cursor.iterator.CurrentMeasureIndex + 1
    if (measureNum < visFrom || measureNum > visTo) {
      osmd.cursor.next(); idx++; continue
    }

    const gnotes: any[] = (osmd.cursor as any).GNotesUnderCursor?.() ?? []

    parts.forEach(({ nameRegex, instrDef, topOffset }, pi) => {
      const dpPos = positionsByPart[pi][idx]
      if (!dpPos || dpPos <= 0) return

      const partGn = gnotes.find((g: any) =>
        !g.sourceNote?.isRest?.() &&
        nameRegex.test(g.sourceNote?.ParentStaff?.ParentInstrument?.Name ?? '') &&
        g.PositionAndShape?.AbsolutePosition != null
      )
      if (!partGn || isTieContinuation(partGn.sourceNote)) return

      const div = buildHintDiv(
        partGn, dpPos, instrDef, mode, container,
        scaleX, svgRects, containerRect, STAFF_HEIGHT, HINT_PADDING_PX, topOffset
      )
      if (div) hintDivs.push(div)
    })

    osmd.cursor.next()
    idx++
  }
  osmd.cursor.reset()
}

export function computeAndRenderHints(
  osmd: OSMD,
  container: HTMLElement,
  mode: HintsMode,
  voiceMode: VoiceMode = 'lowest',
  instrument: InstrumentDef,
): void {
  clearHints()
  if (mode === 0) return

  if (voiceMode === 'all') {
    renderAllPartsHints(osmd, container, mode)
    return
  }

  const chords = extractMidiChords(osmd)
  const dpPositions = runDP(chords, instrument)

  const pageWidth: number = (osmd as any).Sheet?.pageWidth ?? 180
  const svgEls = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[]
  if (svgEls.length === 0) return
  const containerRect = container.getBoundingClientRect()
  const svgRects = svgEls.map(s => s.getBoundingClientRect())
  const scaleX = svgRects[0].width / pageWidth

  const STAFF_HEIGHT = 4
  const HINT_PADDING_PX = 22

  const { from: visFrom, to: visTo } = getRenderedRange()

  osmd.cursor.reset()
  let idx = 0

  while (!osmd.cursor.iterator.EndReached) {
    const measureNum = osmd.cursor.iterator.CurrentMeasureIndex + 1
    if (measureNum < visFrom || measureNum > visTo) {
      osmd.cursor.next(); idx++; continue
    }
    const gnotes: any[] = (osmd.cursor as any).GNotesUnderCursor?.() ?? []
    const chord = chords[idx]
    const dpPos = dpPositions[idx]

    if (dpPos > 0 && chord[chord.length - 1] !== 0 && gnotes.length > 0) {
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
        const asc = [...chord].reverse()  // ascending: asc[0]=lowest
        let targetMidi: number
        if (voiceMode === 'highest') {
          targetMidi = chord[0]
        } else if (voiceMode === 'middle') {
          targetMidi = asc[Math.floor((asc.length - 1) / 2)]
        } else {
          targetMidi = asc[0]
        }
        const isLowest = targetMidi === asc[0]

        // Skip tie continuations — the player is already holding the note.
        const targetGNote = gnotes.find((g: any) =>
          !g.sourceNote?.isRest?.() &&
          noteToMidi(g.sourceNote) === targetMidi
        )
        if (isTieContinuation(targetGNote?.sourceNote)) {
          osmd.cursor.next(); idx++; continue
        }

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
        div.style.cssText = `position:absolute;left:${baseX}px;top:${staffBottomY}px;`
        fillHintContent(div, entry, instrument, mode)
        if (alts.length) {
          div.title = 'Alt: ' + alts.map(e =>
            e.partial !== undefined ? `${e.label}/${e.partial}` : e.label
          ).join(', ')
        }
        container.appendChild(div)
        div.style.left = `${baseX - div.offsetWidth / 2}px`
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
