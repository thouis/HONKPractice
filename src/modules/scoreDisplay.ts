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

export async function loadAndRender(xml: string): Promise<void> {
  if (!osmdInstance) throw new Error('Display not initialized')
  await osmdInstance.load(xml)
  osmdInstance.render()
  osmdInstance.enableOrDisableCursors(true)
  osmdInstance.cursor.show()
  osmdInstance.cursor.reset()
}

export function getOsmd() {
  return osmdInstance
}

export function getMeasureCount(): number {
  return (osmdInstance as any)?.Sheet?.SourceMeasures?.length ?? 0
}

export function renderRange(from: number, to: number): void {
  if (!osmdInstance) return
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

// Returns pixel {x, y} for each cursor step index (container-relative).
export function buildCursorPixelPositions(
  container: HTMLElement
): Map<number, {x: number, y: number}> {
  const map = new Map<number, {x: number, y: number}>()
  if (!osmdInstance) return map
  const svgEls = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[]
  if (svgEls.length === 0) return map
  const containerRect = container.getBoundingClientRect()
  const pageWidth: number = (osmdInstance as any).Sheet?.pageWidth ?? 180
  const scaleX = svgEls[0].getBoundingClientRect().width / pageWidth
  const svgRects = svgEls.map(s => s.getBoundingClientRect())

  osmdInstance.cursor.reset()
  let idx = 0
  while (!osmdInstance.cursor.iterator.EndReached) {
    const gnotes: any[] = (osmdInstance.cursor as any).GNotesUnderCursor?.() ?? []
    const refGn = gnotes.find((g: any) => !g.sourceNote?.isRest?.()) ?? gnotes[0]
    const absPos = refGn?.PositionAndShape?.AbsolutePosition
    if (absPos) {
      const pageNum: number =
        refGn?.parentVoiceEntry?.parentStaffEntry?.parentMeasure
          ?.parentMusicSystem?.Parent?.pageNumber ?? 1
      const svgRect = svgRects[pageNum - 1] ?? svgRects[0]
      map.set(idx, {
        x: absPos.x * scaleX + svgRect.left - containerRect.left,
        y: absPos.y * scaleX + svgRect.top  - containerRect.top,
      })
    }
    osmdInstance.cursor.next()
    idx++
  }
  osmdInstance.cursor.reset()
  return map
}
