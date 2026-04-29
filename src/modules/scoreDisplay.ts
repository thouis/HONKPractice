// Dynamic import to code-split the large OSMD bundle
let osmdInstance: import('opensheetmusicdisplay').OpenSheetMusicDisplay | null = null

export async function initDisplay(container: HTMLElement): Promise<void> {
  const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
  osmdInstance = new OpenSheetMusicDisplay(container, {
    autoResize: true,
    followCursor: false,   // we manage scrolling manually so user can scroll freely
    drawingParameters: 'default',
    drawMeasureNumbers: true,
    drawMeasureNumbersOnlyAtSystemStart: true,
  })
}

export async function loadOsmdScore(xml: string): Promise<void> {
  if (!osmdInstance) throw new Error('Display not initialized')
  await osmdInstance.load(xml)
  fixGlissandoStartNotes()
}

// OSMD 1.9.7 bug: addSlur() sets NoteGlissando only on the stop note, but the
// renderer checks it on the start note. Copy the reference to fix rendering.
function fixGlissandoStartNotes(): void {
  const measures: any[] = (osmdInstance as any)?.Sheet?.SourceMeasures ?? []
  for (const measure of measures) {
    for (const staff of measure.VerticalSourceStaffEntryContainers ?? []) {
      for (const entry of staff.StaffEntries ?? []) {
        if (!entry) continue
        for (const ve of entry.VoiceEntries ?? []) {
          for (const note of ve.Notes ?? []) {
            const g = note.NoteGlissando
            if (g && g.StartNote && g.StartNote !== note && !g.StartNote.NoteGlissando) {
              g.StartNote.NoteGlissando = g
            }
          }
        }
      }
    }
  }
}

let renderedFrom = 1
let renderedTo = 9999

export function getRenderedRange(): { from: number; to: number } {
  return { from: renderedFrom, to: renderedTo }
}

export function setLyricsVisible(visible: boolean): void {
  if (!osmdInstance) return
  ;(osmdInstance as any).EngravingRules.RenderLyrics = visible
}

// Returns an appropriate zoom for the current viewport.
// Smaller on touch devices so more measures fit on screen; even smaller in landscape
// where vertical space is the binding constraint.
function scoreZoom(): number {
  if (!window.matchMedia('(pointer: coarse)').matches) return 1.0
  return window.innerWidth > window.innerHeight ? 0.60 : 0.75
}

export function renderOsmdScore(): void {
  if (!osmdInstance) return
  renderedFrom = 1; renderedTo = 9999
  osmdInstance.setOptions({ drawFromMeasureNumber: 1, drawUpToMeasureNumber: 9999 })
  osmdInstance.zoom = scoreZoom()
  osmdInstance.render()
  osmdInstance.enableOrDisableCursors(true)
  osmdInstance.cursor.show()
  osmdInstance.cursor.reset()
}

export async function loadAndRender(xml: string): Promise<void> {
  await loadOsmdScore(xml)
  renderOsmdScore()
}

export function getPartNames(): { index: number; name: string; clef?: 'bass' | 'treble' }[] {
  const instruments: any[] = (osmdInstance as any)?.Sheet?.Instruments ?? []
  return instruments.map((inst, i) => {
    // Read the clef of the first staff's first source measure entry.
    let clef: 'bass' | 'treble' | undefined
    try {
      const clefKey: string = inst.Staves?.[0]?.StaffLines?.[0]?.Clef?.clefType
        ?? inst.Staves?.[0]?.Clef?.clefType
        ?? ''
      if (/bass/i.test(clefKey)) clef = 'bass'
      else if (/treble|violin|G/i.test(clefKey)) clef = 'treble'
    } catch { /* ignore */ }
    return { index: i, name: inst.Name ?? `Part ${i + 1}`, clef }
  })
}

export function setVisibleParts(indices: number[]): void {
  const instruments: any[] = (osmdInstance as any)?.Sheet?.Instruments ?? []
  const all = indices.length === 0 || indices.length === instruments.length
  instruments.forEach((inst, i) => { inst.Visible = all || indices.includes(i) })
}

export function getOsmd() {
  return osmdInstance
}

export function getMeasureCount(): number {
  return (osmdInstance as any)?.Sheet?.SourceMeasures?.length ?? 0
}

export function renderRange(from: number, to: number): void {
  if (!osmdInstance) return
  // OSMD requires a full render before a subset render to correctly handle
  // multi-measure rests and other structural elements.
  if (from > 1) {
    osmdInstance.setOptions({ drawFromMeasureNumber: 1, drawUpToMeasureNumber: 9999 })
    osmdInstance.render()
  }
  renderedFrom = from; renderedTo = to
  osmdInstance.setOptions({ drawFromMeasureNumber: from, drawUpToMeasureNumber: to })
  osmdInstance.render()
  osmdInstance.enableOrDisableCursors(true)
  osmdInstance.cursor.show()
  osmdInstance.cursor.reset()
}

// Scroll the cursor element into view, respecting a manual-scroll suppression window.
let userScrolledAt = 0
const USER_SCROLL_COOLDOWN_MS = 3000

export function initScrollSuppression(): void {
  window.addEventListener('wheel',      () => { userScrolledAt = Date.now() }, { passive: true })
  window.addEventListener('touchmove',  () => { userScrolledAt = Date.now() }, { passive: true })
  window.addEventListener('keydown',    (e) => {
    if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)) {
      userScrolledAt = Date.now()
    }
  })
}

export function scrollCursorIntoView(): void {
  if (Date.now() - userScrolledAt < USER_SCROLL_COOLDOWN_MS) return
  const cursorEl = (osmdInstance?.cursor as any)?.cursorElement as Element | null
  cursorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function resetCursor(): void {
  osmdInstance?.cursor.reset()
}

export function advanceCursor(): void {
  const cursor = osmdInstance?.cursor
  if (!cursor || cursor.iterator.EndReached) return
  cursor.next()
}

// Returns pixel {x, y, height} for each cursor step index (container-relative).
// Uses the cursor element's DOM position so it works regardless of OSMD internals.
export function buildCursorPixelPositions(
  container: HTMLElement
): Map<number, {x: number, y: number, height: number}> {
  const map = new Map<number, {x: number, y: number, height: number}>()
  if (!osmdInstance) return map
  const containerRect = container.getBoundingClientRect()

  osmdInstance.cursor.reset()
  let idx = 0
  while (!osmdInstance.cursor.iterator.EndReached) {
    const cursorEl = (osmdInstance.cursor as any).cursorElement as Element | null
    if (cursorEl) {
      const r = cursorEl.getBoundingClientRect()
      map.set(idx, {
        x: r.left + r.width / 2 - containerRect.left,
        y: r.top  - containerRect.top,
        height: r.height,
      })
    }
    osmdInstance.cursor.next()
    idx++
  }
  osmdInstance.cursor.reset()
  return map
}
